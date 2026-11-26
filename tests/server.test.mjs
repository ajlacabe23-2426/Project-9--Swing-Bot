import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp,fetchWorkstationDataset} from '../server.mjs';
import {PaperStore} from '../src/store.mjs';
import {runOperationalCycle} from '../scripts/agent-operational-cycle.mjs';
import {compileSessionPolicy} from '../src/completed-market-session.mjs';
import {MARKET_DATA_SCHEMA,MARKET_DATA_SCHEMA_V2} from '../src/market-intelligence.mjs';

function marketDataset(symbol='TEST'){
  const bars=[];let price=100;const date=new Date('2026-01-01T00:00:00.000Z');
  while(bars.length<90){
    date.setUTCDate(date.getUTCDate()+1);
    if([0,6].includes(date.getUTCDay()))continue;
    const open=price,close=open*1.0015,high=Math.max(open,close)*1.004,low=Math.min(open,close)*0.996;
    bars.push({date:date.toISOString().slice(0,10),open,high,low,close,volume:100000+bars.length*50});
    price=close;
  }
  const latest=bars.at(-1),priorHigh=Math.max(...bars.slice(-21,-1).map(bar=>bar.high));
  latest.close=priorHigh*1.01;latest.high=latest.close*1.004;latest.low=Math.min(latest.low,latest.open,latest.close);latest.volume=190000;
  return {schema:MARKET_DATA_SCHEMA,symbol,currency:'USD',source:'Injected permitted test fixture',mode:'HISTORICAL',sourceAsOf:latest.date,priceAdjustment:'VENDOR_ADJUSTED',bars};
}


test('workstation can reuse a previously fetched local dataset when no provider key is active',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'project9-market-cache-'));
  try{
    const input=marketDataset('CACHE');
    await writeFile(join(dir,'CACHE.json'),JSON.stringify(input),'utf8');
    const loaded=await fetchWorkstationDataset({
      symbol:'CACHE',
      from:'2026-01-01',
      to:'2026-10-05',
      dataDir:dir,
      apiKey:null
    });
    assert.deepEqual(loaded,input);
    await assert.rejects(
      ()=>fetchWorkstationDataset({symbol:'MISSING',from:'2026-01-01',to:'2026-10-05',dataDir:dir,apiKey:null}),
      /No local dataset for MISSING/
    );
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});

test('local HTTP API restricts origin, host and inputs and has no broker endpoint',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'project9-')),port=49000+Math.floor(Math.random()*1000);
  const app=await createApp({
    port,
    store:new PaperStore(join(dir,'state.json')),
    marketFetcher:async({symbol})=>marketDataset(symbol)
  });
  await new Promise((resolve,reject)=>app.once('error',reject).listen(port,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+port;
  const post=(path,body,origin=base)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','Origin':origin},body:JSON.stringify(body)});
  try{
    const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(await home.text(),/Crypto market desk/);
    const legacy=await fetch(base+'/simulation.html');assert.equal(legacy.status,200);assert.match(await legacy.text(),/EDUCATIONAL SIMULATION/);
    const index=await fetch(base+'/index.html');assert.equal(index.status,200);assert.match(await index.text(),/Crypto market desk/);
    const state=await (await fetch(base+'/api/state')).json();assert.equal(state.cursor,29);assert.equal(state.mode,'SYNTHETIC_ONLY');
    assert.equal((await fetch(base+'/api/broker/orders')).status,404);

    const workstationPage=await fetch(base+'/workstation.html');assert.equal(workstationPage.status,200);assert.match(await workstationPage.text(),/READ-ONLY RESEARCH/);
    assert.equal((await fetch(base+'/workstation.js')).status,200);
    for(const path of ['/decision-map.js','/decision-map-core.mjs']){
      const response=await fetch(base+path);assert.equal(response.status,200);
      assert.match(response.headers.get('content-type'),/text\/javascript/);
      assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
    }
    const workstation=await (await fetch(base+'/api/workstation')).json();assert.deepEqual(workstation.watchlist,[]);

    const watchlist=await post('/api/workstation/watchlist',{symbols:['test']});assert.equal(watchlist.status,200);
    assert.deepEqual((await watchlist.json()).watchlist,['TEST']);
    const refresh=await post('/api/workstation/refresh',{});assert.equal(refresh.status,200);
    const refreshed=await refresh.json();assert.equal(refreshed.lastScans.TEST.symbol,'TEST');assert.ok(refreshed.lastScans.TEST.chartBars.length<=60);
    assert.equal(refreshed.lastScans.TEST.safety.realOrders,false);

    const ticket=await post('/api/workstation/tickets',{symbol:'TEST',paperUnits:1,
      reviewedScan:{revision:refreshed.lastScans.TEST.reviewRevision}});assert.equal(ticket.status,200);
    const ticketState=await ticket.json();assert.equal(ticketState.tickets.length,1);assert.equal(ticketState.tickets[0].symbol,'TEST');
    assert.equal('broker' in ticketState.tickets[0],false);

    const researchPage=await fetch(base+'/research.html');assert.equal(researchPage.status,200);assert.match(await researchPage.text(),/UNVERIFIED DATA/);
    assert.equal((await fetch(base+'/research-core.mjs')).status,200);assert.equal((await fetch(base+'/research.js')).status,200);
    assert.equal((await fetch(base+'/api/upload')).status,404);

    const badOrigin=await post('/api/step',{},'https://evil.example');assert.equal(badOrigin.status,403);
    const missingOrigin=await fetch(base+'/api/step',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(missingOrigin.status,403);
    const workstationBadOrigin=await post('/api/workstation/refresh',{},'https://evil.example');assert.equal(workstationBadOrigin.status,403);
    const invalid=await post('/api/run',{count:100});assert.equal(invalid.status,400);
    const extra=await post('/api/step',{broker:'live'});assert.equal(extra.status,400);
    const resetBad=await post('/api/reset',{seed:0});assert.equal(resetBad.status,400);
    const advance=await post('/api/step',{});assert.equal(advance.status,200);assert.equal((await advance.json()).cursor,30);
    const reset=await post('/api/reset',{seed:92});assert.equal(reset.status,200);assert.equal((await reset.json()).seed,92);
    assert.equal((await fetch(base+'/../.data/state.json')).status,404);
    assert.match(home.headers.get('content-security-policy'),/default-src 'none'/);
  }finally{await new Promise(resolve=>app.close(resolve));await rm(dir,{recursive:true,force:true});}
});

test('manual ticket review, duplicate race, and source isolation survive a cold restart',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-ticket-review-'));
  const port=50000+Math.floor(Math.random()*1000);
  const paperFile=join(dir,'paper.json'),stateFile=join(dir,'workstation.json');
  let fixture=marketDataset(),app,child;
  const base='http://127.0.0.1:'+port;
  const post=(route,body)=>fetch(base+'/api/workstation/'+route,{
    method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(body)
  });
  async function startApp(){
    app=await createApp({port,store:new PaperStore(paperFile),marketFetcher:async()=>fixture});
    await new Promise((resolve,reject)=>app.once('error',reject).listen(port,'127.0.0.1',resolve));
  }
  async function startChild(options=[]){
    const launch=`
      import {createApp} from './server.mjs';
      import {PaperStore} from './src/store.mjs';
      const app=await createApp({port:${port},store:new PaperStore(${JSON.stringify(paperFile)}),requireSessionEvidence:false});
      app.listen(${port},'127.0.0.1',()=>console.log('restart ready'));
    `;
    child=spawn(process.execPath,[...options,'--input-type=module','--eval',launch],{
      stdio:['ignore','pipe','pipe']
    });
    let stderr='';
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-1000);});
    const started=await Promise.race([
      once(child.stdout,'data',{signal:AbortSignal.timeout(10000)}),
      once(child,'exit').then(([code])=>{throw new Error('Restart exited: '+code+' '+stderr);})
    ]);
    assert.match(String(started[0]),/restart ready/);
  }
  async function stopChild(signal){
    if(child?.exitCode===null&&child.signalCode===null){
      const exited=once(child,'exit');child.kill(signal);await exited;
    }
    child=null;
  }
  try{
    await startApp();
    assert.equal((await post('watchlist',{symbols:['TEST']})).status,200);
    const initial=await (await post('refresh',{})).json();
    const obsolete={symbol:'TEST',paperUnits:0.001,
      reviewedScan:{revision:initial.lastScans.TEST.reviewRevision}};
    fixture={...fixture,source:'Alternate permitted test fixture'};
    const changed=await (await post('refresh',{})).json();
    const before=await readFile(stateFile,'utf8');
    assert.equal((await post('tickets',obsolete)).status,409);
    assert.equal((await post('tickets',{symbol:'TEST',paperUnits:0.001})).status,409);
    assert.equal(await readFile(stateFile,'utf8'),before);
    const reviewed={...obsolete,reviewedScan:{revision:changed.lastScans.TEST.reviewRevision}};
    await new Promise(resolve=>app.close(resolve));app=null;
    const pauseBeforeRename=`
      import fs from 'node:fs/promises';
      import {syncBuiltinESMExports} from 'node:module';
      const rename=fs.rename;
      fs.rename=async(from,to)=>{
        if(to!==${JSON.stringify(stateFile)})return rename(from,to);
        process.stdout.write('before workstation rename');
        await new Promise(()=>{});
      };
      syncBuiltinESMExports();
    `;
    await startChild(['--import','data:text/javascript,'+encodeURIComponent(pauseBeforeRename)]);
    const paused=once(child.stdout,'data',{signal:AbortSignal.timeout(10000)});
    const interrupted=post('tickets',reviewed).then(()=>false,()=>true);
    assert.match(String((await paused)[0]),/before workstation rename/);
    await stopChild('SIGKILL');
    assert.equal(await interrupted,true);
    assert.equal(await readFile(stateFile,'utf8'),before);
    await startApp();
    const results=await Promise.all([post('tickets',reviewed),post('tickets',reviewed)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    const opened=(await results.find(r=>r.ok).json()).tickets[0];
    await new Promise(resolve=>app.close(resolve));app=null;
    await startChild();
    const restored=await (await fetch(base+'/api/workstation')).json();
    assert.deepEqual(restored,JSON.parse(await readFile(stateFile,'utf8')));
    assert.deepEqual(restored.tickets,[opened]);
    assert.deepEqual(restored.lastScans,changed.lastScans);
    const persisted=await readFile(stateFile,'utf8');
    assert.equal((await post('tickets',reviewed)).status,409);
    assert.equal(await readFile(stateFile,'utf8'),persisted);
    await stopChild();
    await startApp();
    const later={...fixture,sourceAsOf:'2026-05-11',bars:[...fixture.bars,{
      date:'2026-05-11',open:opened.entryReference,high:opened.targetReference+1,
      low:opened.entryReference,close:opened.targetReference,volume:200000
    }]};
    fixture={...later,source:'Injected permitted test fixture'};
    const foreign=await (await post('refresh',{})).json();
    assert.deepEqual(foreign.tickets,[opened]);
    fixture=later;
    const matching=await (await post('refresh',{})).json();
    assert.equal(matching.tickets[0].outcome.status,'TARGET_REFERENCE_TOUCHED');
  }finally{
    if(app?.listening)await new Promise(resolve=>app.close(resolve));
    await stopChild();
    await rm(dir,{recursive:true,force:true});
  }
});

test('reviewed session calendar gates refresh and manual paper creation over HTTP',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-completed-sessions-'));
  const port=51000+Math.floor(Math.random()*1000);
  const base='http://127.0.0.1:'+port;
  const post=(route,body={})=>fetch(base+'/api/workstation/'+route,{
    method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(body)
  });
  const fixture=marketDataset(),last=fixture.bars.at(-1).date;
  const after=fixture.bars.at(-1).close;
  const next='2026-05-08';
  const sessions=[...fixture.bars.map(({date})=>({date,closeAt:date+'T21:00:00.000Z'})),
    {date:next,closeAt:next+'T17:00:00.000Z'}];
  const policy=compileSessionPolicy({source:fixture.source,symbols:['TEST'],
    from:fixture.bars[0].date,through:'2026-05-10',sessions});
  let clock=new Date(next+'T16:00:00Z');
  const complete={...fixture,schema:MARKET_DATA_SCHEMA_V2,provenance:{
    retrievedAt:clock.toISOString(),adjustmentMethod:'PROVIDER_ADJUSTED_UNVERIFIED',
    corporateActions:'NOT_VERIFIED',survivorship:'NOT_ASSESSED',licensing:'NOT_VERIFIED'
  }};
  let response={...complete,bars:complete.bars.filter((_,index)=>index!==10)};
  let requested;
  const app=await createApp({port,store:new PaperStore(join(dir,'paper.json')),
    requireSessionEvidence:true,sessionPolicy:policy,now:()=>clock,
    marketFetcher:async args=>{requested=args;return response;}});
  try{
    await new Promise((resolve,reject)=>app.once('error',reject).listen(port,'127.0.0.1',resolve));
    assert.equal((await post('watchlist',{symbols:['TEST']})).status,200);
    const gap=await (await post('refresh')).json();
    assert.deepEqual(gap.lastScans,{});
    assert.match(gap.lastRefreshErrors[0].message,/expected completed sessions/);
    assert.equal(requested.to,last);
    response=complete;
    const cycle=await runOperationalCycle({port,autoPaper:true,now:clock});
    assert.equal(cycle.actions[0].status,'MANUAL_REVIEW_REQUIRED');
    assert.equal(cycle.actions[0].asOf,last);
    assert.equal(cycle.mutations.virtualTicketsCreated,0);
    const accepted=await (await fetch(base+'/api/workstation')).json();
    assert.equal(accepted.lastScans.TEST.sessionEvidence.asOf,last);
    const review={symbol:'TEST',paperUnits:0.001,reviewedScan:{revision:accepted.lastScans.TEST.reviewRevision}};
    response={...complete,source:'Different market source'};
    const foreign=await (await post('refresh')).json();
    assert.match(foreign.lastRefreshErrors[0].message,/does not match/);
    assert.equal((await post('tickets',review)).status,409);
    response=complete;
    await post('refresh');
    assert.equal((await post('tickets',review)).status,200);
    clock=new Date(next+'T17:15:00Z');
    const file=join(dir,'workstation.json'),before=await readFile(file,'utf8');
    const stale=await post('tickets',review);
    assert.equal(stale.status,409);
    assert.match((await stale.json()).error,/latest completed exchange session/);
    assert.equal(await readFile(file,'utf8'),before);
    response={...complete,sourceAsOf:next,provenance:{...complete.provenance,retrievedAt:clock.toISOString()},
      bars:[...complete.bars,{date:next,open:after,high:after+1,low:after-1,close:after,volume:150000}]};
    clock=new Date('2026-05-09T18:00:00Z');
    const weekend=await (await post('refresh')).json();
    assert.equal(weekend.lastScans.TEST.asOf,next);
    assert.equal(requested.to,next);
    assert.equal(weekend.tickets.length,1);
    assert.deepEqual(weekend.alerts,[]);
  }finally{
    if(app.listening)await new Promise(resolve=>app.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});
