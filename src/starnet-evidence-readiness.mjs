/**
 * StarNet three-level, offline-only evidence gate.
 *
 * Independently recomputes fictional arithmetic, historical structural
 * quality, chronological research windows and declared hypothetical cost
 * stresses. Never treats a dataset label, declared vendor provenance, a
 * self-attested PASS or a synthetic fill as external evidence.
 *
 * No filesystem, network, broker, wallet, account or trade execution.
 */
import {createHash} from 'node:crypto';
import {auditFictionalRiskJournalReport} from './starnet-fictional-reconciliation-audit.mjs';
import {auditChronologicalResearch,RESEARCH_STRESS_CASES} from './chronological-research-audit.mjs';
import {auditMarketDatasetBatch} from './market-readiness-audit.mjs';
import {normalizeMarketDataset,isStrictISODate} from './market-intelligence.mjs';
import {compareLocalHistoricalSources} from './starnet-historical-source-comparison.mjs';
import {auditStarNetOfflineCustody} from './starnet-offline-custody-evidence.mjs';
import {auditStarNetOfflineResearchQuality} from './starnet-offline-research-quality.mjs';

const fail=message=>{throw new TypeError('StarNet evidence gate refused: '+message);};
const sha=/^[a-f0-9]{64}$/;
const sourceKinds=new Set(['ENGINEERED_OFFLINE_FIXTURE','USER_SUPPLIED_UNVERIFIED_JSON']);
const phases=['DEVELOPMENT_REFERENCE','CHRONOLOGICAL_VALIDATION','CHRONOLOGICAL_HOLDOUT'];
const safe=(n,min=0)=>Number.isSafeInteger(n)&&n>=min;
function assert(condition,message){if(!condition)fail(message);}
function assertCostRows(group,phase){
  assert(group&&safe(group.closedHypotheticalObservations)&&
    Array.isArray(group.windows)&&Array.isArray(group.costSensitivity),
    phase+' missing descriptive observations');
  assert(group.windows.length===group.closedHypotheticalObservations,
    phase+' window count mismatch');
  assert(group.costSensitivity.length===RESEARCH_STRESS_CASES.length,
    phase+' missing cost stress scenarios');
  let lastExit=-1;
  for(const win of group.windows){
    assert(win&&safe(win.signalIndex)&&safe(win.entryIndex)&&safe(win.exitIndex)&&
      win.entryIndex===win.signalIndex+1&&win.exitIndex===win.signalIndex+5&&
      win.signalIndex>=phase.startIndex&&win.exitIndex<=phase.endIndex&&
      win.signalIndex>=lastExit&&
      typeof win.signalDate==='string'&&typeof win.entryDate==='string'&&
      typeof win.exitDate==='string'&&
      isStrictISODate(win.signalDate)&&isStrictISODate(win.entryDate)&&
      isStrictISODate(win.exitDate)&&
      win.signalDate<win.entryDate&&win.entryDate<=win.exitDate,
      phase.phase+' has future-leaking or overlapping hypothetical observations');
    lastExit=win.exitIndex;
  }
  let prior=null;
  group.costSensitivity.forEach((row,index)=>{
    const spec=RESEARCH_STRESS_CASES[index];
    assert(row&&row.id===spec.id&&
      row.feeBpsEachSide===spec.feeBpsEachSide&&
      row.adverseSlippageBpsEachSide===spec.adverseSlippageBpsEachSide&&
      row.count===group.closedHypotheticalObservations,
      phase.phase+' cost count or stress grid changed');
    if(row.count===0){
      assert(row.meanCashOutlayReturnPct===null&&
        row.positiveOutcomeRatePct===null&&
        row.worstCashOutlayReturnPct===null,
        phase.phase+' invented returns without observations');
    }else{
      assert(Number.isFinite(row.meanCashOutlayReturnPct)&&
        Number.isFinite(row.worstCashOutlayReturnPct)&&
        Number.isFinite(row.positiveOutcomeRatePct)&&
        row.positiveOutcomeRatePct>=0&&row.positiveOutcomeRatePct<=100&&
        (prior===null||row.meanCashOutlayReturnPct<prior),
        phase.phase+' hypothetical costs did not worsen the outcome');
      prior=row.meanCashOutlayReturnPct;
    }
  });
}

function checkChronology(report,sourceAsOf){
  assert(report?.schema==='project9-chronological-cost-stress-audit-v1'&&
    report.study==='DESCRIPTIVE_RESEARCH_ONLY_NO_TUNING'&&
    report.safety?.productionGate==='NO_GO'&&
    report.safety.independentOutOfSampleEfficacyEstablished===false&&
    report.safety.authenticHistoricalDataIndependentlyVerified===false&&
    report.safety.brokerConnected===false&&
    report.safety.realOrdersCreated===0&&
    report.source?.declaredSourceAsOf===sourceAsOf&&
    Array.isArray(report.phases)&&report.phases.length===3&&
    Array.isArray(report.partitions?.phaseSizes)&&
    report.partitions.phaseSizes.length===3,
    'chronological report lacks research-only safety guards');
  let priorEnd=48;
  let completed=0,signalCount=0,controlCount=0;
  report.phases.forEach((phase,i)=>{
    assert(phase.phase===phases[i]&&safe(phase.startIndex,49)&&
      safe(phase.endIndex,phase.startIndex)&&phase.startIndex===priorEnd+1&&
      phase.completedBars===phase.endIndex-phase.startIndex+1&&
      phase.completedBars===report.partitions.phaseSizes[i]&&
      isStrictISODate(phase.startDate)&&isStrictISODate(phase.endDate)&&
      phase.startDate<=phase.endDate&&phase.endDate<=sourceAsOf&&
      phase.strategy?.strategyId===report.strategy&&
      phase.control?.id==='FIXED_PERIODIC_FIVE_SESSION_EXPOSURE',
      'chronological partition mismatch');
    assertCostRows(phase.strategy,phase);
    assertCostRows(phase.control,phase);
    signalCount+=phase.strategy.closedHypotheticalObservations;
    controlCount+=phase.control.closedHypotheticalObservations;
    completed+=phase.completedBars;
    priorEnd=phase.endIndex;
  });
  assert(priorEnd+1===report.warmupBarsBeforeFirstSignal+report.postWarmupCompletedBars&&
    completed===report.postWarmupCompletedBars&&
    report.phases[2].endDate===report.lastCompletedBarUsed,
    'chronological total or final boundary changed');
  return Object.freeze({
    contiguousNoShuffle:true,
    windowsContainedWithinOwnPartition:true,
    signalUsesCompletedObservations:true,
    hypotheticalCostsWorsenMean:true,
    developmentBars:report.phases[0].completedBars,
    validationBars:report.phases[1].completedBars,
    holdoutBars:report.phases[2].completedBars,
    strategyObservations:signalCount,
    periodicControlObservations:controlCount
  });
}

function normalizeBytes(bytes){
  assert(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=2_500_000,
    'explicit JSON input bytes (max 2.5 MB) required');
  let data;
  try{data=JSON.parse(bytes.toString('utf8'));}
  catch{fail('historical dataset is not valid JSON');}
  return data;
}

/**
 * @param {{journalReport: object, marketBytes: Buffer, asOf: string,
 *          sourceKind: string, witnessMarketBytes?: Buffer|null, manifestBytes?: Buffer|null}} options
 */
export function buildStarNetEvidenceReadiness({
  journalReport,marketBytes,asOf,sourceKind,witnessMarketBytes=null,manifestBytes=null
}={}){
  assert(sourceKinds.has(sourceKind),'explicit declared fixture or unverified local source type required');
  assert(isStrictISODate(asOf),'explicit valid review date required');

  // Re-evaluate from a risk-policy-backed journal, not a caller's PASS label.
  const arithmetic=auditFictionalRiskJournalReport(journalReport);
  assert(arithmetic.finding==='PASS_FICTIONAL_ARITHMETIC_ONLY'&&
    arithmetic.safety.productionGate==='NO_GO'&&
    arithmetic.safety.realOrdersCreated===0&&
    arithmetic.safety.independentlyObservedProviderExecutions===false,
    'journal lacks independent fictional reconciliation');
  const dataset=normalizeBytes(marketBytes);
  const normalized=normalizeMarketDataset(dataset);
  // The source might claim vendor-reviewed values. Those declarations
  // cannot independently authenticate themselves or establish data rights.
  const hash=createHash('sha256').update(marketBytes).digest('hex');
  assert(sha.test(hash),'invalid market file identity');
  const readiness=auditMarketDatasetBatch([
    {filename:'historical-input.json',sha256:hash,data:dataset}
  ],{reviewDate:asOf});
  const chronology=auditChronologicalResearch(dataset,{
    asOf:normalized.bars.at(-1).date
  });
  const chronologyChecks=checkChronology(chronology,normalized.sourceAsOf);
  const row=readiness.datasets[0];
  const custody=manifestBytes===null
    ? Object.freeze({status:'NOT_PROVIDED',
      verification:Object.freeze({
        independentSourceAuthenticityVerified:false,
        pointInTimeAvailabilityIndependentlyVerified:false,
        corporateActionTruthVerified:false,termsOfUseIndependentlyReviewed:false,
        productionGate:'NO_GO'})
      })
    : auditStarNetOfflineCustody({
      marketBytes,manifestBytes,asOf,sourceKind
    });
  const comparison=witnessMarketBytes===null
    ? Object.freeze({status:'NOT_ASSESSED',historicalAuthenticityIndependentlyVerified:false,
       sourceIndependenceAuthenticated:false,productionGate:'NO_GO'})
    : compareLocalHistoricalSources({primaryBytes:marketBytes,witnessBytes:witnessMarketBytes,asOf});
  assert(readiness.researchOnly===true&&readiness.executionAllowed===false&&
    readiness.brokerageConnected===false&&
    row.dataAuthenticityIndependentlyVerified===false&&
    row.realOrdersAllowed===false&&
    row.fileSha256===hash,
    'unsafe or contradictory data-readiness claim');
  const researchQuality=auditStarNetOfflineResearchQuality({
    dataset,asOf,sourceKind,comparison,custody
  });
  assert(researchQuality.verification.productionGate==='NO_GO'&&
    researchQuality.verification.strategyEfficacyEstablished===false&&
    researchQuality.verification.sourceIndependenceAuthenticated===false,
    'research quality must not imply predictive or source authenticity');
  const evidence={
    engineering:{
      level:1,status:'PASS_FICTIONAL_ARITHMETIC_ONLY',
      verification:'RECOMPUTED_FROM_LOCAL_SYNTHETIC_JOURNAL',
      journalHeadSha256:arithmetic.headHash,
      journalRevision:arithmetic.revision,
      reviewedDecisions:arithmetic.checkedDecisions,
      reviewedOrders:arithmetic.checkedOrders,
      reviewedEvents:arithmetic.checkedEvents,
      reconstructedCashTicks:arithmetic.expectedCashTicks,
      reconstructedReservedTicks:arithmetic.expectedReservedTicks,
      providerExecutionsAuthenticated:false,
      passingThisLevelCannotAdvanceOtherLevels:true
    },
    research:{
      level:2,status:'PARTIAL_DESCRIPTIVE_CHECKS_ONLY',
      verification:'LOCAL_STRUCTURAL_AND_CHRONOLOGICAL_CHECKS',
      inputByteSha256:hash,sourceKind,
      instrument:normalized.symbol,
      reviewDate:asOf,declaredSourceAsOf:normalized.sourceAsOf,
      lastCompletedBar:normalized.bars.at(-1).date,
      historicalBars:normalized.bars.length,
      priceAdjustment:normalized.priceAdjustment,
      declaredProvenanceContract:normalized.provenance.contract,
      readinessReviewReasons:row.reviewReasons,
      dataQualityStatus:row.quality.status,
      dataReadinessStatus:row.researchReadiness,
      crossSourceComparison:comparison,
      custodyEvidence:custody,
      researchQuality,
      crossSourceAgreementDoesNotAuthenticateMarkets:true,
      chronology:chronologyChecks,
      costScenarios:RESEARCH_STRESS_CASES.map(x=>x.id),
      testedOutOfSampleEfficacy:false,
      historicalAuthenticityIndependentlyVerified:false,
      pointInTimeUniverseIndependentlyVerified:false,
      corporateActionsIndependentlyVerified:false,
      executableBidAskAndLiquidityVerified:false,
      modelingIsNotActualFillEvidence:true,
      userOrVendorLabelsCannotRaiseThisStatus:true
    },
    operations:{
      level:3,status:'NOT_VERIFIED',
      review:'REQUIRES_INDEPENDENT_HARDWARE_AND_EXTERNAL_EVIDENCE',
      localMacAcceptance:'NOT_RUN',
      actualPowerLossAndStorageFailure:'NOT_RUN',
      externalBrokerOrCustodianReconciliation:'NOT_RUN',
      signingAndCustody:'NOT_IN_SCOPE',
      marketExecutionEvidence:'NOT_IN_SCOPE',
      noAutomaticPromotionFromPriorLevels:true
    }
  };
  return Object.freeze({
    schema:'project9-starnet-three-level-evidence-readiness-v1',
    study:'OFFLINE_RESEARCH_VALIDATION_ONLY',
    asOf,scope:'ENGINEERED_OR_UNVERIFIED_OFFLINE_HISTORICAL_INPUT',
    levels:Object.freeze(evidence),
    overall:Object.freeze({
      finding:'NO_GO',
      rationale:'Passing local arithmetic and structural chronology is not independent market provenance, predictive validity, hardware recovery or real execution proof',
      levelsAreIndependent:true,
      realOrdersCreated:0,blockchainTransactionsBroadcast:0,
      brokerConnected:false,walletConnected:false,
      liveTradingEnabled:false,autoPromotionAllowed:false,
      productionGate:'NO_GO'
    })
  });
}

export function renderStarNetEvidenceMarkdown(report){
  assert(report?.schema==='project9-starnet-three-level-evidence-readiness-v1'&&
    report.overall?.productionGate==='NO_GO'&&
    report.levels?.engineering?.providerExecutionsAuthenticated===false&&
    report.levels?.research?.historicalAuthenticityIndependentlyVerified===false,
    'refusing to render unsafe or unrelated readiness report');
  const e=report.levels.engineering,r=report.levels.research,
    o=report.levels.operations;
  return [
    '# StarNet — Three-Level Evidence Readiness',
    '',
    '**Overall: NO_GO — offline research only.**',
    '',
    '| Independent level | Status | Evidence boundary |',
    '|---|---|---|',
    '| 1 — Engineering | '+e.status+' | Recomputed invented cash, holdings and event arithmetic |',
    '| 2 — Research | '+r.status+' | Date-safe, local quality and hypothetical cost checks; independent provenance absent |',
    '| 3 — Operations | '+o.status+' | Mac acceptance, genuine storage failure and authenticated external proof absent |',
    '',
    '## Verifiable local observations',
    '',
    '- Journal entries reviewed: '+e.journalRevision+'; independently reconstructed fictional events: '+e.reviewedEvents+'.',
    '- Input byte SHA-256: \x60'+r.inputByteSha256+'\x60.',
    '- Historical bars structurally inspected: '+r.historicalBars+'; review cutoff: '+r.reviewDate+'.',
    '- Chronological splits: '+r.chronology.developmentBars+' / '+r.chronology.validationBars+' / '+r.chronology.holdoutBars+' completed bars.',
    '- Hypothetical strategy windows: '+r.chronology.strategyObservations+'; periodic control windows: '+r.chronology.periodicControlObservations+'.',
    '- Research review reasons: '+(r.readinessReviewReasons.length?r.readinessReviewReasons.join(', '):'No structural review flags; authenticity still unverified')+'.',
    '- Cross-source local evidence: '+r.crossSourceComparison.status+' (not independent authentication).',
    '- Custody-reference evidence: '+r.custodyEvidence.status+' (local declarations; no independent point-in-time proof).',
    '- Research-quality evidence: '+r.researchQuality.status+'; holdout hypothetical windows: '+r.researchQuality.partitions[2].strategyWindows+'; per-partition descriptive reference floor: '+r.researchQuality.partitions[2].sampleReferenceFloor+'.',
    '',
    '## Claims not supported by this report',
    '',
    'Historical source authenticity, genuine point-in-time availability, predictive reliability, real fill prices, independent custody, trading settlement and production readiness are **NOT VERIFIED**.',
    'Even user/vendor-declared reviewed provenance cannot independently authenticate its own history.',
    '',
    '**No live trades, wallet transfers, external API calls or automatic production promotion.**'
  ].join('\n')+'\n';
}
