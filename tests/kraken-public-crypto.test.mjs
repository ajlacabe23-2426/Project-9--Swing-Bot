import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KRAKEN_SPOT_PUBLIC_WSS,krakenPublicTickerSubscription,
  parseKrakenPublicTickerFrame
} from '../src/providers/kraken-public-crypto.mjs';

const time='2026-11-26T19:13:00.000Z';
const frame=(value={})=>JSON.stringify({
  channel:'ticker',type:'update',
  data:[{symbol:'BTC/USD',bid:90000.5,ask:90002.5,
    bid_qty:1.5,ask_qty:2.0,last:90001.0,
    timestamp:'2026-11-26T19:12:59.500000Z',...value}]
});
const read=raw=>parseKrakenPublicTickerFrame(raw,{receivedAt:time});

test('subscription requests only public tickers on an unauthenticated endpoint',()=>{
  const s=krakenPublicTickerSubscription();
  assert.equal(KRAKEN_SPOT_PUBLIC_WSS,'wss://ws.kraken.com/v2');
  assert.deepEqual(s,{
    method:'subscribe',
    params:{channel:'ticker',symbol:['BTC/USD','ETH/USD'],
      event_trigger:'bbo',snapshot:true}
  });
  const text=JSON.stringify(s);
  for(const forbidden of ['token','secret','key','trade','order','balance','account'])
    assert.equal(text.includes(forbidden),false);
});

test('valid Kraken v2 ticker generates one recent single-venue observation, never execution',()=>{
  const result=read(frame());
  assert.equal(result.length,1);
  assert.equal(result[0].symbol,'BTC/USD');
  assert.equal(result[0].status,'RECENT_RECEIPT_UNVERIFIED');
  assert.equal(result[0].quoteAgeMs,500);
  assert.equal(result[0].bid,90000.5);
  assert.equal(result[0].ask,90002.5);
  assert.equal(result[0].venueScope,'KRAKEN_SPOT_ONLY_NOT_CONSOLIDATED');
  assert.equal(result[0].executablePriceIndependentlyVerified,false);
  assert.equal(result[0].realOrdersEnabled,false);
  assert.equal(result[0].realOrdersCreated,0);
  assert.equal(result[0].productionGate,'NO_GO');
});

test('old ticker is stale, never deceptively current',()=>{
  const x=read(frame({timestamp:'2026-11-26T19:00:00.000000Z'}))[0];
  assert.equal(x.status,'STALE_OR_DELAYED_OBSERVATION');
  assert.equal(x.quoteAgeMs,780000);
});

test('control, heartbeat and non-ticker frames do not become quotes',()=>{
  for(const val of [
    {channel:'heartbeat'}, {channel:'status'},
    {method:'subscribe',success:true},
    {channel:'trade',type:'update',data:[{price:100}]},
    {channel:'balances',data:[{available:500}]}
  ])assert.deepEqual(read(JSON.stringify(val)),[]);
  assert.throws(()=>read(JSON.stringify({method:'subscribe',success:false})),/rejected/);
});

test('invalid quote properties fail closed and cannot create invented price evidence',()=>{
  for(const bad of [
    {symbol:'AAPL'}, {symbol:'ETH/USD',bid:-2},
    {ask:89999},{bid_qty:-1},{ask_qty:NaN},
    {last:0},{bid:Infinity},{timestamp:'not-a-date'},
    {timestamp:'2026-11-26T19:15:00.000000Z'}
  ])assert.throws(()=>read(frame(bad)),/(Invalid public ticker|Future quote)/);
});

test('wrong envelope, oversized payload, missing receipt and threshold rejected',()=>{
  assert.throws(()=>read('{'),/Invalid public ticker JSON/);
  assert.throws(()=>read('x'.repeat(20000)),/Bounded/);
  assert.throws(()=>read('[]'),/object/);
  assert.throws(()=>read(JSON.stringify({channel:'ticker',data:[]})),/event frame/);
  assert.throws(()=>parseKrakenPublicTickerFrame(frame(),{}),/[Cc]anonical/);
  assert.throws(()=>parseKrakenPublicTickerFrame(frame(),{receivedAt:time,maxAgeMs:1}),/threshold/);
  assert.throws(()=>parseKrakenPublicTickerFrame(frame(),{receivedAt:time,maxAgeMs:900000}),/threshold/);
});

test('snapshot and multiple known symbols are handled, without connecting to a broker',()=>{
  const msg=JSON.stringify({channel:'ticker',type:'snapshot',data:[
    {symbol:'BTC/USD',bid:90000,ask:90010,bid_qty:10,ask_qty:11,
      timestamp:'2026-11-26T19:12:59.123456789Z'},
    {symbol:'ETH/USD',bid:3000,ask:3001,bid_qty:5,ask_qty:6,
      timestamp:'2026-11-26T19:12:59.456789Z'}
  ]});
  const arr=read(msg);
  assert.equal(arr.length,2);
  assert.equal(arr[0].last,null);
  assert.equal(arr[1].symbol,'ETH/USD');
  assert.ok(arr.every(x=>x.brokerageConnected===false&&x.signalGenerated===false));
});
