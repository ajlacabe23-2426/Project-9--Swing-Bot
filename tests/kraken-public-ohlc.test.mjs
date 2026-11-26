import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKrakenPublicOHLCUrl,inspectKrakenPublicOHLC,fetchKrakenPublicOHLC
} from '../src/providers/kraken-public-ohlc.mjs';
import {inspectPublicCryptoCommand} from '../scripts/inspect-public-crypto-candles.mjs';

const step=3600;
const start=1795700000 - (1795700000%step);
const retrievedAt=new Date((start+64*step+15)*1000).toISOString();
const row=(t,overrides={})=>{
  const base=[t,'100.00','102.00','99.00','101.00','100.50','4.50000000',25];
  Object.entries(overrides).forEach(([k,v])=>base[Number(k)]=v;
  return base;
};
function payload(count=64){
  return {error:[],result:{XXBTZUSD:[...Array(count)].map((_,i)=>row(start+i*step)),last:start+count*step}};
}
const inspect=(p=payload(),values={})=>inspectKrakenPublicOHLC(p,{
  pair:'BTC/USD',intervalMinutes:60,retrievedAt,...values
});

test('public URL is Kraken spot OHLC and cannot include credentials or order resources',()=>{
  const url=buildKrakenPublicOHLCUrl({pair:'ETH/USD',intervalMinutes:1440});
  assert.equal(url.host,'api.kraken.com');
  assert.equal(url.pathname,'/0/public/OHLC');
  assert.equal(url.searchParams.get('pair'),'ETHUSD');
  assert.equal(url.searchParams.get('interval'),'1440');
  assert.equal([...url.searchParams.keys()].length,2);
  assert.throws(()=>buildKrakenPublicOHLCUrl({pair:'AAPL/USD'}),/pair/);
  assert.throws(()=>buildKrakenPublicOHLCUrl({intervalMinutes:3}),/interval/);
});

test('Kraken last row is excluded even when it looks old relative to wall clock',()=>{
  const result=inspect();
  assert.equal(result.completedCount,63);
  assert.equal(result.incompleteCandlesExcluded,1);
  assert.equal(result.completedCandles.at(-1).startUnixSeconds,start+62*step);
  assert.equal(result.excludedUnfinishedStartUtc,new Date((start+63*step)*1000).toISOString());
  assert.equal(result.volumeUnit,'BASE_ASSET_UNITS');
  assert.equal(result.sessionModel,'TWENTY_FOUR_SEVEN');
  assert.equal(result.completedCandles[0].volumeBaseUnits,4.5);
  assert.equal(result.status,'STRUCTURALLY_PLAUSIBLE_NOT_AUTHENTICATED');
  assert.equal(result.exchangeDataAuthenticated,false);
  assert.equal(result.ordersCreated,0);
});

test('24/7 intervals never infer weekend/market holidays, and missing candles are not fabricated',()=>{
  const p=payload();
  p.result.XXBTZUSD.splice(13,2);
  const r=inspect(p);
  assert.equal(r.gapCount,1);
  assert.equal(r.missingIntervals,2);
  assert.equal(r.largestGapIntervals,2);
  assert.ok(r.reviewReasons.includes('MISSING_24_7_CANDLE_INTERVALS'));
  assert.equal(r.completedCount,61);
  assert.equal(r.completedCandles.every(x=>Number.isFinite(x.close)),true);
});

test('short history and stale last interval are review-required, not invented as complete coverage',()=>{
  const short=inspect(payload(10));
  assert.equal(short.completedCount,9);
  assert.ok(short.reviewReasons.includes('INSUFFICIENT_COMPLETED_CANDLES_FOR_EXTENDED_RESEARCH'));
  const old=inspect(payload(),{retrievedAt:new Date((start+100*step)*1000).toISOString()});
  assert.ok(old.reviewReasons.includes('RECENT_CLOSED_INTERVALS_ABSENT'));
});

test('rejected exchange messages, mixed result keys and out-of-order OHLC fail closed',()=>{
  assert.throws(()=>inspect({error:['EGeneral:Invalid arguments'],result:payload().result}),/Invalid or rejected/);
  assert.throws(()=>inspect({error:[],result:{...payload().result,XETHZUSD:[]}}),/one venue pair/);
  assert.throws(()=>inspect({error:[],result:{XXBTZUSD:[row(start)],last:start}}),/row count/);
  const p=payload();p.result.XXBTZUSD[8][0]=p.result.XXBTZUSD[7][0];
  assert.throws(()=>inspect(p),/unique and ascending/);
});

test('decimal precision, bad OHLC, invalid volume and future records fail closed',()=>{
  const bad=[
    {k:1,v:'NaN'}, {k:1,v:'-100'}, {k:1,v:100},
    {k:2,v:'98'}, {k:3,v:'103'}, {k:6,v:'Infinity'},
    {k:6,v:'-0.1'}, {k:7,v:1.25}
  ];
  for(const {k,v} of bad){
    const p=payload();p.result.XXBTZUSD[3][k]=v;
    assert.throws(()=>inspect(p),/(Invalid Kraken|Inconsistent Kraken)/);
  }
  const future=payload();future.result.XXBTZUSD.at(-1)[0]+=step*100;
  assert.throws(()=>inspect(future),/(after retrieval|unique and ascending)/);
  assert.throws(()=>inspect(payload(),{retrievedAt:'2026-11-26'}),/Canonical/);
});

test('mock HTTP transport only reads public OHLC with no credentials, redirects or orders',async()=>{
  let times=0;
  const fetchImpl=async(url,options)=>{
    times++;
    assert.equal(url.host,'api.kraken.com');
    assert.equal(options.method,'GET');
    assert.equal(options.redirect,'error');
    assert.equal(options.headers.Accept,'application/json');
    assert.equal(Object.keys(options.headers).length,1);
    return {ok:true,json:async()=>payload()};
  };
  const r=await fetchKrakenPublicOHLC({pair:'BTC/USD',intervalMinutes:60,
    fetchImpl,now:()=>new Date(retrievedAt)});
  assert.equal(times,1);
  assert.equal(r.completedCount,63);
  assert.equal(r.productionGate,'NO_GO');
  const result=await inspectPublicCryptoCommand(['BTC/USD','60'],{fetchImpl,now:()=>new Date(retrievedAt)});
  assert.equal(result.completedCount,63);
  assert.equal(result.storedResearchData,false);
  assert.equal(Object.hasOwn(result,'completedCandles'),false);
  await assert.rejects(inspectPublicCryptoCommand(['--live'],{fetchImpl}),/Usage/);
});

test('HTTP failures and provider error objects never become trusted research output',async()=>{
  const bad=async()=>({ok:false,status:429});
  await assert.rejects(fetchKrakenPublicOHLC({fetchImpl:bad}),/status 429/);
  await assert.rejects(fetchKrakenPublicOHLC({fetchImpl:async()=>{throw Error('timeout')}}),/request failed/);
  await assert.rejects(fetchKrakenPublicOHLC({fetchImpl:async()=>({ok:true,json:async()=>{throw Error('oops')}})}),/not JSON/);
  await assert.rejects(fetchKrakenPublicOHLC({fetchImpl:async()=>({ok:true,json:async()=>({error:['no access']})})}),/Invalid or rejected/);
});
