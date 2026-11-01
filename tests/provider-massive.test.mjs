import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMassiveDailyUrl,fetchMassiveDailyDataset} from '../src/providers/massive.mjs';
import {MARKET_DATA_SCHEMA_V2} from '../src/market-intelligence.mjs';

// A daily US equity bar starts at 00:00 New York time. For 2026 test
// fixtures, spring DST starts March 8 and autumn DST ends November 1.
function exchangeMidnight(date){
  const day=date.toISOString().slice(0,10);
  const utcHour=day>='2026-03-08'&&day<'2026-11-01'?'04':'05';
  return Date.parse(day+'T'+utcHour+':00:00.000Z');
}

function results(count=90){
  const out=[];let price=100;const date=new Date('2026-01-01T00:00:00.000Z');
  while(out.length<count){
    date.setUTCDate(date.getUTCDate()+1);
    if([0,6].includes(date.getUTCDay()))continue;
    const open=price,close=price*1.002,high=Math.max(open,close)*1.005,low=Math.min(open,close)*0.995;
    out.push({t:exchangeMidnight(date),o:open,h:high,l:low,c:close,v:100000+out.length});
    price=close;
  }
  return out;
}

test('builds an adjusted ascending daily Massive aggregate URL',()=>{
  const url=buildMassiveDailyUrl({symbol:'aapl',from:'2026-01-01',to:'2026-05-31',apiKey:'test-key-123'});
  assert.equal(url.origin,'https://api.massive.com');
  assert.match(url.pathname,/\/v2\/aggs\/ticker\/AAPL\/range\/1\/day\/2026-01-01\/2026-05-31/);
  assert.equal(url.searchParams.get('adjusted'),'true');
  assert.equal(url.searchParams.get('sort'),'asc');
  assert.equal(url.searchParams.get('apiKey'),'test-key-123');
});

test('maps Massive daily aggregates into the Project 9 market-data contract',async()=>{
  let requested=null;
  const fetchImpl=async url=>{
    requested=String(url);
    return {ok:true,status:200,json:async()=>({status:'OK',ticker:'AAPL',results:results()})};
  };
  const value=await fetchMassiveDailyDataset({
    symbol:'AAPL',from:'2026-01-01',to:'2026-06-30',apiKey:'test-key-123',fetchImpl
  });
  assert.match(requested,/api\.massive\.com/);
  assert.equal(value.schema,MARKET_DATA_SCHEMA_V2);
  assert.equal(value.symbol,'AAPL');
  assert.equal(value.mode,'HISTORICAL');
  assert.equal(value.priceAdjustment,'VENDOR_ADJUSTED');
  assert.equal(value.provenance.contract,'V2_DECLARED');
  assert.equal(value.provenance.adjustmentMethod,'PROVIDER_ADJUSTED_UNVERIFIED');
  assert.equal(value.provenance.corporateActions,'PROVIDER_ADJUSTED_NOT_INDEPENDENTLY_VERIFIED');
  assert.equal(value.provenance.survivorship,'NOT_ASSESSED');
  assert.equal(value.provenance.licensing,'PROVIDER_TERMS_REVIEW_REQUIRED');
  assert.ok(Number.isFinite(Date.parse(value.provenance.retrievedAt)));
  assert.equal(value.bars.length,90);
  // The source's 04:00/05:00 UTC daily timestamps map to the correct
  // local trading dates across the March daylight-saving change.
  assert.equal(value.bars[0].date,'2026-01-02');
  assert.ok(value.bars.some(bar=>bar.date==='2026-03-09'));
  assert.equal(value.sourceAsOf,value.bars.at(-1).date);
});

test('accepts a legitimate fractional-volume day without rounding or changing subsequent bars',async()=>{
  const rows=results(140);
  // Mirror the 117th returned daily bar that previously failed locally.
  rows[116].v=114723.250625;
  const data=await fetchMassiveDailyDataset({
    symbol:'AAPL',from:'2026-01-01',to:'2026-08-31',apiKey:'test-key-123',
    fetchImpl:async()=>({ok:true,status:200,json:async()=>({status:'OK',ticker:'AAPL',results:rows})})
  });
  assert.equal(data.bars.length,140);
  assert.equal(data.bars[116].volume,114723.250625);
  assert.equal(data.bars[117].volume,rows[117].v);
});

test('fails closed for provider errors, malformed payloads and short history',async()=>{
  await assert.rejects(()=>fetchMassiveDailyDataset({
    symbol:'AAPL',from:'2026-01-01',to:'2026-06-30',apiKey:'test-key-123',
    fetchImpl:async()=>({ok:false,status:429,json:async()=>({})})
  }),/status 429/);
  await assert.rejects(()=>fetchMassiveDailyDataset({
    symbol:'AAPL',from:'2026-01-01',to:'2026-06-30',apiKey:'test-key-123',
    fetchImpl:async()=>({ok:true,status:200,json:async()=>({status:'ERROR'})})
  }),/invalid aggregate response/);
  await assert.rejects(()=>fetchMassiveDailyDataset({
    symbol:'AAPL',from:'2026-01-01',to:'2026-02-01',apiKey:'test-key-123',
    fetchImpl:async()=>({ok:true,status:200,json:async()=>({status:'OK',ticker:'AAPL',results:results(20)})})
  }),/at least 60/);
});

test('provider refuses a successful response for another ticker or a bar outside the requested window',async()=>{
  const request={symbol:'AAPL',from:'2026-01-01',to:'2026-06-30',apiKey:'test-key-123'};
  await assert.rejects(()=>fetchMassiveDailyDataset({
    ...request,fetchImpl:async()=>({ok:true,status:200,json:async()=>({status:'OK',ticker:'MSFT',results:results()})})
  }),/ticker does not match/);
  await assert.rejects(()=>fetchMassiveDailyDataset({
    ...request,fetchImpl:async()=>({ok:true,status:200,json:async()=>({status:'OK',results:results()})})
  }),/ticker does not match/);
  const outOfWindow=results();
  outOfWindow[0]={...outOfWindow[0],t:Date.parse('2025-12-31T05:00:00.000Z')};
  await assert.rejects(()=>fetchMassiveDailyDataset({
    ...request,fetchImpl:async()=>({ok:true,status:200,json:async()=>({status:'OK',ticker:'AAPL',results:outOfWindow})})
  }),/outside the requested date range/);
  const afterWindow=results();
  afterWindow[afterWindow.length-1]={...afterWindow.at(-1),t:Date.parse('2026-07-01T04:00:00.000Z')};
  await assert.rejects(()=>fetchMassiveDailyDataset({
    ...request,fetchImpl:async()=>({ok:true,status:200,json:async()=>({status:'OK',ticker:'AAPL',results:afterWindow})})
  }),/outside the requested date range/);
});

test('does not echo the API key in network failure errors',async()=>{
  const secret='sensitive-test-key';
  await assert.rejects(
    ()=>fetchMassiveDailyDataset({
      symbol:'AAPL',from:'2026-01-01',to:'2026-06-30',apiKey:secret,
      fetchImpl:async()=>{throw new Error('failed '+secret);}
    }),
    error=>!String(error.message).includes(secret)
  );
});


test('provider rejects impossible calendar dates before requesting market data',()=>{
  assert.throws(()=>buildMassiveDailyUrl({
    symbol:'AAPL',from:'2026-02-29',to:'2026-03-31',apiKey:'test-key-123'
  }),/Invalid Massive date range/);
  assert.throws(()=>buildMassiveDailyUrl({
    symbol:'AAPL',from:'2026-01-01',to:'2026-04-31',apiKey:'test-key-123'
  }),/Invalid Massive date range/);
  assert.doesNotThrow(()=>buildMassiveDailyUrl({
    symbol:'AAPL',from:'2024-02-29',to:'2024-03-01',apiKey:'test-key-123'
  }));
});


test('provider rejects coerced, absent or invalid OHLCV fields and intraday timestamps',async()=>{
  const request={symbol:'AAPL',from:'2026-01-01',to:'2026-06-30',apiKey:'test-key-123'};
  const valid=results();
  const wrong=[
    {v:null},
    {v:undefined},
    {v:'100000'},
    {v:-1},
    {v:Infinity},
    {v:NaN},
    {v:Number.MAX_SAFE_INTEGER+1},
    {o:'100'},
    {h:null},
    {l:undefined},
    {c:Infinity},
    {t:String(valid[0].t)},
    {t:Date.parse('2026-01-02T00:00:00.000Z')}, // UTC midnight != exchange midnight
    {t:valid[0].t+60_000},
  ];
  for(const change of wrong){
    const modified=valid.map((bar,index)=>index===0?{...bar,...change}:bar);
    await assert.rejects(()=>fetchMassiveDailyDataset({
      ...request,
      fetchImpl:async()=>({ok:true,status:200,json:async()=>({
        status:'OK',ticker:'AAPL',results:modified
      })})
    }),/Massive aggregate 0 is malformed/);
  }
});
