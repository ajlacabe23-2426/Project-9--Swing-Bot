/**
 * Phase 18 — compare two frozen local history snapshots and their research
 * partitions. Strictly read-only. No dataset import, strategy selection,
 * external service, broker, or market activity.
 */
import {createHash} from 'node:crypto';
import {normalizeMarketDataset,isStrictISODate} from './market-intelligence.mjs';
import {auditChronologicalResearch,RESEARCH_STRESS_CASES} from './chronological-research-audit.mjs';

const refused=reason=>{throw new TypeError('StarNet revision evidence refused: '+reason);};
const KINDS=new Set(['ENGINEERED_OFFLINE_FIXTURE','USER_SUPPLIED_UNVERIFIED_JSON']);
const FIELDS=['open','high','low','close','volume'];
const PHASES=['DEVELOPMENT_REFERENCE','CHRONOLOGICAL_VALIDATION','CHRONOLOGICAL_HOLDOUT'];
const SHA=bytes=>createHash('sha256').update(bytes).digest('hex');
function parse(bytes,label,asOf){
  if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>2_500_000)
    refused(label+' requires bounded historical JSON bytes');
  let raw;
  try{raw=JSON.parse(bytes.toString('utf8'));}
  catch{refused(label+' contains invalid JSON');}
  const normalized=normalizeMarketDataset(raw);
  if(normalized.sourceAsOf>asOf||normalized.bars.at(-1).date>asOf ||
     normalized.provenance.retrievedAt?.slice(0,10)>asOf)
    refused(label+' is after research cutoff');
  return {raw,data:normalized};
}
const meanEqual=(a,b)=>a===null&&b===null||
  Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-9;
function summarizePhase(before,after){
  if(before.phase!==after.phase||before.strategy.strategyId!==after.strategy.strategyId)
    refused('frozen study or phase identity changed');
  const cost=before.strategy.costSensitivity.map((p,i)=>{
    const q=after.strategy.costSensitivity[i],fixed=RESEARCH_STRESS_CASES[i];
    if(p.id!==fixed.id||q?.id!==fixed.id||
       p.feeBpsEachSide!==fixed.feeBpsEachSide||
       q.feeBpsEachSide!==fixed.feeBpsEachSide||
       p.adverseSlippageBpsEachSide!==fixed.adverseSlippageBpsEachSide||
       q.adverseSlippageBpsEachSide!==fixed.adverseSlippageBpsEachSide)
      refused('cost grid changed between snapshots');
    return {
      scenario:fixed.id,
      originalMeanPct:p.meanCashOutlayReturnPct,
      candidateMeanPct:q.meanCashOutlayReturnPct,
      meansIdentical:meanEqual(p.meanCashOutlayReturnPct,q.meanCashOutlayReturnPct)
    };
  });
  return Object.freeze({
    phase:before.phase,
    originalRange:[before.startDate,before.endDate],
    candidateRange:[after.startDate,after.endDate],
    originalCompletedBars:before.completedBars,
    candidateCompletedBars:after.completedBars,
    partitionBoundariesChanged:before.startDate!==after.startDate||
      before.endDate!==after.endDate,
    originalHypotheticalObservations:before.strategy.closedHypotheticalObservations,
    candidateHypotheticalObservations:after.strategy.closedHypotheticalObservations,
    observationCountChanged:before.strategy.closedHypotheticalObservations!==
      after.strategy.closedHypotheticalObservations,
    cost,
    meanDifferencesAreNotValidIndependentPerformanceComparisons:true
  });
}
export function auditStarNetResearchRevision({
  baselineBytes,candidateBytes,asOf,sourceKind
}={}){
  if(!isStrictISODate(asOf)||!KINDS.has(sourceKind))
    refused('explicit valid cutoff and unverified source class required');
  const baseline=parse(baselineBytes,'baseline',asOf);
  const candidate=parse(candidateBytes,'candidate',asOf);
  const a=baseline.data,b=candidate.data;
  if(a.symbol!==b.symbol||a.currency!==b.currency)
    refused('different symbol or currency cannot be compared as revisions');
  const studyA=auditChronologicalResearch(baseline.raw,{asOf:a.bars.at(-1).date});
  const studyB=auditChronologicalResearch(candidate.raw,{asOf:b.bars.at(-1).date});
  if(studyA.safety.productionGate!=='NO_GO'||studyB.safety.productionGate!=='NO_GO'||
     studyA.strategy!==studyB.strategy||studyA.phases.length!==3||
     studyB.phases.length!==3||studyA.phases.some((p,i)=>p.phase!==PHASES[i])||
     studyB.phases.some((p,i)=>p.phase!==PHASES[i]))
    refused('study changed from locked descriptive computation');
  const byA=new Map(a.bars.map(x=>[x.date,x])),byB=new Map(b.bars.map(x=>[x.date,x]));
  const allDates=[...new Set([...byA.keys(),...byB.keys()])].sort();
  let removedDates=0,addedDates=0,revisedDates=0,revisedFields=0,unchangedDates=0;
  const differences=[];
  const sample=(date,kind,field)=>{if(differences.length<12)differences.push({date,kind,field});};
  for(const date of allDates){
    const old=byA.get(date),fresh=byB.get(date);
    if(!old){addedDates++;sample(date,'ADDED_OBSERVATION',null);continue;}
    if(!fresh){removedDates++;sample(date,'REMOVED_OBSERVATION',null);continue;}
    const changed=FIELDS.filter(k=>!Object.is(old[k],fresh[k]));
    if(changed.length){
      revisedDates++;revisedFields+=changed.length;
      for(const field of changed)sample(date,'REVISED_HISTORICAL_VALUE',field);
    }else unchangedDates++;
  }
  const phases=studyA.phases.map((phase,i)=>summarizePhase(phase,studyB.phases[i]));
  const boundariesChanged=phases.some(p=>p.partitionBoundariesChanged);
  const metadataChanged=a.source!==b.source||a.mode!==b.mode||
    a.priceAdjustment!==b.priceAdjustment||
    JSON.stringify(a.provenance)!==JSON.stringify(b.provenance);
  const barUniverseChanged=addedDates>0||removedDates>0;
  const historyChanged=barUniverseChanged||revisedDates>0;
  const bytesIdentical=SHA(baselineBytes)===SHA(candidateBytes);
  const finding=bytesIdentical?'IDENTICAL_BYTES_NOT_AUTHENTICATED':
    historyChanged||boundariesChanged?'RESEARCH_COMPARISON_BLOCKED_BY_INPUT_REVISION':
      metadataChanged?'METADATA_REVISED_REVIEW_REQUIRED':
        'BYTE_DIFFERENCE_WITH_SAME_PARSED_RECORDS';
  return Object.freeze({
    schema:'project9-offline-revision-boundary-audit-v1',
    status:finding,asOf,sourceKind,instrument:a.symbol,currency:a.currency,
    baselineSha256:SHA(baselineBytes),candidateSha256:SHA(candidateBytes),
    baselineBars:a.bars.length,candidateBars:b.bars.length,
    auditCounts:{unchangedDates,addedDates,removedDates,revisedDates,revisedFields},
    metadataChanged,boundariesChanged,
    dateAndBarUniverseUnchanged:!barUniverseChanged,
    sampledDifferences:differences,
    partitions:phases,
    strictSameInputResearchReproduction:bytesIdentical,
    validSameFrozenHoldoutComparison:!historyChanged&&!boundariesChanged,
    originalInputsNeverMutated:true,
    externalVendorAuthenticityVerified:false,
    pointInTimeAvailabilityVerified:false,
    dataRightsVerified:false,
    independentPredictionEstablished:false,
    liveMarketExecutionSupported:false,
    safety:{realOrdersCreated:0,externalCalls:0,productionGate:'NO_GO'}
  });
}
