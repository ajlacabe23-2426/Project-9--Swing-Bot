import test from 'node:test';
import assert from 'node:assert/strict';
import {generateScenario} from '../src/synthetic-fixtures.mjs';
import {auditStarNetOfflineResearchQuality} from '../src/starnet-offline-research-quality.mjs';
import {runEvidenceCli} from '../scripts/starnet-three-level-evidence.mjs';

function data(){
  const bars=generateScenario(73,190),sourceAsOf=bars.at(-1).date;
  return {
    schema:'project9-market-data-v2',
    symbol:'SIM09',currency:'USD',
    source:'ENGINEERED CLASSROOM HISTORY NOT ACTUAL MARKET',
    mode:'HISTORICAL',sourceAsOf,priceAdjustment:'RAW',
    provenance:{
      retrievedAt:sourceAsOf+'T00:00:00.000Z',
      adjustmentMethod:'RAW_UNADJUSTED',
      corporateActions:'NOT_VERIFIED',
      survivorship:'NOT_ASSESSED',
      licensing:'NOT_VERIFIED'
    },
    bars
  };
}
const comparison=()=>({
  status:'NOT_ASSESSED',productionGate:'NO_GO',
  sourceIndependenceAuthenticated:false,
  historicalAuthenticityIndependentlyVerified:false
});
const custody=()=>({
  status:'NOT_PROVIDED',verification:{
    productionGate:'NO_GO',
    independentSourceAuthenticityVerified:false,
    pointInTimeAvailabilityIndependentlyVerified:false,
    corporateActionTruthVerified:false,
    termsOfUseIndependentlyReviewed:false
  }
});
const audit=(dataset=data(),opts={})=>auditStarNetOfflineResearchQuality({
  dataset,asOf:dataset.sourceAsOf,
  sourceKind:'ENGINEERED_OFFLINE_FIXTURE',
  comparison:comparison(),custody:custody(),...opts
});

test('fixed three-part chronology is recomputed from raw bars; sparse holdout cannot claim skill',()=>{
  const report=audit();
  assert.equal(report.schema,'project9-offline-research-quality-v1');
  assert.equal(report.status,'DESCRIPTIVE_ONLY_INDEPENDENT_EVIDENCE_MISSING');
  assert.equal(report.partitions.length,3);
  assert.deepEqual(report.partitions.map(x=>x.phase),[
    'DEVELOPMENT_REFERENCE','CHRONOLOGICAL_VALIDATION','CHRONOLOGICAL_HOLDOUT'
  ]);
  assert.deepEqual(report.partitions.map(x=>x.completedBars),[70,35,36]);
  assert.equal(report.partitions.reduce((sum,x)=>sum+x.completedBars,0),141);
  assert.equal(report.partitions.reduce((sum,x)=>sum+x.strategyWindows,0),17);
  assert.equal(report.partitions.reduce((sum,x)=>sum+x.periodicControlWindows,0),26);
  assert.equal(report.partitions[2].sampleReferenceFloor,20);
  assert.equal(report.partitions[2].sampleReferenceFloorMet,false);
  assert.ok(report.partitions.every(x=>x.windowsFullyInsidePhase&&x.selectionBasedOnLockedRule));
  assert.equal(report.frozenMethod.holdoutIsOnlyADescriptivePartition,true);
  assert.equal(report.frozenMethod.independentOutOfSampleEfficacyEstablished,false);
  assert.equal(report.frozenMethod.samplesMayBeCorrelated,true);
  assert.equal(report.costReview.eachPhaseCostOrderingRechecked,true);
  assert.equal(report.costReview.controlIsNotSignalMatchedBenchmark,true);
  assert.equal(report.verification.strategyEfficacyEstablished,false);
  assert.equal(report.verification.independentStatisticalConfidenceCalculated,false);
  assert.equal(report.verification.sourceIndependenceAuthenticated,false);
  assert.equal(report.verification.productionGate,'NO_GO');
  assert.equal(report.verification.externalCalls,0);
  assert.equal(report.verification.realOrdersCreated,0);
  assert.ok(report.reviewReasons.includes('INSUFFICIENT_HYPOTHETICAL_STRATEGY_WINDOWS_IN_ONE_OR_MORE_PARTITIONS'));
  assert.ok(report.reviewReasons.includes('HOLDOUT_EFFICACY_AND_SAMPLE_INDEPENDENCE_NOT_ESTABLISHED'));
  assert.ok(report.reviewReasons.includes('HISTORICAL_AUTHENTICITY_AND_PIT_NOT_INDEPENDENTLY_VERIFIED'));
});

test('raw data anomalies produce specific review flags rather than invalid performance claims',()=>{
  const dataset=data();
  dataset.bars[30].volume=0;
  const r=audit(dataset);
  assert.equal(r.marketDataAnomalies.zeroVolumeBars,1);
  assert.ok(r.reviewReasons.includes('ZERO_VOLUME_BARS_REQUIRE_SOURCE_REVIEW'));
  assert.equal(r.verification.corporateActionEventsIndependentlyAuthenticated,false);
  assert.equal(r.verification.productionGate,'NO_GO');
  const changed=data();
  changed.bars[120].close=Number((changed.bars[119].close*1.5).toFixed(6));
  changed.bars[120].high=Math.max(changed.bars[120].high,changed.bars[120].close);
  changed.bars[120].low=Math.min(changed.bars[120].low,changed.bars[120].open);
  const spikes=audit(changed);
  assert.ok(spikes.marketDataAnomalies.largeAbsoluteDailyCloseChangesOver40Pct>=1);
  assert.ok(spikes.reviewReasons.includes('LARGE_DAILY_CLOSE_CHANGES_REQUIRE_ACTION_REVIEW'));
  assert.equal(spikes.marketDataAnomalies.noClaimOfCorruptBarsWithoutExternalCorroboration,true);
});

test('same local source labels or self-attested provenance never validates external history',()=>{
  const dataset=data();
  dataset.provenance.corporateActions='INDEPENDENTLY_REVIEWED';
  dataset.provenance.survivorship='INDEPENDENTLY_REVIEWED';
  dataset.provenance.licensing='COMMERCIAL_REDISTRIBUTION_VERIFIED';
  const r=audit(dataset);
  assert.equal(r.status,'DESCRIPTIVE_ONLY_INDEPENDENT_EVIDENCE_MISSING');
  assert.equal(r.verification.sourceIndependenceAuthenticated,false);
  assert.equal(r.verification.historicalPointInTimeAvailabilityVerified,false);
  assert.equal(r.verification.corporateActionEventsIndependentlyAuthenticated,false);
  assert.equal(r.verification.strategyEfficacyEstablished,false);
  assert.equal(r.verification.productionGate,'NO_GO');
});

test('missing comparison or custody evidence remains explicit and cannot be silently upgraded',()=>{
  const r=audit();
  assert.ok(r.reviewReasons.includes('SECOND_SOURCE_NOT_SUPPLIED'));
  assert.ok(r.reviewReasons.includes('LOCAL_CUSTODY_MANIFEST_NOT_SUPPLIED'));
  assert.ok(r.reviewReasons.includes('CORPORATE_ACTIONS_NOT_INDEPENDENTLY_PROVEN'));
  assert.throws(()=>audit(data(),{comparison:null}),/refused/);
  assert.throws(()=>audit(data(),{custody:null}),/refused/);
  assert.throws(()=>audit(data(),{comparison:{
    status:'NOT_ASSESSED',productionGate:'GO',
    sourceIndependenceAuthenticated:false,
    historicalAuthenticityIndependentlyVerified:false
  }}),/refused/);
  assert.throws(()=>audit(data(),{custody:{
    ...custody(),verification:{...custody().verification,
      independentSourceAuthenticityVerified:true}
  }}),/refused/);
  assert.throws(()=>audit(data(),{comparison:{
    schema:'project9-offline-cross-source-provenance-audit-v1',
    status:'LOCAL_RECORDS_AGREE_AUTHENTICITY_UNVERIFIED',
    verification:{productionGate:'GO',sourceIndependenceAuthenticated:false,
      historicalAuthenticityIndependentlyVerified:false}
  }}),/refused/);
});

test('invalid source identity, future cutoff and too short raw datasets fail closed',()=>{
  const dataset=data(),prior=new Date(dataset.sourceAsOf+'T00:00:00.000Z');
  prior.setUTCDate(prior.getUTCDate()-1);
  assert.throws(()=>audit(dataset,{asOf:prior.toISOString().slice(0,10)}),/refused/);
  assert.throws(()=>audit(dataset,{sourceKind:'BROKER_LIVE'}),/refused/);
  assert.throws(()=>audit({...dataset,bars:dataset.bars.slice(0,100)}),/90 post-warmup/);
  const bad=structuredClone(dataset);
  bad.bars[50].date=bad.bars[49].date;
  assert.throws(()=>audit(bad),/strictly ascending/);
  const ohlc=structuredClone(dataset);
  ohlc.bars[50].high=0;
  assert.throws(()=>audit(ohlc),/invalid|inconsistent/);
});

test('unified Level 2 report includes sparse holdout and contradictory provenance warnings',async()=>{
  const r=await runEvidenceCli(['--demo']);
  const q=r.levels.research.researchQuality;
  assert.equal(q.status,'DESCRIPTIVE_ONLY_INDEPENDENT_EVIDENCE_MISSING');
  assert.deepEqual(q.partitions.map(x=>x.completedBars),[70,35,36]);
  assert.equal(q.partitions[2].sampleReferenceFloorMet,false);
  assert.ok(q.reviewReasons.includes('CROSS_SOURCE_COMPARISON_REQUIRES_REVIEW'));
  assert.ok(q.reviewReasons.includes('LOCAL_CUSTODY_REFERENCE_REVIEW_REQUIRED'));
  assert.equal(q.verification.strategyEfficacyEstablished,false);
  assert.equal(q.verification.historicalPointInTimeAvailabilityVerified,false);
  assert.equal(r.levels.research.status,'PARTIAL_DESCRIPTIVE_CHECKS_ONLY');
  assert.equal(r.levels.research.testedOutOfSampleEfficacy,false);
  assert.equal(r.levels.operations.status,'NOT_VERIFIED');
  assert.equal(r.overall.productionGate,'NO_GO');
  const md=await runEvidenceCli(['--demo','--markdown']);
  assert.match(md,/Research-quality evidence: DESCRIPTIVE_ONLY_INDEPENDENT_EVIDENCE_MISSING/);
  assert.match(md,/holdout hypothetical windows:/);
  assert.match(md,/NO_GO/);
  assert.equal(md,await runEvidenceCli(['--demo','--markdown']));
});
