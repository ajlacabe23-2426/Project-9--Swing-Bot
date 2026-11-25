/**
 * StarNet Phase 13: descriptive offline research-quality evidence.
 *
 * Compute from an existing local dataset. The three fixed chronological
 * partitions, independent periodic reference and cost stress scenarios are
 * re-evaluated; no model fitting, no parameter searches and no trade routing.
 *
 * Observation counts and local bar-quality checks DO NOT validate market
 * authenticity, statistical independence, predictive skill or future returns.
 */
import {normalizeMarketDataset,isStrictISODate} from './market-intelligence.mjs';
import {auditChronologicalResearch,RESEARCH_STRESS_CASES} from './chronological-research-audit.mjs';

const fail=reason=>{throw new TypeError('Offline research quality refused: '+reason);};
const MIN_WINDOWS_PER_PARTITION=20;
const STRESS_IDS=RESEARCH_STRESS_CASES.map(x=>x.id);
const PHASES=['DEVELOPMENT_REFERENCE','CHRONOLOGICAL_VALIDATION','CHRONOLOGICAL_HOLDOUT'];
const WARMUP=49;
const HOLDING_SESSIONS=5;

function verifyCostGrid(group,phase){
  if(!group||!Array.isArray(group.costSensitivity)||
     group.costSensitivity.length!==RESEARCH_STRESS_CASES.length||
     !Array.isArray(group.windows)||
     group.windows.length!==group.closedHypotheticalObservations)
    fail(phase+' cost grid or windows missing');
  let previous=null;
  for(let i=0;i<RESEARCH_STRESS_CASES.length;i++){
    const x=group.costSensitivity[i],spec=RESEARCH_STRESS_CASES[i];
    if(x?.id!==spec.id||x.feeBpsEachSide!==spec.feeBpsEachSide||
       x.adverseSlippageBpsEachSide!==spec.adverseSlippageBpsEachSide||
       x.count!==group.closedHypotheticalObservations)
      fail(phase+' cost-stress specification is not frozen');
    if(x.count===0){
      if(x.meanCashOutlayReturnPct!==null||x.positiveOutcomeRatePct!==null)
        fail(phase+' fabricated nonempty return statistic');
    }else if(!Number.isFinite(x.meanCashOutlayReturnPct)||
      !Number.isFinite(x.positiveOutcomeRatePct)||
      x.positiveOutcomeRatePct<0||x.positiveOutcomeRatePct>100||
      (previous!==null&&x.meanCashOutlayReturnPct>=previous))
      fail(phase+' invalid or non-degrading hypothetical cost stress');
    if(x.count)previous=x.meanCashOutlayReturnPct;
  }
}
function datesAndWindows(group,phase,bars){
  let previousExit=-1;
  for(const w of group.windows){
    if(!Number.isSafeInteger(w.signalIndex)||
       w.signalIndex<phase.startIndex||
       w.entryIndex!==w.signalIndex+1||
       w.exitIndex!==w.signalIndex+HOLDING_SESSIONS||
       w.exitIndex>phase.endIndex||
       w.signalIndex<previousExit||
       w.signalDate!==bars[w.signalIndex]?.date||
       w.entryDate!==bars[w.entryIndex]?.date||
       w.exitDate!==bars[w.exitIndex]?.date)
      fail(phase.phase+' hypothetical window leaks across chronology');
    previousExit=w.exitIndex;
  }
}
const isVerifiedFalse=value=>value===false;
function validateComparison(comparison){
  if(comparison===null||comparison===undefined)
    fail('cross-source status must be supplied, including NOT_ASSESSED');
  if(comparison.status==='NOT_ASSESSED'){
    if(comparison.productionGate!=='NO_GO'||
       comparison.sourceIndependenceAuthenticated!==false||
       comparison.historicalAuthenticityIndependentlyVerified!==false)
      fail('unsafe unassessed source comparison flags');
  }else if(comparison.schema!=='project9-offline-cross-source-provenance-audit-v1'||
    comparison.verification?.productionGate!=='NO_GO'||
    !isVerifiedFalse(comparison.verification.sourceIndependenceAuthenticated)||
    !isVerifiedFalse(comparison.verification.historicalAuthenticityIndependentlyVerified))
    fail('source comparison cannot claim independent authenticity');
}
function validateCustody(custody){
  if(custody===null||custody===undefined)
    fail('custody status must be supplied, including NOT_PROVIDED');
  if(custody.status==='NOT_PROVIDED'){
    if(custody.verification?.productionGate!=='NO_GO'||
       custody.verification?.independentSourceAuthenticityVerified!==false||
       custody.verification?.pointInTimeAvailabilityIndependentlyVerified!==false)
      fail('unsafe missing custody declaration');
  }else if(custody.schema!=='project9-offline-custody-evidence-audit-v1'||
    custody.verification?.productionGate!=='NO_GO'||
    !isVerifiedFalse(custody.verification.independentSourceAuthenticityVerified)||
    !isVerifiedFalse(custody.verification.pointInTimeAvailabilityIndependentlyVerified)||
    !isVerifiedFalse(custody.verification.corporateActionTruthVerified)||
    !isVerifiedFalse(custody.verification.termsOfUseIndependentlyReviewed))
    fail('custody records cannot authenticate market history');
}

export function auditStarNetOfflineResearchQuality({
  dataset,asOf,sourceKind,comparison,custody
}={}){
  if(!['ENGINEERED_OFFLINE_FIXTURE','USER_SUPPLIED_UNVERIFIED_JSON'].includes(sourceKind)||
     !isStrictISODate(asOf))
    fail('explicit research-only input class and strict date required');
  const data=normalizeMarketDataset(dataset);
  if(data.bars.at(-1).date>asOf||data.sourceAsOf>asOf)
    fail('data contains observations after declared research cutoff');
  validateComparison(comparison);
  validateCustody(custody);

  // Re-run the frozen historical study from raw bars; never trust a caller's
  // status fields, precomputed windows or claims of "trained holdout".
  const study=auditChronologicalResearch(dataset,{asOf:data.bars.at(-1).date});
  if(study.study!=='DESCRIPTIVE_RESEARCH_ONLY_NO_TUNING'||
     study.safety?.productionGate!=='NO_GO'||
     study.safety.fixedStrategyNotOptimized!==true||
     study.safety.modelsFitted!==false||
     study.safety.independentOutOfSampleEfficacyEstablished!==false||
     study.safety.benchmarkMatchedToStrategySignals!==false||
     study.phases?.length!==3||study.warmupBarsBeforeFirstSignal!==WARMUP)
    fail('original study cannot be promoted from descriptive mode');

  let previous= WARMUP-1;
  const partitions=study.phases.map((phase,i)=>{
    if(phase.phase!==PHASES[i]||phase.startIndex!==previous+1||
       !Number.isSafeInteger(phase.endIndex)||
       phase.endIndex<phase.startIndex||
       phase.endIndex>=data.bars.length||
       phase.startDate!==data.bars[phase.startIndex].date||
       phase.endDate!==data.bars[phase.endIndex].date||
       phase.completedBars!==phase.endIndex-phase.startIndex+1)
      fail('noncontiguous or altered research partitions');
    previous=phase.endIndex;
    for(const [group,label] of [[phase.strategy,'strategy'],[phase.control,'periodic control']]){
      verifyCostGrid(group,phase.phase+' '+label);
      datesAndWindows(group,phase,data.bars);
    }
    const n=phase.strategy.closedHypotheticalObservations;
    const control=phase.control.closedHypotheticalObservations;
    return Object.freeze({
      phase:phase.phase,
      firstDate:phase.startDate,lastDate:phase.endDate,
      completedBars:phase.completedBars,
      strategyWindows:n,periodicControlWindows:control,
      sampleReferenceFloor:MIN_WINDOWS_PER_PARTITION,
      sampleReferenceFloorMet:n>=MIN_WINDOWS_PER_PARTITION,
      selectionBasedOnLockedRule:true,
      windowsFullyInsidePhase:true,
      independentOfAdjacentPhasesByConstruction:true,
      actualMarketPerformanceEstablished:false,
      strategyAndPeriodicControlFullyComparable:false
    });
  });
  if(previous!==data.bars.length-1)
    fail('some research bars were not allocated to the three partitions');

  const last=data.bars.at(-1).date;
  let zeroVolume=0,largeCloseChanges=0;
  for(let i=0;i<data.bars.length;i++){
    if(data.bars[i].volume===0)zeroVolume++;
    if(i>0&&Math.abs(data.bars[i].close/data.bars[i-1].close-1)>0.4)
      largeCloseChanges++;
  }
  const reasons=[];
  if(partitions.some(p=>!p.sampleReferenceFloorMet))
    reasons.push('INSUFFICIENT_HYPOTHETICAL_STRATEGY_WINDOWS_IN_ONE_OR_MORE_PARTITIONS');
  if(zeroVolume)reasons.push('ZERO_VOLUME_BARS_REQUIRE_SOURCE_REVIEW');
  if(largeCloseChanges)reasons.push('LARGE_DAILY_CLOSE_CHANGES_REQUIRE_ACTION_REVIEW');
  if(comparison.status==='NOT_ASSESSED')
    reasons.push('SECOND_SOURCE_NOT_SUPPLIED');
  else if(comparison.status!=='LOCAL_RECORDS_AGREE_AUTHENTICITY_UNVERIFIED')
    reasons.push('CROSS_SOURCE_COMPARISON_REQUIRES_REVIEW');
  if(custody.status==='NOT_PROVIDED')
    reasons.push('LOCAL_CUSTODY_MANIFEST_NOT_SUPPLIED');
  else if(custody.status!=='DECLARATIONS_CONSISTENT_AUTHENTICITY_UNVERIFIED')
    reasons.push('LOCAL_CUSTODY_REFERENCE_REVIEW_REQUIRED');
  if(data.provenance.corporateActions!=='INDEPENDENTLY_REVIEWED'||
     custody.verification?.corporateActionTruthVerified!==true)
    reasons.push('CORPORATE_ACTIONS_NOT_INDEPENDENTLY_PROVEN');
  reasons.push('HISTORICAL_AUTHENTICITY_AND_PIT_NOT_INDEPENDENTLY_VERIFIED');
  reasons.push('HOLDOUT_EFFICACY_AND_SAMPLE_INDEPENDENCE_NOT_ESTABLISHED');
  reasons.push('HYPOTHETICAL_COST_STRESS_IS_NOT_EXECUTABLE_QUOTE');

  return Object.freeze({
    schema:'project9-offline-research-quality-v1',
    status:'DESCRIPTIVE_ONLY_INDEPENDENT_EVIDENCE_MISSING',
    scope:'LOCAL_HISTORICAL_RESEARCH_NOT_INVESTMENT_ADVICE',
    reviewCutoff:asOf,
    frozenMethod:Object.freeze({
      strategyId:study.strategy,
      researchRule:'NO_REFITTING_NO_SHUFFLE',
      lockedHoldingCompletedSessions:HOLDING_SESSIONS,
      partitionRatio:'50/25/25_POST_WARMUP',
      samplesMayBeCorrelated:true,
      holdoutIsOnlyADescriptivePartition:true,
      independentOutOfSampleEfficacyEstablished:false,
      noAutomaticStrategyTuning:true
    }),
    partitions:Object.freeze(partitions),
    marketDataAnomalies:Object.freeze({
      totalCompletedBars:data.bars.length,
      zeroVolumeBars:zeroVolume,
      largeAbsoluteDailyCloseChangesOver40Pct:largeCloseChanges,
      corporateActionImpactsIndependentlyExplained:false,
      noClaimOfCorruptBarsWithoutExternalCorroboration:true
    }),
    costReview:Object.freeze({
      frozenScenarioIds:Object.freeze([...STRESS_IDS]),
      eachPhaseCostOrderingRechecked:true,
      costsAreHypothetical:true,
      executableBidAskOrLiquidityObserved:false,
      controlIsNotSignalMatchedBenchmark:true
    }),
    reviewReasons:Object.freeze(reasons),
    verification:Object.freeze({
      chronologyAndWindowDateIndicesRecomputed:true,
      noCrossPartitionHypotheticalWindows:true,
      sourceIndependenceAuthenticated:false,
      corporateActionEventsIndependentlyAuthenticated:false,
      historicalPointInTimeAvailabilityVerified:false,
      strategyEfficacyEstablished:false,
      independentStatisticalConfidenceCalculated:false,
      MacOperatorAcceptance:'NOT_RUN',
      realOrdersCreated:0,blockchainTransactionsBroadcast:0,
      externalCalls:0,productionGate:'NO_GO'
    })
  });
}
