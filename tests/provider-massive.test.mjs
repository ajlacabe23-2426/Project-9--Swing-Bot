import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMassiveDailyUrl,fetchMassiveDailyDataset} from '../src/providers/massive.mjs';

function results(count=90){
  const out=[];let price=100;const date=new Date('2026-01-01T00:00:00.000Z');
  while(out.length<count){
    date.setUTCDate(date.getUTCDate()+1);
    if([0,6].includes(date.getUTCDay()))continue;
    const open=price,close=price*1.002,high=Math.max(open,close)*1.005,low=Math.min(open,close)*0.995;
    out.push({t:date.getTime(),o:open,h:high,l:low,c:close,v:100000+out.length});
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
  assert.equal(value.symbol,'AAPL');
  assert.equal(value.mode,'HISTORICAL');
  assert.equal(value.priceAdjustment,'VENDOR_ADJUSTED');
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
    fetchImpl:async()=>({ok:true,status:200,json:async()=>({status:'OK',results:results(20)})})
  }),/at least 60/);
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
