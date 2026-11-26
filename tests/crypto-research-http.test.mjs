import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {PaperStore} from '../src/store.mjs';

test('crypto lab is a separately initiated, throttled, private read-only quality view',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'starnet-crypto-page-'));
  const port=53500+Math.floor(Math.random()*1200);
  const base='http://127.0.0.1:'+port;
  const paperPath=join(dir,'paper.json');
  let calls=0;
  const clock=()=>new Date('2026-11-26T20:00:00.000Z');
  const app=await createApp({
    port,store:new PaperStore(paperPath),requireSessionEvidence:false,
    now:clock,
    cryptoFetcher:async({pair,intervalMinutes})=>{
      calls++;
      assert.equal(pair,'BTC/USD');
      assert.equal(intervalMinutes,60);
      return {schema:'starnet-crypto-ohlc-inspection-v1',
        venue:'KRAKEN_SPOT',pair:'BTC/USD',completedCount:2,incompleteCandlesExcluded:1,
        missingIntervals:0,reviewReasons:[],
        status:'STRUCTURALLY_PLAUSIBLE_NOT_AUTHENTICATED',
        retrievedAt:clock().toISOString(),productionGate:'NO_GO',ordersCreated:0,
        completedCandles:[
          {startUtc:'2026-11-26T18:00:00.000Z',close:110},
          {startUtc:'2026-11-26T19:00:00.000Z',close:111}
        ]};
    }
  });
  try{
    await new Promise((resolve,reject)=>app.once('error',reject).listen(port,'127.0.0.1',resolve));
    const page=await fetch(base+'/crypto.html');
    assert.equal(page.status,200);
    const html=await page.text();
    assert.match(html,/Crypto market desk/);
    assert.match(html,/NO LOGIN/);
    for(const file of ['/crypto.js','/crypto.css']){
      const resp=await fetch(base+file);
      assert.equal(resp.status,200);
      assert.match(resp.headers.get('content-security-policy'),/connect-src 'self'/);
    }
    assert.equal(calls,0,'A page visit must never fetch source data on its own');
    const before=await readFile(paperPath);
    const bad=await fetch(base+'/api/crypto/public-ohlc?pair=AAPL&interval=60');
    assert.equal(bad.status,400);
    assert.equal(calls,0);
    const foreign=await fetch(base+'/api/crypto/public-ohlc?pair=BTC%2FUSD&interval=60',{
      headers:{Origin:'https://external.example'}
    });
    assert.equal(foreign.status,403);
    assert.equal(calls,0);
    const ok=await fetch(base+'/api/crypto/public-ohlc?pair=BTC%2FUSD&interval=60');
    assert.equal(ok.status,200);
    const body=await ok.json();
    assert.equal(calls,1);
    assert.equal(body.completedCount,2);
    assert.equal(body.chartCandles.length,2);
    assert.equal(body.ordersCreated,0);
    assert.equal(body.productionGate,'NO_GO');
    assert.equal(body.chartIsCompletedHistoricalCandlesOnly,true);
    assert.equal((await fetch(base+'/api/crypto/public-ohlc?pair=BTC%2FUSD&interval=60')).status,429);
    assert.equal(calls,1);
    assert.equal((await fetch(base+'/api/crypto/orders',{method:'POST'})).status,404);
    assert.deepEqual(await readFile(paperPath),before);
  }finally{
    await new Promise(resolve=>app.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});

test('upstream crypto HTTP failure returns bounded 502 and no data or account claims',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'starnet-crypto-fail-'));
  const port=55000+Math.floor(Math.random()*1000);
  const base='http://127.0.0.1:'+port;
  const app=await createApp({
    port,store:new PaperStore(join(dir,'paper.json')),requireSessionEvidence:false,
    cryptoFetcher:async()=>{throw new Error('Never expose upstream raw response or secrets');}
  });
  try{
    await new Promise((resolve,reject)=>app.once('error',reject).listen(port,'127.0.0.1',resolve));
    const response=await fetch(base+'/api/crypto/public-ohlc?pair=ETH%2FUSD&interval=1440');
    assert.equal(response.status,502);
    const body=await response.json();
    assert.equal(Object.keys(body).length,1);
    assert.doesNotMatch(JSON.stringify(body),/secrets|upstream raw/);
    assert.equal((await fetch(base+'/api/broker/orders')).status,404);
  }finally{
    await new Promise(resolve=>app.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});
