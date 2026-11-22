/**
 * Fixed-rule, chronological historical research observations, not optimization.
 * A built-in or user-supplied data label is NOT source authentication or PIT proof.
 * No I/O, provider, broker, persistence, notifications, or order routing.
 */
import {normalizeMarketDataset,isStrictISODate,summarizeMarketDataQuality} from './market-intelligence.mjs';
import {BREAKOUT_STRATEGY_ID,classifyDailyBreakoutAt} from './daily-breakout-research.mjs';
import {RETURN_CONTRACT,modeledReturns,meanReturn,observationWindow} from './research-return-contract.mjs';

export const RESEARCH_STRESS_CASES=Object.freeze([
  Object.freeze({id:'ZERO_COST_REFERENCE',feeBpsEachSide:0,adverseSlippageBpsEachSide:0}),
  Object.freeze({id:'DEFAULT_10_BPS',feeBpsEachSide:10,adverseSlippageBpsEachSide:10}),
  Object.freeze({id:'STRESS_25_BPS',feeBpsEachSide:25,adverseSlippageBpsEachSide:25}),
  Object.freeze({id:'STRESS_50_BPS',feeBpsEachSide:50,adverseSlippageBpsEachSide:50})
]);

const PHASE_NAMES=Object.freeze(['DEVELOPMENT_REFERENCE','CHRONOLOGICAL_VALIDATION','CHRONOLOGICAL_HOLDOUT']);
const MIN_POST_WARMUP=90;
const FIRST_SIGNAL=49;
const lockedHoldingBars=5;

function meanRisk(windows,feeBps,slippageBps){
  const costed=windows.map(w=>({
    returns:modeledReturns(w.entryOpen,w.exitClose,{feeBps,slippageBps})
  }));
  const mean=meanReturn(costed,'cashOutlayReturnPct');
  const values=costed.map(o=>o.returns.cashOutlayReturnPct);
  return {
    count:values.length,
    meanCashOutlayReturnPct:mean,
    positiveOutcomeRatePct:values.length?100*values.filter(x=>x>0).length/values.length:null,
    worstCashOutlayReturnPct:values.length?Math.min(...values):null
  };
}

function stress(windows){
  return RESEARCH_STRESS_CASES.map(spec=>({
    ...spec,...meanRisk(windows,spec.feeBpsEachSide,spec.adverseSlippageBpsEachSide)
  }));
}

function lockedSignalWindows(input,bars,start,end){
  const windows=[];
  let evaluatedCompletedCloses=0;
  for(let i=start;i+lockedHoldingBars<=end;){
    // The frozen classifier explicitly accesses only the previous bars
    // through the completed signal index. No refit or cost-aware selection.
    const classification=classifyDailyBreakoutAt(bars,i);
    evaluatedCompletedCloses++;
    if(classification.signal!=='HISTORICAL_BREAKOUT'){
      i++;continue;
    }
    const window=observationWindow(bars,i,lockedHoldingBars);
    windows.push({
      ...window,signal:classification.signal,
      entryOpen:bars[window.entryIndex].open,
      exitClose:bars[window.exitIndex].close
    });
    i+=lockedHoldingBars;
  }
  return {windows,evaluatedCompletedCloses};
}

function periodicControlWindows(bars,start,end){
  const windows=[];
  // Baseline ignores scanner signals: a precommitted, independent schedule
  // of one hypothetical unit over fixed five-session, non-overlapping blocks.
  for(let i=start;i+lockedHoldingBars<=end;i+=lockedHoldingBars){
    const window=observationWindow(bars,i,lockedHoldingBars);
    windows.push({...window,
      entryOpen:bars[window.entryIndex].open,
      exitClose:bars[window.exitIndex].close
    });
  }
  return windows;
}

export function auditChronologicalResearch(input,{asOf=null}={}){
  if(asOf!==null&&!isStrictISODate(asOf))
    throw new Error('asOf must be a real YYYY-MM-DD date');
  const data=normalizeMarketDataset(input);
  const reviewDate=asOf??data.bars.at(-1).date;
  if(reviewDate>data.sourceAsOf)
    throw new Error('Research cutoff cannot exceed declared source-as-of date');
  const bars=data.bars;
  const lastIndex=bars.findLastIndex(b=>b.date<=reviewDate);
  const usable=lastIndex-FIRST_SIGNAL+1;
  if(usable<MIN_POST_WARMUP)
    throw new Error('Need at least 90 post-warmup completed bars for three chronological research periods');
  const countDevelopment=Math.floor(usable/2);
  const countValidation=Math.floor(usable/4);
  const countHoldout=usable-countDevelopment-countValidation;
  const counts=[countDevelopment,countValidation,countHoldout];
  if(counts.some(x=>x<=lockedHoldingBars))
    throw new Error('Each chronological period must contain more than five completed bars');

  let cursor=FIRST_SIGNAL;
  const phases=PHASE_NAMES.map((id,index)=>{
    const startIndex=cursor,endIndex=cursor+counts[index]-1;
    cursor=endIndex+1;
    const {windows,evaluatedCompletedCloses}=lockedSignalWindows(input,bars,startIndex,endIndex);
    const control=periodicControlWindows(bars,startIndex,endIndex);
    for(const w of [...windows,...control]){
      if(w.signalIndex<startIndex||w.entryIndex<=w.signalIndex||w.exitIndex>endIndex)
        throw new Error('Chronological window crossed a split boundary');
    }
    return {
      phase:id,startDate:bars[startIndex].date,endDate:bars[endIndex].date,
      startIndex,endIndex,completedBars:counts[index],
      signalEvaluations:evaluatedCompletedCloses,
      strategy:{
        strategyId:BREAKOUT_STRATEGY_ID,
        closedHypotheticalObservations:windows.length,
        windows:windows.map(({entryOpen,exitClose,...w})=>w),
        costSensitivity:stress(windows)
      },
      control:{
        id:'FIXED_PERIODIC_FIVE_SESSION_EXPOSURE',
        note:'Fixed non-overlapping periodic one-unit exposures; not matched to scanner signals or a buy-and-hold portfolio',
        closedHypotheticalObservations:control.length,
        windows:control.map(({entryOpen,exitClose,...w})=>w),
        costSensitivity:stress(control)
      },
      cutoffRule:'Signal AND entire hypothetical entry-exit window must remain within this phase'
    };
  });
  if(cursor!==lastIndex+1)throw new Error('Chronological partition did not consume review bars');
  return {
    schema:'project9-chronological-cost-stress-audit-v1',
    study:'DESCRIPTIVE_RESEARCH_ONLY_NO_TUNING',
    strategy:BREAKOUT_STRATEGY_ID,
    fixedHoldingCompletedSessions:lockedHoldingBars,
    returnContract:RETURN_CONTRACT,
    source:{symbol:data.symbol,label:data.source,mode:data.mode,
      declaredSourceAsOf:data.sourceAsOf,priceAdjustment:data.priceAdjustment,
      provenance:data.provenance},
    reviewDate,lastCompletedBarUsed:bars[lastIndex].date,
    warmupBarsBeforeFirstSignal:FIRST_SIGNAL,
    postWarmupCompletedBars:usable,
    partitions:{rule:'50/25/25 fixed ratios of completed bars after warmup',
      method:'Contiguous chronological partitions, never shuffle; windows are censored at phase ends',
      phaseSizes:counts,excludesBoundaryCrossingOutcomes:true},
    costGrid:RESEARCH_STRESS_CASES,
    phases,
    dataQuality:summarizeMarketDataQuality(data,lastIndex),
    safety:{
      fixedStrategyNotOptimized:true,
      modelsFitted:false,
      holdoutIsDescriptiveOnly:true,
      independentOutOfSampleEfficacyEstablished:false,
      authenticHistoricalDataIndependentlyVerified:false,
      dataRightsAndPointInTimeAvailabilityVerified:false,
      actualBidAskLiquidityOrCorporateActionsVerified:false,
      hypotheticalEntriesAndExitsAreNotFills:true,
      benchmarkMatchedToStrategySignals:false,
      benchmarkExecutablePortfolio:false,
      allReturnsAreIndependentNotionalUnitReferences:true,
      brokerConnected:false,providerCalls:0,realOrdersCreated:0,
      schedulingEnabled:false,productionGate:'NO_GO'
    }
  };
}
