import {normalizeMarketDataset,assessMarketDataQuality,isStrictISODate} from './market-intelligence.mjs';

const SHA256=/^[0-9a-f]{64}$/;
const daysBetween=(older,newer)=>
  Math.round((Date.parse(newer+'T00:00:00.000Z')-Date.parse(older+'T00:00:00.000Z'))/86_400_000);

/**
 * Read-only audit of exact, locally supplied historical market-data files.
 * This DOES NOT validate vendor authenticity, create trading signals, or execute orders.
 * The explicit review date makes the output reproducible and prevents accidental
 * use of future observations in an earlier research snapshot.
 */
export function auditMarketDatasetBatch(entries,{reviewDate}={}){
  if(!isStrictISODate(reviewDate))throw new Error('An explicit valid --as-of YYYY-MM-DD review date is required');
  if(!Array.isArray(entries)||entries.length<1||entries.length>100)
    throw new Error('The audit requires 1–100 datasets');
  const symbols=new Set();
  const audited=entries.map((entry,index)=>{
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||
       typeof entry.filename!=='string'||entry.filename.length<1||entry.filename.length>255||
       !SHA256.test(entry.sha256))
      throw new Error('Missing file identity or SHA-256 for dataset '+(index+1));
    const dataset=normalizeMarketDataset(entry.data);
    if(symbols.has(dataset.symbol))throw new Error('Duplicate instrument in batch: '+dataset.symbol);
    symbols.add(dataset.symbol);
    const latestBar=dataset.bars.at(-1).date;
    if(latestBar>reviewDate||dataset.sourceAsOf>reviewDate)
      throw new Error('Dataset for '+dataset.symbol+' contains observations or source metadata after review date');
    const quality=assessMarketDataQuality(dataset);
    const ageCalendarDays=daysBetween(latestBar,reviewDate);
    const reviewReasons=[...new Set([
      ...quality.reasons,
      ...quality.provenanceReview.reasons,
      ...(ageCalendarDays>5?['LAST_COMPLETED_BAR_OVER_FIVE_CALENDAR_DAYS_OLD']:[])
    ])];
    return {
      symbol:dataset.symbol,
      filename:entry.filename,
      fileSha256:entry.sha256,
      reviewDate,
      latestCompletedBar:latestBar,
      sourceAsOf:dataset.sourceAsOf,
      source:dataset.source,
      dataMode:dataset.mode,
      observedBars:dataset.bars.length,
      ageCalendarDays,
      quality,
      reviewReasons,
      researchReadiness:reviewReasons.length?'REVIEW_REQUIRED':'STRUCTURALLY_CLEAN_UNVERIFIED',
      dataAuthenticityIndependentlyVerified:false,
      brokerageConnected:false,
      realOrdersAllowed:false
    };
  }).sort((a,b)=>a.symbol.localeCompare(b.symbol));
  return {
    schema:'project9-offline-market-readiness-audit-v1',
    reviewDate,
    researchOnly:true,
    noNetworkRequests:true,
    brokerageConnected:false,
    executionAllowed:false,
    datasetCount:audited.length,
    reviewRequiredCount:audited.filter(item=>item.researchReadiness==='REVIEW_REQUIRED').length,
    differentLatestBarDates:new Set(audited.map(item=>item.latestCompletedBar)).size>1,
    datasets:audited,
    interpretation:[
      'A clean structural audit does not authenticate market history, corporate actions, data rights or predictive validity.',
      'The five-calendar-day threshold is a review flag, not a market-hours or exchange-holiday calculation.',
      'Do not interpret this report as an executable-price check, a trading recommendation or a brokerage connection.'
    ]
  };
}
