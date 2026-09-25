import test from 'node:test';
import assert from 'node:assert/strict';
import {generateScenario,initialState,report} from '../src/engine.mjs';
import {parseHistoricalCsv,analyzeHistoricalResearch,evaluateSlice,MAX_BYTES} from '../public/research-core.mjs';
const columns='date,open,high,low,close,volume\n';
const bars=generateScenario(73,190);
const csvOf=(rows)=>columns+rows.map(b=>[b.date,b.open,b.high,b.low,b.close,b.volume].join(',')).join('\n')+'\n';
const uploaded=()=>parseHistoricalCsv(csvOf(bars));
test('parses only complete ordered OHLCV and attaches unverified provenance',()=>{
  const value=uploaded();
  assert.equal(value.kind,'USER_SUPPLIED_UNVERIFIED_CSV');
  assert.equal(value.bars.length,190);
  assert.equal(value.priceAdjustment,'UNKNOWN');
  assert.match(value.warnings.join(' '),/cannot be independently verified/);
});
test('training and later holdout are disjoint with fixed chronological boundary',()=>{
  const research=analyzeHistoricalResearch(uploaded(),'My permitted example CSV');
  assert.equal(research.split,'CHRONOLOGICAL_70_30_FIXED');
  assert.equal(research.mode,'UPLOADED_UNVERIFIED_HISTORICAL_CSV');
  assert.equal(research.train.end,bars[132].date);
  assert.equal(research.holdout.start,bars[133].date);
  assert.equal(research.holdout.end,bars.at(-1).date);
  assert.equal(research.fileNeverSentToServer,true);
  assert.notEqual(research.train.start,research.holdout.start);
  assert.ok(research.limitations.some(message=>message.includes('not authenticated')));
});
test('later-price revisions do not alter earlier experiment results',()=>{
  const baseline=uploaded().bars;
  const future=structuredClone(baseline),last=future.at(-1);
  last.close=last.open*0.92;last.high=Math.max(last.open,last.close);last.low=Math.min(last.open,last.close);
  assert.deepEqual(evaluateSlice(baseline,20,132),evaluateSlice(future,20,132));
  const before=analyzeHistoricalResearch({kind:'USER_SUPPLIED_UNVERIFIED_CSV',bars:baseline,warnings:[]},'Example export');
  const after=analyzeHistoricalResearch({kind:'USER_SUPPLIED_UNVERIFIED_CSV',bars:future,warnings:[]},'Example export');
  assert.deepEqual(before.train,after.train);
  assert.notEqual(before.holdout.comparisonReturnPct,after.holdout.comparisonReturnPct);
});
test('hypothetical fills require the following bar and do not mutate synthetic ledger',()=>{
  const paper=initialState(),unchanged=structuredClone(paper);
  const reportBefore=report(paper);
  const research=analyzeHistoricalResearch(uploaded(),'Example data');
  for(const period of [research.train,research.holdout]){
    const start=bars.findIndex(b=>b.date===period.start),end=bars.findIndex(b=>b.date===period.end);
    for(const fill of period.fills){
      const signal=bars.findIndex(b=>b.date===fill.signalDate),execution=bars.findIndex(b=>b.date===fill.fillDate);
      assert.ok(signal>=start&&execution<=end);
      assert.equal(execution,signal+1);
      assert.ok(fill.kind.startsWith('SIMULATED_')&&fill.fee>=0.5);
    }
    assert.ok(period.simulatedEndValue>=0);
    assert.ok(period.simulatedFees>=0);
  }
  assert.deepEqual(paper,unchanged);
  assert.deepEqual(report(paper),reportBefore);
});
test('rejects malformed prices, volume, dates and out-of-order rows',()=>{
  const cases=[
    csvOf(bars).replace(bars[3].date,'2024-02-30'),
    csvOf(bars).replace(String(bars[3].volume),'-1'),
    csvOf(bars).replace(String(bars[4].open),'-100'),
    csvOf([...bars].reverse()),
    csvOf(bars).replace(bars[7].date,bars[6].date),
    csvOf(bars).replace('date,open,high,low,close,volume','date,open,high,low,close,volume,secret')
  ];
  for(const data of cases)assert.throws(()=>parseHistoricalCsv(data));
});
test('rejects short, oversized, missing and invalid source datasets',()=>{
  assert.throws(()=>parseHistoricalCsv(csvOf(bars.slice(0,95))),/100/);
  assert.throws(()=>parseHistoricalCsv(columns+'x'.repeat(MAX_BYTES+1)),/too large/);
  assert.throws(()=>analyzeHistoricalResearch(uploaded(),''),/source label/);
  assert.throws(()=>analyzeHistoricalResearch({...uploaded(),kind:'VERIFIED_REAL_DATA'},'Example'),/Invalid/);
});
test('warns on gaps and zero trading volume rather than silently treating them as liquid days',()=>{
  const data=structuredClone(bars);data.splice(80,6);data[10].volume=0;
  const value=parseHistoricalCsv(csvOf(data));
  assert.match(value.warnings.join(' '),/multi-day gap/i);
  assert.match(value.warnings.join(' '),/zero-volume/i);
  const evaluation=analyzeHistoricalResearch(value,'Example dataset');
  assert.ok(evaluation.holdout.simulatedFees>=0);
});
test('held-out cost stress keeps the strategy and time boundary fixed while changing only modeled friction',()=>{
  const dataset=uploaded(),result=analyzeHistoricalResearch(dataset,'Example data');
  assert.equal(result.engine,'historical-csv-v3-chronological-consistency');
  assert.deepEqual(result.holdoutStress.map(s=>s.multiplier),[2,4]);
  assert.equal(result.holdout.modelCosts.multiplier,1);
  for(const stress of result.holdoutStress){
    assert.equal(stress.start,result.holdout.start);
    assert.equal(stress.end,result.holdout.end);
    assert.equal(stress.bars,result.holdout.bars);
    assert.equal(stress.modelCosts.feeRate,result.holdout.modelCosts.feeRate*stress.multiplier);
    assert.equal(stress.modelCosts.slippage,result.holdout.modelCosts.slippage*stress.multiplier);
    assert.equal(stress.modelCosts.minFee,result.holdout.modelCosts.minFee*stress.multiplier);
    const {multiplier,...metrics}=stress;
    assert.deepEqual(metrics,evaluateSlice(dataset.bars,133,189,{costMultiplier:multiplier}));
    for(const fill of stress.fills){
      assert.ok(fill.signalDate<fill.fillDate);
      assert.ok(fill.fee>=stress.modelCosts.minFee);
    }
  }
  assert.throws(()=>evaluateSlice(dataset.bars,133,189,{costMultiplier:0}),/cost multiplier/);
  assert.throws(()=>evaluateSlice(dataset.bars,133.5,189),/Invalid research window/);
});
test('later-data changes cannot alter any earlier-period cost-stress calculation',()=>{
  const before=uploaded().bars,after=structuredClone(before);
  after[180].close*=0.8;after[180].low=Math.min(after[180].low,after[180].close);
  for(const costMultiplier of [1,2,4])assert.deepEqual(
    evaluateSlice(before,20,132,{costMultiplier}),evaluateSlice(after,20,132,{costMultiplier}));
});
test('deterministic holdout results are reproducible across independent runs',()=>{
  const dataset=uploaded();
  assert.deepEqual(analyzeHistoricalResearch(dataset,'Example'),analyzeHistoricalResearch(dataset,'Example'));
});

test('three chronological consistency segments are disjoint, reproducible and descriptive only',()=>{
  const data=uploaded(),result=analyzeHistoricalResearch(data,'Example synthetic observations');
  const checks=result.chronologicalChecks;
  assert.deepEqual(checks.map(c=>c.segment),[1,2,3]);
  assert.equal(checks[0].start,bars[20].date);
  assert.equal(checks[2].end,bars.at(-1).date);
  assert.ok(result.limitations.some(s=>s.includes('not independent market regimes')));
  for(let i=0;i<checks.length;i++){
    assert.ok(checks[i].bars>=3);
    assert.ok(checks[i].simulatedEndValue>=0);
    if(i)assert.ok(checks[i-1].end<checks[i].start,'Segments overlap');
  }
  assert.deepEqual(checks,analyzeHistoricalResearch(data,'Example synthetic observations').chronologicalChecks);
  const later=structuredClone(data);
  later.bars[180].close*=0.9;
  later.bars[180].low=Math.min(later.bars[180].low,later.bars[180].close);
  assert.deepEqual(checks[0],analyzeHistoricalResearch(later,'Example synthetic observations').chronologicalChecks[0],
    'A later price must not change an earlier segment');
});
