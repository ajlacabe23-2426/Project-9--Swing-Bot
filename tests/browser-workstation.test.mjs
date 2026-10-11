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
  const pending=new Map();
  ws.addEventListener('message',event=>{
    let item;
    try{item=JSON.parse(String(event.data));}catch{return;}
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
  return {evaluate,close:()=>ws.close()};
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
      },'Chromium debugging port');
      connection=await connectCDP(chromePort);
      const js=connection.evaluate;
      await eventually(()=>js("!!document.querySelector('#watchlist') && document.querySelector('#workstation-status').textContent.includes('Watchlist saved')"),'rendered workstation');
      await js("(() => {document.querySelector('#watchlist').value='TEST';document.querySelector('#save-watchlist').click();return true;})()");
      await eventually(async()=>{const state=await(await fetch(base+'/api/workstation')).json();return state.watchlist.join(',')==='TEST';},'watchlist persistence');
      await js("document.querySelector('#refresh').click()");
      await eventually(async()=>{
        const state=await(await fetch(base+'/api/workstation')).json();
        return !!state.lastScans.TEST;
      },'initial research scan');
      await eventually(()=>js("document.querySelector('#setup-title').textContent.includes('TEST') && !!document.querySelector('#setup-chart path') && document.querySelector('#scanner-body').textContent.includes('TEST')"),'chart and detail in browser');
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
    }finally{
      connection?.close();
      chrome?.kill('SIGTERM');
      if(app)await new Promise(resolve=>app.close(resolve));
      await rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:200});
    }
  }
);
