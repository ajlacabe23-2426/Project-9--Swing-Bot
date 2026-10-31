import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp,latestCompletedWeekday} from '../server.mjs';
import {PaperStore} from '../src/store.mjs';
import {WorkstationStore} from '../src/workstation-store.mjs';
import {MARKET_DATA_SCHEMA,evaluateSwingSetup} from '../src/market-intelligence.mjs';

function currentWeekday(){
  const yesterday=new Date();
  yesterday.setUTCDate(yesterday.getUTCDate()-1);
  return latestCompletedWeekday(yesterday.toISOString().slice(0,10));
}
function dataset(symbol,asOf=currentWeekday()){
  const dates=[],cursor=new Date(asOf+'T00:00:00.000Z');
  while(dates.length<90){
    if(![0,6].includes(cursor.getUTCDay()))dates.push(cursor.toISOString().slice(0,10));
    cursor.setUTCDate(cursor.getUTCDate()-1);
  }
  dates.reverse();
  const bars=dates.map((date,i)=>{
    const open=100+i*.23,close=open+.18;
    return {date,open,high:close+1,low:open-1,close,volume:100_000+i};
  });
  return {
    schema:MARKET_DATA_SCHEMA,symbol,currency:'USD',
    source:'Massive Stocks adjusted daily aggregates',mode:'HISTORICAL',
    sourceAsOf:asOf,priceAdjustment:'VENDOR_ADJUSTED',bars
  };
}
async function seededStore(root,symbols){
  const workstation=new WorkstationStore(join(root,'workstation.json'));
  await workstation.init();
  await workstation.setWatchlist(symbols);
  const entries=symbols.map(symbol=>{
    const data=dataset(symbol);
    const evaluation=evaluateSwingSetup(data);
    evaluation.chartBars=data.bars.slice(-60);
    return {dataset:data,evaluation};
  });
  await workstation.applyRefresh(entries,{refreshedAt:new Date().toISOString()});
  return workstation;
}
async function withServer(workstation,root,marketFetcher,assertion){
  const port=50000+Math.floor(Math.random()*1000);
  const app=await createApp({
    port,workstationStore:workstation,
    store:new PaperStore(join(root,'paper.json')),marketFetcher
  });
  await new Promise((resolve,reject)=>app.once('error',reject).listen(port,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+port;
  const refresh=async()=>{
    const response=await fetch(base+'/api/workstation/refresh',{
      method:'POST',headers:{'Content-Type':'application/json','Origin':base},
      body:'{}'
    });
    assert.equal(response.status,200);
    return response.json();
  };
  try{await assertion(refresh);}
  finally{await new Promise(resolve=>app.close(resolve));}
}

test('completed weekday calculation handles Saturday and Sunday without assuming new bars',()=>{
  assert.equal(latestCompletedWeekday('2026-10-30'),'2026-10-30');
  assert.equal(latestCompletedWeekday('2026-10-31'),'2026-10-30');
  assert.equal(latestCompletedWeekday('2026-11-01'),'2026-10-30');
  assert.equal(latestCompletedWeekday('2026-11-02'),'2026-11-02');
});

test('repeated refresh reuses last completed Massive daily scans without provider calls',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p9-no-new-bars-'));
  try{
    const workstation=await seededStore(root,['AAPL','NVDA']);
    let providerCalls=0;
    await withServer(workstation,root,async()=>{providerCalls++;throw new Error('unexpected provider call');},async refresh=>{
      for(let n=0;n<2;n++){
        const response=await refresh();
        assert.deepEqual(response.reusedSymbols,['AAPL','NVDA']);
        assert.deepEqual(response.fetchedSymbols,[]);
        assert.deepEqual(response.lastRefreshErrors,[]);
        assert.equal(response.lastScans.AAPL.asOf,currentWeekday());
        assert.equal(response.lastScans.NVDA.asOf,currentWeekday());
      }
    });
    assert.equal(providerCalls,0);
    const restored=new WorkstationStore(join(root,'workstation.json'));
    await restored.init();
    assert.deepEqual(restored.snapshot().watchlist,['AAPL','NVDA']);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('a newly added symbol still requires genuine provider data while prior scans are reused',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p9-selective-fetch-'));
  try{
    const workstation=await seededStore(root,['AAPL','NVDA']);
    await workstation.setWatchlist(['AAPL','NVDA','MSFT']);
    const requested=[];
    await withServer(workstation,root,async({symbol})=>{
      requested.push(symbol);
      return dataset(symbol);
    },async refresh=>{
      const response=await refresh();
      assert.deepEqual(response.reusedSymbols,['AAPL','NVDA']);
      assert.deepEqual(response.fetchedSymbols,['MSFT']);
      assert.deepEqual(response.lastRefreshErrors,[]);
      assert.equal(response.lastScans.MSFT.asOf,currentWeekday());
    });
    assert.deepEqual(requested,['MSFT']);
  }finally{await rm(root,{recursive:true,force:true});}
});
