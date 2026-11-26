import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {PaperStore} from '../src/store.mjs';

test('crypto-primary homepage fetches no data until requested and preserves legacy work',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'starnet-crypto-primary-'));
  const port=56000+Math.floor(Math.random()*700);
  const base='http://127.0.0.1:'+port;
  const file=join(dir,'paper.json');
  let calls=0;
  const now=()=>new Date('2026-11-26T20:00:00.000Z');
  const app=await createApp({port,store:new PaperStore(file),
    now,requireSessionEvidence:false,
    cryptoTickerReader:async({pair})=>{
      calls++;
      assert.equal(pair,'BTC/USD');
      return {
        symbol:'BTC/USD',bid:95000,ask:95002,last:95001,
        quoteAgeMs:500,status:'RECENT_RECEIPT_UNVERIFIED',
        exchangeTimestamp:'2026-11-26T19:59:59.500000Z',
        receivedAt:'2026-11-26T20:00:00.000Z',
        token:'SHOULD_NOT_LEAK'
      };
    }
  });
  try{
    await new Promise((resolve,reject)=>app.once('error',reject).listen(port,'127.0.0.1',resolve));
    for(const [path,text] of [
      ['/','Crypto market desk'],
      ['/index.html','Crypto market desk'],
      ['/crypto.html','Crypto market desk'],
      ['/simulation.html','EDUCATIONAL SIMULATION']
    ]){
      const response=await fetch(base+path);
      assert.equal(response.status,200,path);
      assert.match(await response.text(),new RegExp(text));
    }
    for(const path of ['/crypto.js','/crypto.css']){
      const result=await fetch(base+path);
      assert.equal(result.status,200);
      assert.match(result.headers.get('content-security-policy'),/connect-src 'self'/);
    }
    assert.equal(calls,0,'No background refreshes for page load');
    const before=await readFile(file);
    assert.equal((await fetch(base+'/api/crypto/public-ticker?pair=AAPL')).status,400);
    assert.equal((await fetch(base+'/api/crypto/public-ticker?pair=BTC%2FUSD&token=secret')).status,400);
    assert.equal((await fetch(base+'/api/crypto/public-ticker?pair=BTC%2FUSD',{headers:{Origin:'https://evil.example'}})).status,403);
    assert.equal(calls,0);

    const response=await fetch(base+'/api/crypto/public-ticker?pair=BTC%2FUSD');
    assert.equal(response.status,200);
    const quote=await response.json();
    assert.equal(quote.pair,'BTC/USD');
    assert.equal(quote.bid,95000);
    assert.equal(quote.ask,95002);
    assert.equal(quote.feedCoverage,'SINGLE_EXCHANGE_ONLY');
    assert.equal(quote.status,'RECENT_BY_REPORTED_TIMESTAMPS_ONLY');
    assert.equal(quote.independentlyAuthenticated,false);
    assert.equal(quote.executablePriceVerified,false);
    assert.equal(quote.ordersCreated,0);
    assert.equal(quote.productionGate,'NO_GO');
    assert.equal(Object.hasOwn(quote,'token'),false);
    assert.equal(calls,1);

    const throttled=await fetch(base+'/api/crypto/public-ticker?pair=BTC%2FUSD');
    assert.equal(throttled.status,429);
    assert.equal(calls,1);
    assert.equal((await fetch(base+'/api/crypto/orders')).status,404);
    assert.equal((await fetch(base+'/api/crypto/public-ticker',{method:'POST'})).status,404);
    assert.deepEqual(await readFile(file),before);
  }finally{
    await new Promise(resolve=>app.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});

test('stale or mismatched venue quote is rejected rather than represented as current',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'starnet-crypto-rejected-'));
  const port=57000+Math.floor(Math.random()*700);
  const base='http://127.0.0.1:'+port;
  const app=await createApp({port,store:new PaperStore(join(dir,'paper.json')),
    cryptoTickerReader:async()=>({
      symbol:'ETH/USD',bid:98000,ask:98002,quoteAgeMs:70000,
      status:'STALE_OR_DELAYED_OBSERVATION'
    })
  });
  try{
    await new Promise((resolve,reject)=>app.once('error',reject).listen(port,'127.0.0.1',resolve));
    const resp=await fetch(base+'/api/crypto/public-ticker?pair=BTC%2FUSD');
    assert.equal(resp.status,502);
    const data=await resp.json();
    assert.deepEqual(Object.keys(data),['error']);
    assert.doesNotMatch(JSON.stringify(data),/98000/);
  }finally{
    await new Promise(resolve=>app.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});
