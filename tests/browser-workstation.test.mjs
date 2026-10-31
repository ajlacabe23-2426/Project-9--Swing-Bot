import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {PaperStore} from '../src/store.mjs';
import {MARKET_DATA_SCHEMA} from '../src/market-intelligence.mjs';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function eventually(check,description,limit=15000){
  const until=Date.now()+limit;
  let last;
  while(Date.now()<until){
    try{if(await check())return;}catch(error){last=error;}
    await pause(120);
  }
  throw new Error('Timed out waiting for '+description+(last?' ('+last.message+')':''));
}
function dataset(){
  const bars=[],date=new Date('2026-01-01T00:00:00.000Z');
  let price=100;
  while(bars.length<90){
    date.setUTCDate(date.getUTCDate()+1);
    if([0,6].includes(date.getUTCDay()))continue;
    const open=price,close=open*1.0015,high=Math.max(open,close)*1.004,low=Math.min(open,close)*0.996;
    bars.push({date:date.toISOString().slice(0,10),open,high,low,close,volume:100000+bars.length*50});
    price=close;
  }
  const latest=bars.at(-1),priorHigh=Math.max(...bars.slice(-21,-1).map(bar=>bar.high));
  latest.close=priorHigh*1.01;
  latest.high=latest.close*1.004;
  latest.low=Math.min(latest.low,latest.open,latest.close);
  latest.volume=190000;
  return {schema:MARKET_DATA_SCHEMA,symbol:'TEST',currency:'USD',source:'Synthetic browser test',
    mode:'HISTORICAL',sourceAsOf:latest.date,priceAdjustment:'VENDOR_ADJUSTED',bars};
}

async function connectCDP(port){
  let target;
  await eventually(async()=>{
    const res=await fetch('http://127.0.0.1:'+port+'/json/list');
    const pages=await res.json();
    target=pages.find(item=>item.type==='page'&&item.url.includes('/workstation.html'));
    return !!target?.webSocketDebuggerUrl;
  },'Chrome DevTools page target');
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    ws.addEventListener('open',resolve,{once:true});
    ws.addEventListener('error',reject,{once:true});
  });
  let seq=0;
  const pending=new Map(),exceptions=[],assetFailures=[];
  ws.addEventListener('message',event=>{
    let item;
    try{item=JSON.parse(String(event.data));}catch{return;}
    if(item.method==='Runtime.exceptionThrown')exceptions.push(item.params.exceptionDetails.text);
    if(item.method==='Network.responseReceived'&&/\.(m?js|css)(?:\?|$)/.test(item.params.response.url)&&item.params.response.status>=400)assetFailures.push(item.params.response.url);
    if(!item.id)return;
    const cb=pending.get(item.id);
    if(!cb)return;
    pending.delete(item.id);
    if(item.error)cb.reject(new Error(JSON.stringify(item.error)));
    else cb.resolve(item.result);
  });
  const command=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++seq;
    pending.set(id,{resolve,reject});
    ws.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{
    const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.text||'Browser evaluation failed');
    return result.result?.value;
  };
  await command('Runtime.enable');
  return {evaluate,command,exceptions,assetFailures,close:()=>ws.close()};
}

test('real headless Chromium operates loopback workstation and preserves state when refresh is stale',
  {skip:process.env.RUN_BROWSER_ACCEPTANCE!=='1',timeout:90000},
  async()=>{
    const dir=await mkdtemp(join(tmpdir(),'project9-browser-'));
    const port=47000+Math.floor(Math.random()*1500);
    const base='http://127.0.0.1:'+port;
    const source=dataset();
    let market=structuredClone(source),chrome=null,connection=null,app=null;
    try{
      app=await createApp({
        port,
        store:new PaperStore(join(dir,'paper.json')),
        marketFetcher:async()=>structuredClone(market)
      });
      await new Promise((resolve,reject)=>app.once('error',reject).listen(port,'127.0.0.1',resolve));
      chrome=spawn(process.env.CHROME_BIN||'google-chrome',[
        '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--no-default-browser-check',
        '--user-data-dir='+join(dir,'browser'),'--remote-debugging-port=0',base+'/workstation.html'
      ],{stdio:'ignore'});
      chrome.once('error',error=>{chrome.launchError=error;});
      let chromePort;
      await eventually(async()=>{
        if(chrome.launchError)throw chrome.launchError;
        try{
          const data=await readFile(join(dir,'browser','DevToolsActivePort'),'utf8');
          chromePort=Number(data.split('\n')[0]);
          return Number.isInteger(chromePort)&&chromePort>0;
        }catch{return false;}
      },'Chromium debugging port',30000);
      connection=await connectCDP(chromePort);
      const js=connection.evaluate;
      await connection.command('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
      await connection.command('Network.enable');
      await eventually(()=>js("!!document.querySelector('#watchlist') && document.querySelector('#workstation-status').textContent.includes('No scanned data yet') && !!document.querySelector('#market-connect-form')"),'rendered workstation');
      await js("(() => {document.querySelector('#watchlist').value='TEST';document.querySelector('#save-watchlist').click();return true;})()");
      await eventually(async()=>{const state=await(await fetch(base+'/api/workstation')).json();return state.watchlist.join(',')==='TEST';},'watchlist persistence');
      await js("document.querySelector('#refresh').click()");
      await eventually(async()=>{
        const state=await(await fetch(base+'/api/workstation')).json();
        return !!state.lastScans.TEST;
      },'initial research scan');
      await eventually(()=>js("document.querySelector('#setup-title').textContent.includes('TEST') && !!document.querySelector('#setup-chart path') && document.querySelector('#scanner-body').textContent.includes('TEST')"),'chart and detail in browser');
      assert.equal(await js("document.querySelector('#create-ticket').disabled"),false,'eligible setup can create paper ticket');
      await eventually(()=>js("document.querySelectorAll('#decision-map [data-node]').length===10"),'decision map rendered');
      assert.equal(await js("document.querySelectorAll('#setup-chart [data-reference]').length"),3,'entry and exit reference markers');
      const mapState=await(await fetch(base+'/api/workstation')).json();
      const originalTransform=await js("document.querySelector('#decision-map [data-node=entry]').getAttribute('transform')");
      await js("document.querySelector('#map-right').click()");
      assert.notEqual(await js("document.querySelector('#decision-map [data-node=entry]').getAttribute('transform')"),originalTransform,'rotation changes projected positions');
      await js("document.querySelector('#map-flat').click()");
      assert.equal(await js("document.querySelector('#map-flat').getAttribute('aria-pressed')"),'true');
      await js("document.querySelector('#map-node-list [data-node=stop]').click()");
      assert.equal(await js("document.querySelector('#map-detail-title').textContent"),'Stop reference');
      await js("document.querySelector('#map-code').click()");
      assert.equal(await js("document.querySelector('#decision-map [data-node=stop]').textContent.includes('evaluatePaperTicket')"),true);
      // Real pointer event on an SVG node, including the pointer-capture path.
      await js("document.querySelector('#map-flat').click();document.querySelector('#decision-map').scrollIntoView({block:'center',behavior:'instant'})");
      const hit=await js("(() => {const r=document.querySelector('#decision-map [data-node=target]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
      await connection.command('Input.dispatchMouseEvent',{type:'mousePressed',x:hit.x,y:hit.y,button:'left',clickCount:1});
      await connection.command('Input.dispatchMouseEvent',{type:'mouseReleased',x:hit.x,y:hit.y,button:'left',clickCount:1});
      assert.equal(await js("document.querySelector('#map-detail-title').textContent"),'Target reference','SVG pointer selects node');
      const beforeDrag=await js("document.querySelector('#decision-map [data-node=entry]').getAttribute('transform')");
      await connection.command('Input.dispatchMouseEvent',{type:'mousePressed',x:hit.x,y:hit.y,button:'left',clickCount:1});
      await connection.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:hit.x+60,y:hit.y+10,button:'left',buttons:1});
      await connection.command('Input.dispatchMouseEvent',{type:'mouseReleased',x:hit.x+60,y:hit.y+10,button:'left',clickCount:1});
      assert.notEqual(await js("document.querySelector('#decision-map [data-node=entry]').getAttribute('transform')"),beforeDrag,'pointer drag rotates map');
      await js("document.querySelector('#map-flat').click();document.querySelector('#decision-map [data-node=entry] rect').dispatchEvent(new MouseEvent('click',{bubbles:true}))");
      assert.equal(await js("document.querySelector('#map-detail-title').textContent"),'Entry reference','flat view still selects after dragging');
      await js("document.querySelector('#map-flat').click()");
      await js("document.querySelector('#decision-map').focus()");
      const beforeKey=await js("document.querySelector('#decision-map [data-node=entry]').getAttribute('transform')");
      await connection.command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});
      await connection.command('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});
      assert.notEqual(await js("document.querySelector('#decision-map [data-node=entry]').getAttribute('transform')"),beforeKey,'keyboard rotates map');
      assert.deepEqual(await(await fetch(base+'/api/workstation')).json(),mapState,'map exploration never persists or creates tickets');

      await js("(() => {document.querySelector('#paper-units').value='0.001';document.querySelector('#create-ticket').click();return true;})()");
      await eventually(async()=>{
        const snapshot=await(await fetch(base+'/api/workstation')).json();
        return snapshot.tickets.length===1;
      },'paper ticket recorded');
      await eventually(()=>js("document.querySelector('#ticket-body').textContent.includes('P9-0001')"),'paper journal rendered');
      const ticketState=await(await fetch(base+'/api/workstation')).json();
      assert.equal(ticketState.tickets[0].paperUnits,0.001,'fractional paper quantity accepted without rounding drift');
      await eventually(()=>js("document.querySelector('#reference-view option[value=\"P9-0001\"]')!==null"),'frozen ticket option');
      await js("document.querySelector('#reference-view').value='P9-0001';document.querySelector('#reference-view').dispatchEvent(new Event('change'))");
      assert.equal(await js("document.querySelector('#map-summary').textContent.includes('Frozen P9-0001')"),true);
      assert.equal(await js("document.querySelector('#map-summary').textContent.includes('Indicators show the current scan')"),true);
      const before=await(await fetch(base+'/api/workstation')).json();

      const older=structuredClone(source);
      older.bars.pop();
      older.sourceAsOf=older.bars.at(-1).date;
      market=older;
      await js("document.querySelector('#refresh').click()");
      await eventually(()=>js("document.querySelector('#workstation-status').textContent.includes('Local research request failed')"),'visible failed refresh notice');
      const after=await(await fetch(base+'/api/workstation')).json();
      assert.deepEqual(after,before,'stale provider response must not mutate persisted scan, alerts, timestamps or tickets');
      assert.equal(await js("document.querySelector('#setup-title').textContent.includes('TEST')"),true,'last valid setup remains visible');
      assert.equal(await js("!!document.querySelector('#setup-chart path')"),true,'last valid research chart remains visible');
      assert.equal((await fetch(base+'/api/broker/orders')).status,404,'no brokerage routes');
      // A later completed bar touches only the frozen target; chart renders the touch
      // on its date while preserving the opening entry/stop/target.
      market=structuredClone(source);
      const target=before.tickets[0].targetReference;
      const nextDate=new Date(source.bars.at(-1).date+'T00:00:00.000Z');
      do{nextDate.setUTCDate(nextDate.getUTCDate()+1);}while([0,6].includes(nextDate.getUTCDay()));
      market.bars.push({date:nextDate.toISOString().slice(0,10),open:target-.1,high:target+.3,low:target-.2,close:target+.1,volume:200000});
      market.sourceAsOf=market.bars.at(-1).date;
      await js("document.querySelector('#refresh').click()");
      await eventually(()=>js("!!document.querySelector('#setup-chart [data-outcome=TARGET_REFERENCE_TOUCHED]')"),'paper target touch marker');
      const updated=await(await fetch(base+'/api/workstation')).json();
      assert.equal(updated.tickets[0].targetReference,target,'refresh preserves frozen reference');
      assert.equal(await js("document.querySelector('#reference-view').value"),'P9-0001');
      await js("document.querySelector('#map-node-list [data-node=journal]').click()");
      assert.equal(await js("document.querySelector('#map-detail-text').textContent.includes('TARGET_REFERENCE_TOUCHED')"),true);
      await js("document.querySelector('#reference-view').value='current';document.querySelector('#reference-view').dispatchEvent(new Event('change'))");
      assert.equal(await js("document.querySelector('#map-summary').textContent.startsWith('Current scan')"),true);
      assert.equal(await js("document.querySelectorAll('#setup-chart [data-outcome]').length"),0,'current scan does not mix in a frozen outcome');
      await connection.command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
      assert.equal(await js("document.querySelector('#map-node-list [data-node=entry]').getBoundingClientRect().width>0"),true,'mobile node controls visible');
      assert.equal(await js("document.documentElement.scrollWidth<=document.documentElement.clientWidth"),true,'map scroll is contained on mobile');
      assert.deepEqual(connection.exceptions,[],'no renderer exceptions');
      assert.deepEqual(connection.assetFailures,[],'local map modules load without errors');
      if(process.env.PROJECT9_BROWSER_SCREENSHOT){
        await connection.command('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
        await js("document.querySelector('.decision-panel').scrollIntoView({block:'start',behavior:'instant'})");
        const shot=await connection.command('Page.captureScreenshot',{format:'png'});
        const {writeFile}=await import('node:fs/promises');
        await writeFile(process.env.PROJECT9_BROWSER_SCREENSHOT,Buffer.from(shot.data,'base64'));
      }

    }finally{
      connection?.close();
      chrome?.kill('SIGTERM');
      if(app)await new Promise(resolve=>app.close(resolve));
      await rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:200});
    }
  }
);
