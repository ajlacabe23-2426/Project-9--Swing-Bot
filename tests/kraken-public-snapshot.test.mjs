import test from 'node:test';
import assert from 'node:assert/strict';
import {readKrakenPublicSnapshot} from '../src/providers/kraken-public-snapshot.mjs';

const when=new Date('2026-11-26T18:00:03.000Z');
const ticker=(data={})=>JSON.stringify({channel:'ticker',type:'snapshot',data:[{
  symbol:'BTC/USD',bid:91400,ask:91402,bid_qty:1.5,ask_qty:1.2,
  last:91401,timestamp:'2026-11-26T18:00:02.000000Z',...data
}]});

function socketWithFrame(frame){
  const instances=[];
  class FakeWebSocket{
    constructor(url){
      this.url=url;
      this.handlers=new Map();
      this.sent=[];
      this.closed=false;
      instances.push(this);
      queueMicrotask(()=>this.emit('open',{}));
    }
    addEventListener(name,callback){
      if(!this.handlers.has(name))this.handlers.set(name,[]);
      this.handlers.get(name).push(callback);
    }
    emit(name,value){for(const cb of this.handlers.get(name)||[])cb(value);}
    send(message){
      this.sent.push(JSON.parse(message));
      queueMicrotask(()=>this.emit('message',{data:frame}));
    }
    close(){this.closed=true;}
  }
  return {FakeWebSocket,instances};
}

test('read-only public snapshot inspects a documented Kraken ticker with no private account or orders',async()=>{
  const s=socketWithFrame(ticker());
  const r=await readKrakenPublicSnapshot({
    WebSocketImpl:s.FakeWebSocket,now:()=>when
  });
  assert.equal(s.instances.length,1);
  assert.equal(s.instances[0].url,'wss://ws.kraken.com/v2');
  assert.equal(s.instances[0].closed,true);
  assert.deepEqual(s.instances[0].sent,[{
    method:'subscribe',params:{channel:'ticker',symbol:['BTC/USD','ETH/USD'],event_trigger:'bbo',snapshot:true}
  }]);
  assert.equal(r.symbol,'BTC/USD');
  assert.equal(r.bid,91400);
  assert.equal(r.ask,91402);
  assert.equal(r.quoteAgeMs,1000);
  assert.equal(r.status,'RECENT_RECEIPT_UNVERIFIED');
  assert.equal(r.independentlyAuthenticated,false);
  assert.equal(r.executablePriceIndependentlyVerified,false);
  assert.equal(r.tradeExecutionEnabled,false);
  assert.equal(r.ordersCreated,0);
  assert.equal(r.productionGate,'NO_GO');
});

test('wrong pair is never accidentally returned as the requested instrument',async()=>{
  const s=socketWithFrame(ticker({symbol:'ETH/USD'}));
  await assert.rejects(readKrakenPublicSnapshot({
    pair:'BTC/USD',WebSocketImpl:s.FakeWebSocket,now:()=>when,timeoutMs:500
  }),/timed out/);
  assert.equal(s.instances[0].closed,true);
});

test('stale ticker does not become a quote',async()=>{
  const s=socketWithFrame(ticker({timestamp:'2026-11-26T17:30:00.000000Z'}));
  await assert.rejects(readKrakenPublicSnapshot({
    WebSocketImpl:s.FakeWebSocket,now:()=>when
  }),/stale/);
});

test('malformed and contradictory quote frames fail closed',async()=>{
  for(const frame of [
    ticker({ask:90000}),
    ticker({timestamp:'2026-11-26T18:00:06.000000Z'}),
    'not-json'
  ]){
    const s=socketWithFrame(frame);
    await assert.rejects(readKrakenPublicSnapshot({
      WebSocketImpl:s.FakeWebSocket,now:()=>when
    }),/rejected by validation/);
    assert.equal(s.instances[0].closed,true);
  }
});

test('pair allowlisting and bounded timeout prevent private endpoints or unsupported markets',async()=>{
  await assert.rejects(readKrakenPublicSnapshot({pair:'SOL/USD'}),/Unsupported crypto/);
  await assert.rejects(readKrakenPublicSnapshot({WebSocketImpl:null}),/transport/);
  await assert.rejects(readKrakenPublicSnapshot({timeoutMs:100}),/timeout/);
  await assert.rejects(readKrakenPublicSnapshot({timeoutMs:9999}),/timeout/);
});

test('closed upstream transport fails safely without returning invented quotes',async()=>{
  class ClosedWebSocket{
    constructor(){queueMicrotask(()=>this.close());}
    addEventListener(name,callback){if(name==='close')this.onClose=callback;}
    close(){this.onClose?.();}
  }
  await assert.rejects(readKrakenPublicSnapshot({
    WebSocketImpl:ClosedWebSocket,timeoutMs:500
  }),/closed without valid observation/);
});
