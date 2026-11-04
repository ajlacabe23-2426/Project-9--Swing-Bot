import {auditMarketDatasetBatch} from './market-readiness-audit.mjs';
import {normalizeMarketDataset,evaluateSwingSetup} from './market-intelligence.mjs';

const decimal=(number)=>Math.round(number*10000)/10000;

/**
 * Retrospective, non-overlapping completed-bar observation windows.
 * No optimization, predictive backtest, future-return attribution, order
 * routing or investment recommendation. Scan classifications at each window
 * end use only current and earlier prices. Source metadata is retrospective.
 */
export function analyzeMarketRegimeWindows(entries,{reviewDate,windowBars=20}={}){
  if(!Number.isSafeInteger(windowBars)||windowBars<10||windowBars>60)
    throw new Error('Window length must be 10–60 completed bars');
  const readiness=auditMarketDatasetBatch(entries,{reviewDate});
  const results=entries.map(entry=>{
    const dataset=normalizeMarketDataset(entry.data);
    const bars=dataset.bars;
    const windows=[];
    // At least 50 completed bars precede each descriptive window. The first
    // classification is evaluated at index >= 59 (51-bar minimum).
    for(let start=50;start+windowBars<=bars.length;start+=windowBars){
      const end=start+windowBars-1;
      const initialClose=bars[start-1].close,finalClose=bars[end].close;
      const movementPct=decimal((finalClose/initialClose-1)*100);
      let absDailySum=0,peak=initialClose,maxDrawdownPct=0;
      for(let i=start;i<=end;i++){
        const change=(bars[i].close/bars[i-1].close-1)*100;
        absDailySum+=Math.abs(change);
        peak=Math.max(peak,bars[i].close);
        maxDrawdownPct=Math.max(maxDrawdownPct,(1-bars[i].close/peak)*100);
      }
      const scan=evaluateSwingSetup(dataset,{asOfIndex:end});
      windows.push({
        startDate:bars[start].date,endDate:bars[end].date,
        observedBars:windowBars,
        retrospectiveChangePct:movementPct,
        meanAbsoluteDailyCloseChangePct:decimal(absDailySum/windowBars),
        maximumObservedCloseDrawdownPct:decimal(maxDrawdownPct),
        descriptiveCondition:movementPct>2?'HISTORICAL_RISING':
          movementPct< -2?'HISTORICAL_FALLING':'HISTORICAL_RANGE_LIKE',
        scannerAtWindowEnd:{
          asOf:scan.asOf,
          classification:scan.classification,
          score:scan.score,
          observed:scan.observed
        }
      });
    }
    const datasetAudit=readiness.datasets.find(item=>item.symbol===dataset.symbol);
    const conditionCounts={
      HISTORICAL_RISING:windows.filter(w=>w.descriptiveCondition==='HISTORICAL_RISING').length,
      HISTORICAL_FALLING:windows.filter(w=>w.descriptiveCondition==='HISTORICAL_FALLING').length,
      HISTORICAL_RANGE_LIKE:windows.filter(w=>w.descriptiveCondition==='HISTORICAL_RANGE_LIKE').length
    };
    return {
      symbol:dataset.symbol,
      fileSha256:datasetAudit.fileSha256,
      latestCompletedBar:datasetAudit.latestCompletedBar,
      researchReadiness:datasetAudit.researchReadiness,
      reviewReasons:[...datasetAudit.reviewReasons,
        ...(windows.length===0?['INSUFFICIENT_FULL_HISTORICAL_WINDOWS']:[])],
      warmupCompletedBars:Math.min(50,bars.length),
      windowLengthCompletedBars:windowBars,
      excludedTrailingCompletedBars:Math.max(0,bars.length-50-windows.length*windowBars),
      historicalWindowCount:windows.length,
      conditionCounts,windows
    };
  }).sort((a,b)=>a.symbol.localeCompare(b.symbol));
  return {
    schema:'project9-offline-regime-research-v1',
    reviewDate,windowLengthCompletedBars:windowBars,
    researchOnly:true,networkRequests:false,brokerageConnected:false,
    tradeOrdersCreated:false,realWorldAccuracyVerified:false,
    datasetCount:results.length,results,
    interpretation:[
      'Conditions are retrospective descriptions of fixed, non-overlapping completed-bar windows; the 2% condition threshold is arbitrary.',
      'Scanner scores observed at window ends are not tested against subsequent market performance and are not recommendations.',
      'All sources, corporate actions, data rights and point-in-time universe membership require independent review.',
      'This output cannot establish profitability or execution readiness and cannot place orders.'
    ]
  };
}
