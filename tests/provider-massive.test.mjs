import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMassiveDailyUrl,fetchMassiveDailyDataset} from '../src/providers/massive.mjs';
import {MARKET_DATA_SCHEMA_V2,normalizeMarketDataset} from '../src/market-intelligence.mjs';
import {analyzeDailyBreakout} from '../src/daily-breakout-research.mjs';

function results(count=90){
  const out=[];let price=100;const date=new Date('2026-01-01T00:00:00.000Z');
  while(out.length<count){
    date.setUTCDate(date.getUTCDate()+1);
    if([0,6].includes(date.getUTCDay()))continue;
    const open=price,close=price*1.002,high=Math.max(open,close)*1.005,low=Math.min(open,close)*0.995;
    const easternOffset=date<new Date('2026-03-08')?5:4;
    out.push({t:date.getTime()+easternOffset*3600000,o:open,h:high,l:low,c:close,v:100000+out.length});
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
  assert.equal(url.searchParams.get('apiKey'),null);
  assert.doesNotMatch(String(url),/test-key-123/);
});

test('maps Massive daily aggregates into the Project 9 market-data contract',async()=>{
  let requested=null,requestOptions=null;
  const fetchImpl=async (url,options)=>{
    requested=String(url);requestOptions=options;
    return {ok:true,status:200,json:async()=>({status:'OK',ticker:'AAPL',results:results()})};
  };
  const value=await fetchMassiveDailyDataset({
    symbol:'AAPL',from:'2026-01-01',to:'2026-06-30',apiKey:'test-key-123',fetchImpl
  });
  assert.match(requested,/api\.massive\.com/);
  assert.doesNotMatch(requested,/test-key-123/);
  assert.equal(requestOptions.headers.Authorization,'Bearer test-key-123');
  assert.equal(requestOptions.redirect,'error');
  assert.equal(value.schema,MARKET_DATA_SCHEMA_V2);
  assert.equal(value.symbol,'AAPL');
  assert.equal(value.mode,'HISTORICAL');
  assert.equal(value.priceAdjustment,'VENDOR_ADJUSTED');
  assert.equal(Object.hasOwn(value.provenance,'contract'),false);
  assert.equal(normalizeMarketDataset(value).provenance.contract,'V2_DECLARED');
  const serialized=JSON.parse(JSON.stringify(value));
  assert.equal(analyzeDailyBreakout(serialized).symbol,'AAPL');
  assert.equal(analyzeDailyBreakout(serialized).schema,'project9-locked-daily-breakout-research-v2');
  assert.equal(value.provenance.adjustmentMethod,'PROVIDER_ADJUSTED_UNVERIFIED');
  assert.equal(value.provenance.corporateActions,'PROVIDER_ADJUSTED_NOT_INDEPENDENTLY_VERIFIED');
  assert.equal(value.provenance.survivorship,'NOT_ASSESSED');
  assert.equal(value.provenance.licensing,'PROVIDER_TERMS_REVIEW_REQUIRED');
  assert.ok(Number.isFinite(Date.parse(value.provenance.retrievedAt)));
  assert.equal(value.bars.length,90);
  assert.equal(value.sourceAsOf,value.bars.at(-1).date);
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


test('provider rejects invalid OHLCV fields and intraday timestamps',async()=>{
  const request={symbol:'AAPL',from:'2026-01-01',to:'2026-06-30',apiKey:'test-key-123'};
  const valid=results();
  const wrong=[
    {v:null},
    {v:undefined},
    {v:'100000'},
    {v:Infinity},
    {v:Number.MAX_SAFE_INTEGER+1},
    {v:-1},
    {o:'100'},
    {h:null},
    {l:undefined},
    {c:Infinity},
    {t:String(valid[0].t)},
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

test('accepts delayed daily data across the Eastern daylight saving change',async()=>{
  const bars=results();
  bars[34].v=100034.25;
  assert.equal(new Date(bars[0].t).toISOString(),'2026-01-02T05:00:00.000Z');
  assert.equal(new Date(bars.find(bar=>new Date(bar.t).toISOString().startsWith('2026-03-09')).t).toISOString(),
    '2026-03-09T04:00:00.000Z');
  const dataset=await fetchMassiveDailyDataset({
    symbol:'AAPL',from:'2026-01-01',to:'2026-06-30',apiKey:'test-key-123',
    fetchImpl:async()=>({ok:true,status:200,json:async()=>({status:'DELAYED',ticker:'AAPL',results:bars})})
  });
  assert.equal(dataset.bars[0].date,'2026-01-02');
  assert.equal(dataset.bars[34].volume,100034.25);
  assert.equal(normalizeMarketDataset(dataset).bars[34].volume,100034.25);
  assert.equal(analyzeDailyBreakout(dataset).symbol,'AAPL');
  assert.ok(dataset.bars.some(bar=>bar.date==='2026-03-09'));
});


test('provider refuses a truncated/paginated response and inconsistent returned count',async()=>{
  const request={symbol:'AAPL',from:'2026-01-01',to:'2026-06-30',apiKey:'test-key-123'};
  const valid=results();
  for(const extras of [{next_url:'https://api.massive.com/some-more-results'},
                       {resultsCount:valid.length+1},{resultsCount:'90'}]){
    await assert.rejects(()=>fetchMassiveDailyDataset({
      ...request,fetchImpl:async()=>({ok:true,status:200,
        json:async()=>({status:'OK',ticker:'AAPL',results:valid,...extras})})
    }),/paginated|count is inconsistent/);
  }
});

test('credential never enters request URL and missing key is rejected before network calls',async()=>{
  let calls=0,receivedUrl;
  const secret='SENSITIVE-KEY-DO-NOT-LOG';
  await fetchMassiveDailyDataset({
    symbol:'AAPL',from:'2026-01-01',to:'2026-06-30',apiKey:secret,
    fetchImpl:async(url,opts)=>{
      calls++;receivedUrl=String(url);
      assert.equal(opts.headers.Authorization,'Bearer '+secret);
      assert.doesNotMatch(receivedUrl,/SENSITIVE-KEY-DO-NOT-LOG/);
      assert.equal(opts.redirect,'error');
      return {ok:true,status:200,json:async()=>({status:'OK',ticker:'AAPL',results:results()})};
    }
  });
  assert.equal(calls,1);
  await assert.rejects(()=>fetchMassiveDailyDataset({
    symbol:'AAPL',from:'2026-01-01',to:'2026-06-30',apiKey:'',
    fetchImpl:async()=>{calls++;throw Error('unexpected');}
  }),/API key is required/);
  assert.equal(calls,1);
});
