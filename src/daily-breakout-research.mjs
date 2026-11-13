/**
 * Locked daily-close strategy research, version 1.
 *
 * Two setup predicates: close > 50-day simple average, and close above
 * the HIGHEST HIGH of the previous 20 completed sessions.
 *
 * Outcomes are retrospective references, not broker orders or fills.
 */
import {sma} from './engine.mjs';
import {normalizeMarketDataset,isStrictISODate,summarizeMarketDataQuality} from './market-intelligence.mjs';
import {RETURN_CONTRACT,modeledReturns,observationWindow,windowDefinition,meanReturn} from './research-return-contract.mjs';

export const BREAKOUT_STRATEGY_ID='P9_DAILY_20H_50SMA_V1';
const round=(n,dp=4)=>Number(n.toFixed(dp));

function classifyAt(bars,index){
  if(!Number.isSafeInteger(index)||index<49||index>=bars.length)
    throw new Error('Daily strategy requires 50 completed bars through the signal date');
  const prior20High=Math.max(...bars.slice(index-20,index).map(bar=>bar.high));
  const average50=sma(bars,index,50);
  if(!Number.isFinite(average50)||!Number.isFinite(prior20High))
    throw new Error('Daily strategy indicators must remain finite');
  const close=bars[index].close;
  const above50DayAverage=close>average50;
  const brokePrior20DayHigh=close>prior20High;
  return {
    signalDate:bars[index].date,
    lastCompletedClose:round(close,6),
    average50:round(average50,6),
    prior20DayHigh:round(prior20High,6),
    checks:{above50DayAverage,brokePrior20DayHigh},
    signal:above50DayAverage&&brokePrior20DayHigh?'HISTORICAL_BREAKOUT':'NO_BREAKOUT'
  };
}

/**
 * Deterministic research with fixed five-session default holding period.
 * We deliberately use next-bar OPEN as a retrospective modeled entry and
 * signal+5 CLOSE as the exit. No stop order, gap fill or intraday path is claimed.
 * Out-of-sample accuracy, liquidity and survivorship are not established.
 */
export function analyzeDailyBreakout(input,{
  asOf=null,holdingBars=5,feeBps=10,slippageBps=10
}={}){
  if(asOf!==null&&!isStrictISODate(asOf))
    throw new Error('Optional asOf must be a real YYYY-MM-DD date');
  if(!Number.isSafeInteger(holdingBars)||holdingBars<1||holdingBars>30)
    throw new Error('holdingBars must be an integer from 1 to 30');
  for(const [name,value] of Object.entries({feeBps,slippageBps})){
    if(!Number.isFinite(value)||value<0||value>250)
      throw new Error(name+' must be a number from 0 to 250');
  }
  const data=normalizeMarketDataset(input);
  const bars=data.bars;
  const reviewDate=asOf??bars.at(-1).date;
  if(reviewDate>data.sourceAsOf)
    throw new Error('Review date exceeds declared source-as-of date');
  const latestIndex=bars.findLastIndex(bar=>bar.date<=reviewDate);
  if(latestIndex<49)throw new Error('Need 50 completed bars through review date');
  const latest=classifyAt(bars,latestIndex);
  const outcomes=[];
  let historicalChecks=0;
  // Do not treat a currently visible setup as an already-closed paper outcome.
  for(let index=49;index+holdingBars<=latestIndex;){
    const signal=classifyAt(bars,index);
    historicalChecks++;
    if(signal.signal!=='HISTORICAL_BREAKOUT'){
      index++;
      continue;
    }
    const entry=bars[index+1],exit=bars[index+holdingBars];
    const returns=modeledReturns(entry.open,exit.close,{feeBps,slippageBps});
    const {entryReference,exitReference,cashOutlayReturnPct:afterCostPct}=returns;
    outcomes.push({
      window:observationWindow(bars,index,holdingBars),returns,
      signalDate:signal.signalDate,
      modeledEntrySession:entry.date,
      modeledExitSession:exit.date,
      completedSessionsHeld:holdingBars,
      modeledEntryReference:round(entryReference,6),
      modeledExitReference:round(exitReference,6),
      modeledAfterCostChangePct:round(afterCostPct),
      positiveModeledOutcome:afterCostPct>0
    });
    // One notional position per symbol at a time; no overlapping outcomes.
    index+=holdingBars;
  }
  const positiveCount=outcomes.filter(item=>item.positiveModeledOutcome).length;
  const changes=outcomes.map(item=>item.returns.cashOutlayReturnPct);
  return {
    schema:'project9-locked-daily-breakout-research-v2',
    strategy:BREAKOUT_STRATEGY_ID,
    returnContract:RETURN_CONTRACT,
    windowDefinition:windowDefinition(49,holdingBars),
    meanCashOutlayReturnPct:meanReturn(outcomes,'cashOutlayReturnPct'),
    meanEntryReferenceReturnPct:meanReturn(outcomes,'referenceReturnPct'),
    dataQuality:summarizeMarketDataQuality(data,latestIndex),
    parameters:{
      signal:'Daily close > 50-day SMA AND > prior 20-session highest high',
      entryReference:'Next completed session open, with modeled adverse slippage',
      exitReference:windowDefinition(49,holdingBars).exitReference,
      holdingBars,
      feeBpsEachSide:feeBps,
      adverseSlippageBpsEachSide:slippageBps
    },
    symbol:data.symbol,
    source:{name:data.source,mode:data.mode,declaredAsOf:data.sourceAsOf,
      priceAdjustment:data.priceAdjustment,provenance:data.provenance},
    reviewDate,
    latestCompletedBar:bars[latestIndex].date,
    latestSetup:latest,
    historicalChecks,
    closedPaperObservations:outcomes.length,
    positiveOutcomeRatePct:outcomes.length?round(100*positiveCount/outcomes.length):null,
    meanModeledAfterCostChangePct:outcomes.length?
      round(meanReturn(outcomes,'cashOutlayReturnPct')):null,
    worstModeledAfterCostChangePct:outcomes.length?round(Math.min(...changes)):null,
    outcomes,
    caveats:{
      researchOnly:true,
      syntheticOrSourceAuthenticityIndependentlyVerified:false,
      independentOutOfSampleCalibrationVerified:false,
      historicalObservationIsNotPrediction:true,
      noLiveBidAskOrLiquidityVerification:true,
      paperEntryExitAreNotExecutablePrices:true,
      realOrdersCreated:false,
      brokerConnected:false,
      futureBarsUsedToClassifySignal:false
    }
  };
}
