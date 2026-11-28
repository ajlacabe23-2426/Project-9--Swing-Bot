import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {launchChromium} from './chromium-startup.mjs';
import {saveClockEvidence} from '../src/fictional-clock-replay.mjs';
import {renderClockAuditReport} from '../src/fictional-clock-audit-report.mjs';

const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function eventually(fn){
  const end=Date.now()+12000;
  while(Date.now()<end){
    const value=await fn().catch(()=>null);
    if(value)return value;
    await pause(100);
  }
  throw Error('Browser target or document unavailable');
}
test('sandboxed Chromium renders standalone fictional evidence report at desktop and mobile widths',
  {skip:process.env.RUN_CLOCK_BROWSER!=='1',timeout:60000},async()=>{
    const dir=await mkdtemp(join(tmpdir(),'clock-browser-'));
    let browser,ws;
    const pending=new Map();
    try{
      const evidence=join(dir,'evidence');
      await mkdir(evidence);
      for(const scenario of ['complete','gap','duplicate','reversed'])
        await saveClockEvidence(evidence,scenario);
      await writeFile(join(evidence,'.pending-example'),'partial');
      await writeFile(join(evidence,'long-'+('x'.repeat(180))),'unexpected');
      const report=join(dir,'report.html');
      await writeFile(report,await renderClockAuditReport(evidence));
      const profile=join(dir,'profile');
      browser=await launchChromium({
        binary:process.env.CHROME_BIN||'google-chrome',profile,timeoutMs:20000,
        args:['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
          '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank']
      });
      const target=await eventually(async()=>{
        const response=await fetch('http://127.0.0.1:'+browser.port+'/json/list',
          {signal:AbortSignal.timeout(1000)});
        return (await response.json()).find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
      });
      ws=new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('WebSocket connection timed out')),5000);
        ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
        ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('WebSocket connection failed'));},{once:true});
      });
      let seq=0;
      const external=[],errors=[];
      ws.addEventListener('message',event=>{
        const m=JSON.parse(String(event.data));
        if(m.method==='Network.requestWillBeSent'&&/^https?:/.test(m.params.request.url))
          external.push(m.params.request.url);
        if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);
        const cb=pending.get(m.id);
        if(cb){pending.delete(m.id);clearTimeout(cb.timer);
          if(m.error)cb.reject(Error(JSON.stringify(m.error)));else cb.resolve(m.result);}
      });
      const command=(method,params={})=>new Promise((resolve,reject)=>{
        const id=++seq;
        const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},5000);
        pending.set(id,{resolve,reject,timer});
        ws.send(JSON.stringify({id,method,params}));
      });
      const evaluate=async expression=>{
        const r=await command('Runtime.evaluate',{expression,returnByValue:true});
        if(r.exceptionDetails)throw Error(r.exceptionDetails.text);
        return r.result.value;
      };
      await command('Network.enable');await command('Runtime.enable');await command('Page.enable');
      await command('Page.navigate',{url:pathToFileURL(report).href});
      await eventually(()=>evaluate("document.readyState==='complete' && document.title==='Classroom replay evidence audit'"));
      for(const width of [1440,390,320]){
        await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
        const info=await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.innerText,rows:document.querySelectorAll('tbody tr').length,headers:document.querySelectorAll('th[scope=col]').length})");
        assert.equal(info.width,width);
        assert.ok(info.scroll<=width,'No horizontal overflow at '+width);
        assert.equal(info.rows,6);assert.equal(info.headers,2);
        assert.match(info.body,/4 of 4 built-in fixtures/);
        assert.match(info.body,/Review required/);
        assert.match(info.body,/Interrupted or active write/);
        assert.match(info.body,/Unexpected entry/);
      }
      assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
    }finally{
      for(const cb of pending.values())clearTimeout(cb.timer);
      ws?.close();
      try{await browser?.stop();}finally{await rm(dir,{recursive:true,force:true});}
    }
  });
