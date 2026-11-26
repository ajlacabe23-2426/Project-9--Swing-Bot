/**
 * Phase 17 — read-only cost-stress / single-observation fragility review.
 * Descriptive classroom arithmetic on fixed, completed hypothetical windows.
 * No optimization, providers, broker interfaces, portfolios or orders.
 */
import {createHash} from 'node:crypto';
import {buildStarNetMethodologyWatch} from './starnet-methodology-learning.mjs';
import {auditChronologicalResearch,RESEARCH_STRESS_CASES} from './chronological-research-audit.mjs';
import {normalizeMarketDataset} from './market-intelligence.mjs';
import {modeledReturns} from './research-return-contract.mjs';

const mean=values=>values.length
  ?values.reduce((sum,value)=>sum+value/values.length,0):null;
const close=(a,b)=>a===null&&b===null ||
  Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;

export function evaluateMeanLeaveOneOut(values){
  if(!Array.isArray(values)||values.some(x=>!Number.isFinite(x)))
    throw new TypeError('Finite hypothetical observations required');
  if(values.length<2)return null;
  const baseline=mean(values);
  const alternativeMeans=values.map((_,excluded)=>{
    const left=values.filter((_,i)=>i!==excluded);
    return mean(left);
  });
  return Object.freeze({
    minimumMeanPct:Math.min(...alternativeMeans),
    maximumMeanPct:Math.max(...alternativeMeans),
    maximumAbsoluteShiftPctPoints:Math.max(...alternativeMeans.map(v=>Math.abs(v-baseline))),
    removedOneObservationEachTime:true,
    confidenceInterval:false,
    independentSampleCountEstablished:false
  });
}

function replay(windows,bars,costs){
  return windows.map(w=>{
    if(!Number.isInteger(w.signalIndex)||w.entryIndex!==w.signalIndex+1||
       w.exitIndex!==w.signalIndex+5||w.entryIndex>=bars.length||
       w.exitIndex>=bars.length||w.signalIndex<0)
      throw new TypeError('Malformed hypothetical window');
    return modeledReturns(bars[w.entryIndex].open,bars[w.exitIndex].close,{
      feeBps:costs.feeBpsEachSide,
      slippageBps:costs.adverseSlippageBpsEachSide
    }).cashOutlayReturnPct;
  });
}

export function auditStarNetStressFragility({marketBytes,asOf,sourceKind}={}){
  // Phase 16 performs strict byte, cutoff, provenance-class, calendar, split,
  // count and fixed-cost-grid validation. Its source verdict stays NO_GO.
  const watch=buildStarNetMethodologyWatch({marketBytes,asOf,sourceKind});
  const raw=JSON.parse(marketBytes.toString('utf8'));
  const bars=normalizeMarketDataset(raw).bars;
  const original=auditChronologicalResearch(raw,{asOf:bars.at(-1).date});
  if(watch.safety?.productionGate!=='NO_GO'||watch.phases.length!==3 ||
     original.phases.length!==3)throw new TypeError('Non-educational study refused');
  const [zeroCost,highestCost]=[RESEARCH_STRESS_CASES[0],RESEARCH_STRESS_CASES.at(-1)];
  const phases=original.phases.map((phase,index)=>{
    const frozen=watch.phases[index];
    const windows=phase.strategy.windows;
    const zero=replay(windows,bars,zeroCost),stressed=replay(windows,bars,highestCost);
    const zeroMean=mean(zero), stressedMean=mean(stressed);
    if(phase.phase!==frozen.phase||windows.length!==frozen.strategyWindows||
       !close(zeroMean,frozen.hypotheticalCostSensitivity.zeroCostMeanPct)||
       !close(stressedMean,frozen.hypotheticalCostSensitivity.highestCostMeanPct)||
       stressed.some((v,i)=>!(v<zero[i])))
      throw new TypeError('Frozen hypothetical observations changed');
    const signChanged=windows.length>0&&zeroMean>0&&stressedMean<=0;
    return Object.freeze({
      phase:phase.phase,completedHypotheticalWindows:windows.length,
      zeroCostMeanPct:zeroMean,highestModeledCostMeanPct:stressedMean,
      costWorseningPercentagePoints:windows.length?zeroMean-stressedMean:null,
      signChangedUnderModeledCostStress:signChanged,
      leaveOneOutHighestCost:evaluateMeanLeaveOneOut(stressed),
      oneObservationCannotSupportLeaveOneOut:windows.length===1,
      allMeanValuesReferToIndependentNotionalWindows:true,
      costAssumptionsAreNotMarketQuotes:true,
      predictiveReliabilityEstablished:false
    });
  });
  const holdout=phases.at(-1);
  return Object.freeze({
    schema:'project9-offline-stress-fragility-v1',
    status:'DESCRIPTIVE_ONLY_NOT_VALIDATED',
    inputByteSha256:createHash('sha256').update(marketBytes).digest('hex'),
    sourceKind,reviewAsOf:asOf,
    costScenarios:[zeroCost,highestCost],
    phases,
    holdoutEvidenceGate:'INSUFFICIENT_FOR_SKILL_CLAIM',
    thinHoldout:holdout.completedHypotheticalWindows<20,
    sourceAuthenticityIndependentlyVerified:false,
    actualBidAskAndLiquidityVerified:false,
    modelTunedOrOrdersSent:false,
    safety:{productionGate:'NO_GO',realOrdersCreated:0,externalCalls:0,
      demonstratesProfitability:false,demonstratesIndependentSkill:false}
  });
}
