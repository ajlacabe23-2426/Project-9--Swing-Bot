import test from 'node:test';
import assert from 'node:assert/strict';
import {realpathSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {launchChromium} from '../tests/chromium-startup.mjs';
import {saveFictionalExperiment} from '../src/educational-lab-registry.mjs';
import {renderFictionalLabDashboard} from '../src/educational-lab-dashboard.mjs';

test('standalone educational dashboard supports keyboard inspection and mobile comparison without network assets',
 {skip:process.env.RUN_BROWSER_ACCEPTANCE!=='1',timeout:45000},async t=>{
  const root=mkdtempSync(join(realpathSync(tmpdir()),'fictional-browser-'));
  let chrome,ws,server;
  try{
    const input={schema:'educational-lab-v1',fictional:true,experimentId:'a'.repeat(64),instrument:'FICTIONAL_LENGTH_MM',plannedCount:3,observations:[{index:1,status:'OBSERVED',value:0}]};
    const a=saveFictionalExperiment(join(root,'records'),input);input.observations.push({index:2,status:'FAILED',value:null});
    const b=saveFictionalExperiment(join(root,'records'),input);
    const html=renderFictionalLabDashboard(join(root,'records'),[a.fingerprint,b.fingerprint]);
    const requests=[];
    server=createServer((req,res)=>{requests.push(req.url);res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const url='http://127.0.0.1:'+server.address().port+'/';
    chrome=await launchChromium({binary:process.env.CHROME_BIN||'google-chrome',profile:join(root,'profile'),args:['--headless=new','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--user-data-dir='+join(root,'profile'),'--remote-debugging-port=0','about:blank']});
    const targets=await(await fetch('http://127.0.0.1:'+chrome.port+'/json/list')).json();
    ws=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
    let id=0;const pending=new Map(),errors=[],network=[];
    ws.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params);if(msg.method==='Network.requestWillBeSent')network.push(msg.params.request.url);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);if(msg.error)p.reject(Error(JSON.stringify(msg.error)));else p.resolve(msg.result);}});
    const command=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
    const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true});assert.equal(r.exceptionDetails,undefined);return r.result.value;};
    await command('Runtime.enable');await command('Network.enable');await command('Page.enable');await command('Page.navigate',{url});
    for(let n=0;n<100;n++){if(await evaluate("document.querySelectorAll('details').length===2"))break;await new Promise(r=>setTimeout(r,50));}
    assert.equal(await evaluate("document.querySelectorAll('details').length"),2);
    await command('Page.bringToFront');
    for(const width of [1440,390,320]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
      await evaluate("document.querySelectorAll('details').forEach(x=>x.open=false);document.querySelector('summary').focus()");
      assert.equal(await evaluate("document.activeElement.tagName"),'SUMMARY','keyboard focus at '+width);
      // Enter activation requires the character event, as emitted by a real keypress.
      await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
      await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      assert.equal(await evaluate("document.querySelector('details').open"),true,'Enter expansion at '+width);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'overflow at '+width);
      assert.equal(await evaluate("document.querySelector('meter').getAttribute('aria-label').startsWith('Observed measurements')"),true);
      assert.equal(await evaluate("document.body.textContent.includes('1 observation differences')"),true);
    }
    assert.deepEqual(errors,[]);assert.ok(network.every(x=>x===url||x===url+'favicon.ico'),JSON.stringify(network));
    assert.ok(requests.every(x=>x==='/'||x==='/favicon.ico'));
    t.diagnostic('Desktop 1440px, mobile 390px and 320px; keyboard expansion, bounded layout, comparison and no external asset requests verified.');
  }finally{ws?.close();if(chrome)await chrome.stop();if(server)await new Promise(r=>server.close(r));rmSync(root,{recursive:true,force:true});}
 });
