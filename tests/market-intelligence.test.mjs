import test from 'node:test';
import assert from 'node:assert/strict';
import {MARKET_DATA_SCHEMA,MARKET_DATA_SCHEMA_V2,assessMarketDataQuality,atr,evaluateSwingSetup,normalizeMarketDataset,rankWatchlist} from '../src/market-intelligence.mjs';

function bars(count=90,{drift=0.002,volume=100_000,breakout=false}={}){
  const output=[];let previous=100;const date=new Date('2026-01-01T00:00:00.000Z');
  while(output.length<count){
    date.setUTCDate(date.getUTCDate()+1);
    if([0,6].includes(date.getUTCDay()))continue;
    const index=output.length;
    const open=previous*(1+drift*.15);
    const close=open*(1+drift+(index%7-3)*0.0004);
    const high=Math.max(open,close)*1.006,low=Math.min(open,close)*0.994;
    output.push({
      date:date.toISOString().slice(0,10),
      open:Number(open.toFixed(6)),
      high:Number(high.toFixed(6)),
      low:Number(low.toFixed(6)),
      close:Number(close.toFixed(6)),
      volume:Math.round(volume*(1+(index%5)*0.03))
    });
    previous=close;
  }
  if(breakout){
    const latest=output.at(-1),priorHigh=Math.max(...output.slice(-21,-1).map(bar=>bar.high));
    latest.close=Number((priorHigh*1.01).toFixed(6));
    latest.open=Math.min(latest.open,latest.close);
    latest.high=Number((latest.close*1.005).toFixed(6));
    latest.low=Math.min(latest.low,latest.open,latest.close);
    latest.volume=Math.round(volume*1.7);
  }
  return output;
}
function dataset(symbol='TEST',options={}){
  const data=bars(90,options);
  return {
    schema:MARKET_DATA_SCHEMA,
    symbol,
    currency:'USD',
    source:'Permitted test fixture',
    mode:'DELAYED',
    sourceAsOf:data.at(-1).date,
    priceAdjustment:'VENDOR_ADJUSTED',
    bars:data
  };
}

test('normalizes a bounded provider-neutral completed-bar dataset',()=>{
  const value=normalizeMarketDataset(dataset());
  assert.equal(value.schema,MARKET_DATA_SCHEMA);
  assert.equal(value.symbol,'TEST');
  assert.equal(value.bars.length,90);
  assert.notEqual(value.bars,dataset().bars);
  assert.equal(value.provenance.contract,'LEGACY_V1_INFERRED');
  assert.equal(value.provenance.retrievedAt,null);
});

test('market-data readiness stays explicitly unverified and flags structural review conditions',()=>{
  const clean=assessMarketDataQuality(dataset());
  assert.equal(clean.status,'STRUCTURALLY_CLEAN_UNVERIFIED');
  assert.deepEqual(clean.reasons,[]);
  assert.equal(clean.verification.dataAuthenticityVerified,false);
  assert.equal(clean.verification.corporateActionsVerified,false);
  assert.equal(clean.verification.survivorshipBiasControlled,false);
  assert.equal(clean.verification.licensingVerified,false);
  assert.equal(clean.provenanceReview.status,'REVIEW_REQUIRED');
  assert.ok(clean.provenanceReview.reasons.includes('LEGACY_V1_PROVENANCE'));

  const review=dataset();
  review.priceAdjustment='UNKNOWN';
  review.bars[20].volume=0;
  const flagged=assessMarketDataQuality(review);
  assert.equal(flagged.status,'REVIEW_REQUIRED');
  assert.ok(flagged.reasons.includes('UNKNOWN_PRICE_ADJUSTMENT'));
  assert.ok(flagged.reasons.includes('ZERO_VOLUME_BARS'));
});

test('accepts explicit provenance v2 and rejects contradictory adjustment metadata',()=>{
  const input=dataset('V2');
  input.schema=MARKET_DATA_SCHEMA_V2;
  input.provenance={
    retrievedAt:'2026-10-06T15:00:00.000Z',
    adjustmentMethod:'PROVIDER_ADJUSTED_DOCUMENTED',
    corporateActions:'PROVIDER_ADJUSTED_NOT_INDEPENDENTLY_VERIFIED',
    survivorship:'NOT_ASSESSED',
    licensing:'USER_ASSERTED_PERMITTED'
  };
  const value=normalizeMarketDataset(input);
  assert.equal(value.schema,MARKET_DATA_SCHEMA_V2);
  assert.equal(value.provenance.contract,'V2_DECLARED');
  assert.equal(value.provenance.retrievedAt,'2026-10-06T15:00:00.000Z');
  assert.equal(assessMarketDataQuality(input).provenanceReview.status,'REVIEW_REQUIRED');

  const contradictory=structuredClone(input);
  contradictory.provenance.adjustmentMethod='RAW_UNADJUSTED';
  assert.throws(()=>normalizeMarketDataset(contradictory),/provider-adjusted methodology/);

  const impossibleTimeline=structuredClone(input);
  impossibleTimeline.provenance.retrievedAt='2025-12-31T23:59:59.000Z';
  assert.throws(()=>normalizeMarketDataset(impossibleTimeline),/cannot precede source as-of date/);
});

test('rejects malformed symbols, stale provenance and inconsistent bars',()=>{
  assert.throws(()=>normalizeMarketDataset({...dataset(),symbol:'bad symbol'}),/symbol/);
  assert.throws(()=>normalizeMarketDataset({...dataset(),sourceAsOf:'2025-01-01'}),/as-of/);
  const invalid=dataset();invalid.bars[30].high=invalid.bars[30].low-1;
  assert.throws(()=>normalizeMarketDataset(invalid),/inconsistent OHLC/);
});

test('swing evaluation is deterministic, paper-only and evidence-linked',()=>{
  const input=dataset('SWING',{breakout:true});
  const first=evaluateSwingSetup(input),second=evaluateSwingSetup(input);
  assert.deepEqual(first,second);
  assert.equal(first.symbol,'SWING');
  assert.ok(first.score>=0&&first.score<=100);
  assert.ok(['PAPER_SETUP_STRONG','PAPER_SETUP_WATCH','NO_PAPER_SETUP'].includes(first.classification));
  assert.ok(first.observed.atr14>0);
  assert.ok(first.paperRiskPlan.paperRiskBudget>0);
  assert.ok(first.paperRiskPlan.maxPaperUnits>=0);
  assert.equal(first.safety.realOrders,false);
  assert.equal(first.safety.brokerageConnected,false);
  assert.equal(first.safety.executionAllowed,false);
  assert.equal(first.safety.futureBarsUsed,false);
  assert.equal(first.dataQuality.status,'STRUCTURALLY_CLEAN_UNVERIFIED');
  assert.equal(first.evidence.every(item=>item.date===first.asOf),true);
});

test('later observations cannot alter an earlier completed-bar evaluation',()=>{
  const input=dataset('ISOLATE',{breakout:true});
  const earlier=evaluateSwingSetup(input,{asOfIndex:70});
  const changed=structuredClone(input);
  for(let index=71;index<changed.bars.length;index++){
    changed.bars[index].open*=3;changed.bars[index].high*=3;changed.bars[index].low*=3;changed.bars[index].close*=3;
    changed.bars[index].volume*=5;
  }
  assert.deepEqual(evaluateSwingSetup(changed,{asOfIndex:70}),earlier);
});

test('ATR uses only completed observations through the requested index',()=>{
  const input=dataset(),value=atr(input.bars,60,14);
  assert.ok(value>0);
  const changed=structuredClone(input.bars);
  changed[61].high*=10;
  assert.equal(atr(changed,60,14),value);
});

test('watchlist ranking is deterministic and rejects duplicate symbols',()=>{
  const ranked=rankWatchlist([
    dataset('AAA',{drift:0.003,breakout:true}),
    dataset('BBB',{drift:-0.001}),
    dataset('CCC',{drift:0.001})
  ]);
  assert.equal(ranked.length,3);
  assert.ok(ranked[0].score>=ranked[1].score);
  assert.ok(ranked[1].score>=ranked[2].score);
  assert.deepEqual(ranked,rankWatchlist([
    dataset('AAA',{drift:0.003,breakout:true}),
    dataset('BBB',{drift:-0.001}),
    dataset('CCC',{drift:0.001})
  ]));
  assert.throws(()=>rankWatchlist([dataset('AAA'),dataset('AAA')]),/unique/);
});

test('paper risk bounds are explicit and reject oversized risk settings',()=>{
  const input=dataset();
  const value=evaluateSwingSetup(input,{paperCapital:25_000,paperRiskFraction:0.02});
  assert.equal(value.paperRiskPlan.paperCapital,25_000);
  assert.equal(value.paperRiskPlan.paperRiskBudget,500);
  assert.throws(()=>evaluateSwingSetup(input,{paperRiskFraction:0.10}),/risk fraction/);
  assert.throws(()=>evaluateSwingSetup(input,{paperCapital:0}),/paper capital/);
});


test('market dates reject impossible leap and month-end days instead of silently rolling forward',()=>{
  const invalidAsOf=dataset();
  invalidAsOf.sourceAsOf='2026-02-30';
  assert.throws(()=>normalizeMarketDataset(invalidAsOf),/Invalid source as-of date/);

  const invalidBar=dataset();
  invalidBar.bars[10].date='2026-02-29';
  assert.throws(()=>normalizeMarketDataset(invalidBar),/invalid date/);

  const provenance=dataset('DATES');
  provenance.schema=MARKET_DATA_SCHEMA_V2;
  provenance.provenance={
    retrievedAt:'2026-02-30T12:00:00.000Z',
    adjustmentMethod:'PROVIDER_ADJUSTED_DOCUMENTED',
    corporateActions:'NOT_VERIFIED',
    survivorship:'NOT_ASSESSED',
    licensing:'USER_ASSERTED_PERMITTED'
  };
  assert.throws(()=>normalizeMarketDataset(provenance),/Invalid market-data retrieval timestamp/);
});
