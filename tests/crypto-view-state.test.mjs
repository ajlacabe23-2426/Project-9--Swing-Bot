import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../public/crypto.js',import.meta.url),'utf8');
function harness(){
  const nodes=new Map(), requests=[];
  function element(){
    return {textContent:'',value:'',disabled:false,children:[],attributes:{},listeners:{},
      addEventListener(name,fn){this.listeners[name]=fn;},
      replaceChildren(){this.children=[];},
      append(node){this.children.push(node);},
      setAttribute(name,value){this.attributes[name]=value;}};
  }
  const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  get('crypto-pair').value='BTC/USD';
  get('crypto-interval').value='60';
  vm.runInNewContext(source,{
    document:{getElementById:get,createElementNS:element},
    URLSearchParams,Intl,fetch:url=>new Promise(resolve=>requests.push({url,resolve}))
  });
  return {get,requests,
    submit:()=>get('crypto-form').listeners.submit({preventDefault(){}}),
    quote:()=>get('crypto-quote-inspect').listeners.click(),
    select:(id,value)=>{get(id).value=value;get(id).listeners.change();},
    reply:(body,ok=true)=>requests.shift().resolve({ok,json:async()=>body})};
}
const candles=(pair='BTC/USD',intervalMinutes=60)=>({
  pair,intervalMinutes,venue:'KRAKEN_SPOT',completedCount:2,incompleteCandlesExcluded:1,
  missingIntervals:0,retrievedAt:'2026-11-26T20:00:00.000Z',
  status:'STRUCTURALLY_PLAUSIBLE_NOT_AUTHENTICATED',reviewReasons:[],
  chartCandles:[{close:100,startUtc:'2026-11-26T18:00:00.000Z'},
    {close:101,startUtc:'2026-11-26T19:00:00.000Z'}]
});
const quote=(pair='BTC/USD')=>({pair,status:'RECENT_BY_REPORTED_TIMESTAMPS_ONLY',
  feedCoverage:'SINGLE_EXCHANGE_ONLY',bid:100,ask:101,last:100,
  exchangeTimestamp:'fictional',receivedAt:'fictional',quoteAgeMs:10});

test('selection changes discard in-flight candle responses including A-B-A',async()=>{
  const h=harness(); const pending=h.submit();
  h.select('crypto-pair','ETH/USD'); h.select('crypto-pair','BTC/USD');
  h.reply(candles()); await pending;
  assert.equal(h.get('crypto-close').textContent,'—');
  assert.equal(h.get('crypto-price-chart').children.length,0);
  assert.match(h.get('crypto-status').textContent,/Selection changed/);
  assert.equal(h.get('crypto-inspect').disabled,false);
});

test('interval change clears historical evidence and mismatched replies are rejected',async()=>{
  const h=harness();let p=h.submit();h.reply(candles());await p;
  assert.notEqual(h.get('crypto-close').textContent,'—');
  h.select('crypto-interval','15');
  assert.equal(h.get('crypto-count').textContent,'—');
  assert.equal(h.get('crypto-price-chart').children.length,0);
  p=h.submit();h.reply(candles('BTC/USD',60));await p;
  assert.match(h.get('crypto-status').textContent,/mismatch/);
  assert.equal(h.get('crypto-close').textContent,'—');
});

test('refresh failure clears previous candle metrics and chart',async()=>{
  const h=harness();let p=h.submit();h.reply(candles());await p;
  p=h.submit();assert.equal(h.get('crypto-close').textContent,'—');
  h.reply({error:'mock failure'},false);await p;
  for(const id of ['crypto-venue','crypto-count','crypto-excluded','crypto-gaps','crypto-close','crypto-retrieved'])
    assert.equal(h.get(id).textContent,'—');
  assert.equal(h.get('crypto-quality').textContent,'SOURCE UNAVAILABLE');
  assert.equal(h.get('crypto-price-chart').children.length,0);
});

test('pair changes discard pending quotes and refresh failures never reuse old quote values',async()=>{
  const h=harness();let p=h.quote();
  h.select('crypto-pair','ETH/USD');h.reply(quote());await p;
  assert.equal(h.get('crypto-quote-bid').textContent,'—');
  p=h.quote();h.reply(quote('ETH/USD'));await p;
  assert.notEqual(h.get('crypto-quote-bid').textContent,'—');
  p=h.quote();assert.equal(h.get('crypto-quote-bid').textContent,'—');
  h.reply({error:'mock unavailable'},false);await p;
  assert.equal(h.get('crypto-quote-bid').textContent,'—');
  assert.match(h.get('crypto-quote-status').textContent,/No current/);
});

test('mismatched quote response never populates selected pair',async()=>{
  const h=harness();const p=h.quote();h.reply(quote('ETH/USD'));await p;
  assert.equal(h.get('crypto-quote-bid').textContent,'—');
  assert.match(h.get('crypto-quote-status').textContent,/mismatch/);
});

test('missing fictional intervals are displayed as disconnected observations',async()=>{
  const h=harness(),p=h.submit();
  const report=candles();
  report.chartCandles=[
    {close:100,startUtc:'2026-11-26T13:00:00.000Z'},
    {close:101,startUtc:'2026-11-26T14:00:00.000Z'},
    {close:103,startUtc:'2026-11-26T18:00:00.000Z'},
    {close:102,startUtc:'2026-11-26T19:00:00.000Z'}
  ];
  report.completedCount=4;report.missingIntervals=3;
  h.reply(report);await p;
  const chart=h.get('crypto-price-chart');
  const lines=chart.children.filter(x=>Object.hasOwn(x.attributes,'points'));
  assert.equal(lines.length,2);
  assert.match(chart.attributes['aria-label'],/1 visible interval gaps, not interpolated/);
  const firstEnd=Number(lines[0].attributes.points.split(' ')[1].split(',')[0]);
  const secondStart=Number(lines[1].attributes.points.split(' ')[0].split(',')[0]);
  assert.ok(secondStart-firstEnd>400,'elapsed time gap must not be compressed');
});

test('duplicate or invalid chart times are rejected rather than silently plotted',async()=>{
  for(const startUtc of ['2026-11-26T18:00:00.000Z','invalid']){
    const h=harness(),p=h.submit(),report=candles();
    report.chartCandles[1].startUtc=startUtc;
    h.reply(report);await p;
    assert.equal(h.get('crypto-price-chart').children.length,0);
  }
});
