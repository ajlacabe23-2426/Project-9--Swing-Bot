import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseHistoricalCsv} from '../src/historical-csv.mjs';
import {generateScenario} from '../src/engine.mjs';
import {CURRENT_MARKET_DATA_SCHEMA,evaluateSwingSetup} from '../src/market-intelligence.mjs';
import {createApp} from '../server.mjs';
import {PaperStore} from '../src/store.mjs';

const NOW=new Date('2026-10-28T22:00:00.000Z');
const bars=generateScenario(101,120);
const csv=['Date,Open,High,Low,Close,Volume','...'].slice(0,1).concat(
  bars.map(x=>[x.date,x.open,x.high,x.low,x.close,x.volume].join(','))
).join('\n');
const good={csv,symbol:'AAPL',source:'User permitted daily CSV',priceAdjustment:'UNKNOWN',confirmedRights:true};
const toCsv=rows=>['Date,Open,High,Low,Close,Volume',...rows.map(x=>[x.date,x.open,x.high,x.low,x.close,x.volume].join(','))].join('\n');

test('historical CSV ingestion preserves real-only labeling and full indicator evaluation',()=>{
  const data=parseHistoricalCsv(good,NOW);
  assert.equal(data.schema,CURRENT_MARKET_DATA_SCHEMA);
  assert.equal(data.bars.length,120);
  assert.equal(data.source,'User permitted daily CSV');
  assert.equal(data.provenance.licensing,'USER_ASSERTED_PERMITTED');
  assert.equal(data.provenance.adjustmentMethod,'UNKNOWN');
  assert.equal(data.bars[0].date,bars[0].date);
  assert.equal(data.bars.at(-1).date,bars.at(-1).date);
  assert.equal(evaluateSwingSetup(data).symbol,'AAPL');
  assert.deepEqual(parseHistoricalCsv({...good,csv:toCsv([...bars].reverse())},NOW).bars,data.bars);
});
test('historical CSV preserves permitted fractional daily volume',()=>{
  const changed=bars.map((b,index)=>index===37?{...b,volume:117_203.375625}:b);
  const data=parseHistoricalCsv({...good,csv:toCsv(changed)},NOW);
  assert.equal(data.bars[37].volume,117_203.375625);
  assert.ok(Number.isFinite(evaluateSwingSetup(data).observed.relativeVolume));
});

test('historical CSV rejects corrupt, synthetic-like defaults and suspicious source content',()=>{
  const attempts=[
    [{...good,confirmedRights:false},/permission/],
    [{...good,source:'x'},/source/],
    [{...good,symbol:'../AAPL'},/ticker/],
    [{...good,priceAdjustment:'DOES_NOT_EXIST'},/adjustment/],
    [{...good,csv:'<html>malicious</html>'},/CSV/],
    [{...good,csv:toCsv(bars.slice(0,40))},/60–3000/],
    [{...good,csv:toCsv([...bars.slice(0,119),bars[118]])},/ascending/],
    [{...good,csv:toCsv(bars.map((b,i)=>i===1?{...b,volume:-2}:b))},/numeric/]
  ];
  for(const [args,pattern] of attempts)assert.throws(()=>parseHistoricalCsv(args,NOW),pattern);
});

test('local browser connects historical provider, persists key privately, and scans genuine bars',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p9-real-provider-'));
  const app=await createApp({
    port:49365,
    store:new PaperStore(join(root,'paper.json')),
    marketVerifier:async({symbol,apiKey})=>{
      assert.equal(symbol,'AAPL');
      assert.equal(apiKey,'test-private-key-123');
      return parseHistoricalCsv(good,NOW);
    }
  });
  await new Promise((resolve,reject)=>app.once('error',reject).listen(49365,'127.0.0.1',resolve));
  const base='http://127.0.0.1:49365';
  const post=(route,body,origin=base)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','Origin':origin},body:JSON.stringify(body)});
  try{
    const status=await (await fetch(base+'/api/market/status')).json();
    assert.equal(status.connected,false);
    const invalidOrigin=await post('/api/market/connect',{apiKey:'test-private-key-123'},'https://evil.test');
    assert.equal(invalidOrigin.status,403);
    const connection=await post('/api/market/connect',{apiKey:'test-private-key-123'});
    assert.equal(connection.status,200);
    const connected=await connection.json();
    assert.equal(connected.workstation.lastScans.AAPL.symbol,'AAPL');
    assert.equal(connected.workstation.lastScans.AAPL.source.name,'User permitted daily CSV');
    assert.equal(connected.workstation.lastScans.AAPL.executionReadiness.status,'NOT_EXECUTION_READY');
    assert.equal(connected.asOf,bars.at(-1).date);
    const saved=await readFile(join(root,'massive-api-key'),'utf8');
    assert.equal(saved.trim(),'test-private-key-123');
    assert.equal(JSON.stringify(connected).includes(saved.trim()),false);
    const after=await (await fetch(base+'/api/market/status')).json();
    assert.equal(after.connected,true);
    assert.equal(JSON.stringify(after).includes(saved.trim()),false);
  }finally{
    await new Promise(resolve=>app.close(resolve));
    await rm(root,{recursive:true,force:true});
  }
});

test('browser import creates a real historical scan and preserves it on restart',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p9-real-csv-'));
  const app=await createApp({port:49366,store:new PaperStore(join(root,'paper.json'))});
  await new Promise((resolve,reject)=>app.once('error',reject).listen(49366,'127.0.0.1',resolve));
  const base='http://127.0.0.1:49366';
  try{
    const request=await fetch(base+'/api/market/import',{
      method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify(good)
    });
    assert.equal(request.status,200);
    const response=await request.json();
    assert.equal(response.bars,120);
    assert.equal(response.workstation.watchlist[0],'AAPL');
    assert.equal(response.workstation.lastScans.AAPL.asOf,bars.at(-1).date);
    const state=await (await fetch(base+'/api/workstation')).json();
    assert.equal(state.lastScans.AAPL.source.provenance.licensing,'USER_ASSERTED_PERMITTED');
  }finally{
    await new Promise(resolve=>app.close(resolve));
    await rm(root,{recursive:true,force:true});
  }
});
