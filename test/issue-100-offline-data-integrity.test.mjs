import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectKrakenPublicOHLC,fetchKrakenPublicOHLC} from '../src/providers/kraken-public-ohlc.mjs';

// Invented records for parser correctness only. No network or real price data.
const start = Date.parse('2024-01-01T00:00:00.000Z') / 1000;
const options = {pair:'BTC/USD',intervalMinutes:60,retrievedAt:'2024-01-01T03:15:00.000Z'};
const row = (hour) => [start+hour*3600,'10','12','9','11','10','1',2];
const fixture = () => ({error:[],result:{XXBTZUSD:[row(0),row(1),row(2),row(3)],last:start+10800}});
const inspect = (payload=fixture(), overrides={}) => inspectKrakenPublicOHLC(payload,{...options,...overrides});

test('offline fixture excludes unfinished candle and preserves UTC provenance',()=>{
  const result=inspect();
  assert.equal(result.completedCount,3);
  assert.equal(result.incompleteCandlesExcluded,1);
  assert.equal(result.lastCompletedStartUtc,'2024-01-01T02:00:00.000Z');
  assert.equal(result.excludedUnfinishedStartUtc,'2024-01-01T03:00:00.000Z');
  assert.equal(result.retrievedAt,options.retrievedAt);
  assert.equal(result.timeZone,'UTC');
  assert.equal(result.exchangeDataAuthenticated,false);
  assert.equal(result.ordersCreated,0);
  assert.equal(result.productionGate,'NO_GO');
  assert.deepEqual(result,inspect());
});
test('missing interval is explicit, not filled with invented observations',()=>{
  const p=fixture();p.result.XXBTZUSD.splice(1,1);
  const result=inspect(p);
  assert.equal(result.completedCount,2);
  assert.equal(result.gapCount,1);
  assert.equal(result.missingIntervals,1);
  assert.ok(result.reviewReasons.includes('MISSING_24_7_CANDLE_INTERVALS'));
});
test('duplicate and reverse timestamps are rejected',()=>{
  for(const change of [rows=>{rows[1]=row(0);},rows=>{[rows[0],rows[1]]=[rows[1],rows[0]];}]){
    const p=fixture();change(p.result.XXBTZUSD);
    assert.throws(()=>inspect(p),/unique and ascending/);
  }
});
test('malformed decimal, inconsistent OHLC and invalid timestamps fail closed',()=>{
  for(const [index,value] of [[1,'NaN'],[2,'8'],[5,'13'],[0,start+1]]){
    const p=fixture();p.result.XXBTZUSD[0][index]=value;
    assert.throws(()=>inspect(p),/Invalid Kraken OHLC record|Inconsistent Kraken OHLC/);
  }
});
test('future data, wrong pair and noncanonical retrieval clock are rejected',()=>{
  const p=fixture();p.result.XXBTZUSD[3]=row(5);
  assert.throws(()=>inspect(p),/starts after retrieval/);
  assert.throws(()=>inspect(fixture(),{pair:'ETH/USD'}),/one venue pair/);
  assert.throws(()=>inspect(fixture(),{retrievedAt:'2024-01-01'}),/Canonical UTC/);
});
test('offline rejected request does not produce a successful observation',async()=>{
  const fakeClock=()=>new Date(options.retrievedAt);
  await assert.rejects(fetchKrakenPublicOHLC({fetchImpl:async()=>{throw new Error('simulated failure');},now:fakeClock}),/request failed/);
  await assert.rejects(fetchKrakenPublicOHLC({fetchImpl:async()=>({ok:false,status:503}),now:fakeClock}),/status 503/);
  await assert.rejects(fetchKrakenPublicOHLC({fetchImpl:async()=>({ok:true,json:async()=>{throw new Error('invalid JSON');}}),now:fakeClock}),/not JSON/);
});
test('subsequent independent mocked request can recover after failure',async()=>{
  const now=()=>new Date(options.retrievedAt);
  let calls=0;
  const fetchImpl=async()=>{if(++calls===1)throw new Error('offline');return {ok:true,json:async()=>fixture()};};
  await assert.rejects(fetchKrakenPublicOHLC({fetchImpl,now}),/request failed/);
  const result=await fetchKrakenPublicOHLC({fetchImpl,now});
  assert.deepEqual(result,inspect());
  assert.equal(calls,2);
});
