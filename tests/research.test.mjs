import test from 'node:test';
import assert from 'node:assert/strict';
import {generateScenario,initialState,report} from '../src/engine.mjs';
import {parseHistoricalCsv,analyzeHistoricalResearch,evaluateSlice,buildWalkForwardEvaluation,datasetFingerprint,buildExperimentManifest,summarizeDataQuality,normalizeResearchProvenance,assessResearchReadiness,MAX_BYTES} from '../public/research-core.mjs';
const columns='date,open,high,low,close,volume\n';
const bars=generateScenario(73,190);
const csvOf=(rows)=>columns+rows.map(b=>[b.date,b.open,b.high,b.low,b.close,b.volume].join(',')).join('\n')+'\n';
const uploaded=()=>parseHistoricalCsv(csvOf(bars));
const provenance=(overrides={})=>({
  source:'Example permitted historical export',
  instrument:'SIM-01',
  currency:'USD',
  priceAdjustment:'UNKNOWN',
  asOfDate:bars.at(-1).date,
  ...overrides
});
test('parses only complete ordered OHLCV and attaches unverified provenance',()=>{
  const value=uploaded();
  assert.equal(value.kind,'USER_SUPPLIED_UNVERIFIED_CSV');
  assert.equal(value.bars.length,190);
  assert.equal(value.priceAdjustment,'UNKNOWN');
  assert.equal(value.dataQuality.observedBars,190);
  assert.equal(value.dataQuality.zeroVolumeBars,0);
  assert.match(value.warnings.join(' '),/cannot be independently verified/);
});
test('training and later holdout are disjoint with fixed chronological boundary',()=>{
  const research=analyzeHistoricalResearch(uploaded(),provenance({source:'My permitted example CSV'}));
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
  const before=analyzeHistoricalResearch({kind:'USER_SUPPLIED_UNVERIFIED_CSV',bars:baseline,warnings:[]},provenance({source:'Example export'}));
  const after=analyzeHistoricalResearch({kind:'USER_SUPPLIED_UNVERIFIED_CSV',bars:future,warnings:[]},provenance({source:'Example export'}));
  assert.deepEqual(before.train,after.train);
  assert.deepEqual(before.walkForward,after.walkForward);
  assert.notEqual(before.holdout.comparisonReturnPct,after.holdout.comparisonReturnPct);
});
test('hypothetical fills require the following bar and do not mutate synthetic ledger',()=>{
  const paper=initialState(),unchanged=structuredClone(paper);
  const reportBefore=report(paper);
  const research=analyzeHistoricalResearch(uploaded(),provenance({source:'Example data'}));
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
  assert.throws(()=>analyzeHistoricalResearch(uploaded(),provenance({source:''})),/source label/);
  assert.throws(()=>analyzeHistoricalResearch({...uploaded(),kind:'VERIFIED_REAL_DATA'},provenance({source:'Example'})),/Invalid/);
});
test('warns on gaps and zero trading volume rather than silently treating them as liquid days',()=>{
  const data=structuredClone(bars);data.splice(80,6);data[10].volume=0;
  const value=parseHistoricalCsv(csvOf(data));
  assert.match(value.warnings.join(' '),/multi-day gap/i);
  assert.match(value.warnings.join(' '),/zero-volume/i);
  const evaluation=analyzeHistoricalResearch(value,provenance({source:'Example dataset',asOfDate:value.bars.at(-1).date}));
  assert.ok(evaluation.holdout.simulatedFees>=0);
});

test('data-quality summary is deterministic and follows the imported observations',()=>{
  const data=structuredClone(bars);data.splice(80,6);data[10].volume=0;
  data[20].open=data[19].close*1.4;data[20].high=Math.max(data[20].high,data[20].open,data[20].close);
  const parsed=parseHistoricalCsv(csvOf(data)),quality=parsed.dataQuality;
  assert.deepEqual(quality,summarizeDataQuality(parsed.bars));
  assert.equal(quality.observedBars,data.length);
  assert.equal(quality.zeroVolumeBars,1);
  assert.ok(quality.multiDayGaps>=1);
  assert.ok(quality.largeAdjacentOpenGaps>=1);
  assert.ok(quality.maxCalendarGapDays>5);
});

test('held-out cost stress keeps the strategy and time boundary fixed while changing only modeled friction',()=>{
  const dataset=uploaded(),result=analyzeHistoricalResearch(dataset,provenance({source:'Example data'}));
  assert.equal(result.engine,'historical-csv-v7-walk-forward');
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
  assert.deepEqual(analyzeHistoricalResearch(dataset,provenance({source:'Example'})),analyzeHistoricalResearch(dataset,provenance({source:'Example'})));
});


test('walk-forward folds use expanding development history and never enter the untouched holdout',()=>{
  const dataset=uploaded(),result=analyzeHistoricalResearch(dataset,provenance({source:'Example'}));
  assert.equal(result.walkForward.length,4);
  assert.equal(result.walkForward.at(-1).end,result.train.end);
  for(let i=0;i<result.walkForward.length;i++){
    const fold=result.walkForward[i];
    assert.ok(fold.trainingEnd<fold.start);
    assert.ok(fold.end<=result.train.end);
    assert.ok(fold.end<result.holdout.start);
    assert.ok(fold.trainingBars>=40);
    assert.ok(Number.isFinite(fold.excessReturnVsComparisonPct));
    assert.ok(fold.comparisonMaxDrawdownPct<=0);
    if(i){
      assert.ok(result.walkForward[i-1].end<fold.start);
      assert.ok(result.walkForward[i-1].trainingBars<fold.trainingBars);
    }
  }
  assert.throws(()=>buildWalkForwardEvaluation(dataset.bars,30),/walk-forward configuration/);
});

test('benchmark diagnostics are explicit and deterministic for every research period',()=>{
  const result=analyzeHistoricalResearch(uploaded(),provenance({source:'Example'}));
  for(const period of [result.train,result.holdout,...result.walkForward,...result.holdoutStress]){
    assert.ok(period.comparisonEndValue>0);
    assert.ok(Number.isFinite(period.comparisonReturnPct));
    assert.ok(Number.isFinite(period.excessReturnVsComparisonPct));
    assert.ok(period.comparisonMaxDrawdownPct<=0);
    assert.ok(Math.abs(period.excessReturnVsComparisonPct-(period.simulatedReturnPct-period.comparisonReturnPct))<0.02);
  }
});

test('data quality flags duplicate OHLCV transitions and stale close runs without inventing provenance',()=>{
  const data=structuredClone(bars);
  data[31]={...data[30],date:data[31].date};
  for(const index of [41,42]){
    data[index].close=data[40].close;
    data[index].high=Math.max(data[index].high,data[index].open,data[index].close);
    data[index].low=Math.min(data[index].low,data[index].open,data[index].close);
  }
  const quality=summarizeDataQuality(data);
  assert.ok(quality.duplicateOhlcvTransitions>=1);
  assert.ok(quality.longestFlatCloseRun>=3);
  const readiness=assessResearchReadiness(quality,'VENDOR_ADJUSTED');
  assert.ok(readiness.reviewReasons.includes('DUPLICATE_OHLCV_TRANSITION'));
  assert.ok(readiness.reviewReasons.includes('STALE_CLOSE_RUN'));
});

test('three chronological consistency segments are disjoint, reproducible and descriptive only',()=>{
  const data=uploaded(),result=analyzeHistoricalResearch(data,provenance({source:'Example synthetic observations'}));
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
  assert.deepEqual(checks,analyzeHistoricalResearch(data,provenance({source:'Example synthetic observations'})).chronologicalChecks);
  const later=structuredClone(data);
  later.bars[180].close*=0.9;
  later.bars[180].low=Math.min(later.bars[180].low,later.bars[180].close);
  assert.deepEqual(checks[0],analyzeHistoricalResearch(later,provenance({source:'Example synthetic observations'})).chronologicalChecks[0],
    'A later price must not change an earlier segment');
});

test('a locally computed SHA-256 fingerprint distinguishes source bytes reproducibly',async()=>{
  const first=csvOf(bars),second=first.replace(bars[3].date,bars[4].date);
  const a=await datasetFingerprint(first);
  assert.match(a,/^[0-9a-f]{64}$/);
  assert.equal(await datasetFingerprint(first),a);
  assert.notEqual(await datasetFingerprint(second),a);
  await assert.rejects(()=>datasetFingerprint(''),/bounded local CSV/);
  await assert.rejects(()=>datasetFingerprint('x'.repeat(MAX_BYTES+1)),/bounded local CSV/);
});

test('experiment manifest is deterministic, compact and explicitly non-executable',async()=>{
  const csv=csvOf(bars),parsed=uploaded(),result=analyzeHistoricalResearch(parsed,provenance({source:'Example permitted data'}));
  const fingerprint=await datasetFingerprint(csv);
  const first=buildExperimentManifest(result,fingerprint),second=buildExperimentManifest(result,fingerprint);
  assert.deepEqual(first,second);
  assert.equal(first.schema,'project9-research-manifest-v3');
  assert.equal(first.dataset.sha256,fingerprint);
  assert.equal(first.dataset.fileIncluded,false);
  assert.equal(first.dataset.independentlyVerified,false);
  assert.equal(first.dataset.instrumentDeclaredByUser,'SIM-01');
  assert.equal(first.dataset.currencyDeclaredByUser,'USD');
  assert.equal(first.dataset.priceAdjustmentDeclaredByUser,'UNKNOWN');
  assert.equal(first.dataset.sourceAsOfDate,bars.at(-1).date);
  assert.deepEqual(first.dataset.dataQuality,result.dataQuality);
  assert.deepEqual(first.dataset.researchReadiness,result.researchReadiness);
  assert.equal(first.safety.realOrders,false);
  assert.equal(first.safety.brokerageConnected,false);
  assert.equal(first.safety.investmentRecommendation,false);
  assert.equal(first.safety.resultType,'HYPOTHETICAL_SIMULATION');
  assert.equal('fills' in first.experiment.holdout,false);
  assert.equal('curve' in first.experiment.holdout,false);
  assert.equal(first.experiment.walkForward.length,4);
  assert.equal(first.experiment.walkForward.at(-1).end,first.experiment.development.end);
  assert.equal('fills' in first.experiment.walkForward[0],false);
  assert.equal('curve' in first.experiment.walkForward[0],false);
  assert.equal(JSON.stringify(first).includes(csv.slice(0,80)),false);
  assert.throws(()=>buildExperimentManifest(result,'not-a-hash'),/fingerprint/);
});


test('research provenance is normalized, bounded and tied to the imported observation horizon',()=>{
  const latest=bars.at(-1).date;
  assert.deepEqual(
    normalizeResearchProvenance(provenance({instrument:'sim-01',currency:'usd'}),latest),
    {
      sourceDeclaredByUser:'Example permitted historical export',
      instrumentDeclaredByUser:'SIM-01',
      currencyDeclaredByUser:'USD',
      priceAdjustmentDeclaredByUser:'UNKNOWN',
      sourceAsOfDate:latest,
      independentlyVerified:false
    }
  );
  assert.throws(()=>normalizeResearchProvenance(provenance({instrument:'bad symbol'}),latest),/Instrument label/);
  assert.throws(()=>normalizeResearchProvenance(provenance({currency:'US'}),latest),/Currency/);
  assert.throws(()=>normalizeResearchProvenance(provenance({priceAdjustment:'MAGIC'}),latest),/adjustment status/);
  assert.throws(()=>normalizeResearchProvenance(provenance({asOfDate:'2020-01-01'}),latest),/cannot be earlier/);
});

test('data readiness exposes structural review reasons without claiming vendor verification',()=>{
  const parsed=uploaded();
  const cleanAdjusted=analyzeHistoricalResearch(parsed,provenance({priceAdjustment:'VENDOR_ADJUSTED'}));
  assert.equal(cleanAdjusted.researchReadiness.status,'STRUCTURALLY_CLEAN_UNVERIFIED');
  assert.deepEqual(cleanAdjusted.researchReadiness.reviewReasons,[]);
  const suspicious=structuredClone(parsed);
  suspicious.bars[10].volume=0;
  suspicious.bars[20].open=suspicious.bars[19].close*1.45;
  suspicious.bars[20].high=Math.max(suspicious.bars[20].high,suspicious.bars[20].open,suspicious.bars[20].close);
  suspicious.dataQuality=summarizeDataQuality(suspicious.bars);
  const result=analyzeHistoricalResearch(suspicious,provenance());
  assert.equal(result.researchReadiness.status,'REVIEW_REQUIRED');
  assert.ok(result.researchReadiness.reviewReasons.includes('PRICE_ADJUSTMENT_UNKNOWN'));
  assert.ok(result.researchReadiness.reviewReasons.includes('ZERO_VOLUME_BARS'));
  assert.ok(result.researchReadiness.reviewReasons.includes('PRICE_DISCONTINUITY'));
  assert.deepEqual(result.researchReadiness,assessResearchReadiness(result.dataQuality,'UNKNOWN'));
});

test('quality diagnostics include coverage, return outliers and extreme ranges deterministically',()=>{
  const data=structuredClone(bars);
  data[30].close=data[29].close*1.25;
  data[30].high=Math.max(data[30].high,data[30].close);
  data[40].high=data[40].low*1.35;
  const quality=summarizeDataQuality(data);
  assert.ok(quality.calendarSpanDays>=quality.observedBars);
  assert.ok(quality.expectedWeekdays>=quality.observedBars);
  assert.ok(quality.weekdayCoveragePct>0&&quality.weekdayCoveragePct<=100);
  assert.ok(quality.closeReturnOutliers>=1);
  assert.ok(quality.extremeIntradayRanges>=1);
});
