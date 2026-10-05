import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp,fetchWorkstationDataset} from '../server.mjs';
import {PaperStore} from '../src/store.mjs';
import {MARKET_DATA_SCHEMA} from '../src/market-intelligence.mjs';

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
    const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(await home.text(),/EDUCATIONAL SIMULATION/);
    const state=await (await fetch(base+'/api/state')).json();assert.equal(state.cursor,29);assert.equal(state.mode,'SYNTHETIC_ONLY');
    assert.equal((await fetch(base+'/api/broker/orders')).status,404);

    const workstationPage=await fetch(base+'/workstation.html');assert.equal(workstationPage.status,200);assert.match(await workstationPage.text(),/READ-ONLY RESEARCH/);
    assert.equal((await fetch(base+'/workstation.js')).status,200);
    const workstation=await (await fetch(base+'/api/workstation')).json();assert.deepEqual(workstation.watchlist,[]);

    const watchlist=await post('/api/workstation/watchlist',{symbols:['test']});assert.equal(watchlist.status,200);
    assert.deepEqual((await watchlist.json()).watchlist,['TEST']);
    const refresh=await post('/api/workstation/refresh',{});assert.equal(refresh.status,200);
    const refreshed=await refresh.json();assert.equal(refreshed.lastScans.TEST.symbol,'TEST');assert.ok(refreshed.lastScans.TEST.chartBars.length<=60);
    assert.equal(refreshed.lastScans.TEST.safety.realOrders,false);

    const ticket=await post('/api/workstation/tickets',{symbol:'TEST',paperUnits:1});assert.equal(ticket.status,200);
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
