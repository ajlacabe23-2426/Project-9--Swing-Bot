/** Deterministic comparison of two already-generated local data-readiness audits.
 * No market-data retrieval, signal generation, broker orders, or file writes.
 */
const SCHEMA='project9-offline-market-readiness-audit-v1';
const HASH=/^[a-f0-9]{64}$/;
const ISO=/^\d{4}-\d{2}-\d{2}$/;
const DAY=value=>typeof value==='string'&&ISO.test(value)&&
  Number.isFinite(Date.parse(value+'T00:00:00Z'))&&
  new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const STATUS=new Set(['REVIEW_REQUIRED','STRUCTURALLY_CLEAN_UNVERIFIED']);

function normalized(report,label){
  if(!report||typeof report!=='object'||Array.isArray(report)||
      report.schema!==SCHEMA||!DAY(report.reviewDate)||
      report.researchOnly!==true||report.executionAllowed!==false||
      report.brokerageConnected!==false||!Array.isArray(report.datasets)||
      !Number.isInteger(report.datasetCount)||report.datasetCount!==report.datasets.length||
      report.datasets.length<1||report.datasets.length>100)
    throw new Error(label+' is not a valid non-executable readiness report');

  const bySymbol=new Map();
  for(const row of report.datasets){
    if(!row||typeof row!=='object'||Array.isArray(row)||
       typeof row.symbol!=='string'||!/^[A-Z0-9.-]{1,18}$/.test(row.symbol)||
       typeof row.fileSha256!=='string'||!HASH.test(row.fileSha256)||
       !DAY(row.latestCompletedBar)||!DAY(row.sourceAsOf)||
       row.latestCompletedBar>report.reviewDate||row.sourceAsOf>report.reviewDate||
       !Number.isInteger(row.ageCalendarDays)||row.ageCalendarDays<0||
       !STATUS.has(row.researchReadiness)||row.dataAuthenticityIndependentlyVerified!==false||
       row.realOrdersAllowed!==false||!Array.isArray(row.reviewReasons)||
       row.reviewReasons.length>100||row.reviewReasons.some(code=>
         typeof code!=='string'||!/^[A-Z0-9_]{1,100}$/.test(code))||
       new Set(row.reviewReasons).size!==row.reviewReasons.length||
       bySymbol.has(row.symbol))
      throw new Error(label+' contains an invalid or duplicated instrument');
    const actualAge=Math.round((Date.parse(report.reviewDate+'T00:00:00Z')-
      Date.parse(row.latestCompletedBar+'T00:00:00Z'))/86400000);
    if(row.ageCalendarDays!==actualAge)throw new Error(label+' has inconsistent bar age');
    bySymbol.set(row.symbol,row);
  }
  if(report.reviewRequiredCount!==[...bySymbol.values()].filter(row=>
    row.researchReadiness==='REVIEW_REQUIRED').length)
    throw new Error(label+' has inconsistent review counts');
  return bySymbol;
}

const sorted=items=>items.sort((a,b)=>a.localeCompare(b));

export function compareMarketAuditReports(before,after){
  const a=normalized(before,'Previous');
  const b=normalized(after,'Current');
  if(after.reviewDate<before.reviewDate)
    throw new Error('Current review date cannot precede the previous review date');

  const added=sorted([...b.keys()].filter(symbol=>!a.has(symbol)));
  const removed=sorted([...a.keys()].filter(symbol=>!b.has(symbol)));
  const updated=[];
  const unchanged=[];
  for(const symbol of sorted([...b.keys()].filter(symbol=>a.has(symbol)))){
    const old=a.get(symbol),now=b.get(symbol);
    const newReasons=sorted(now.reviewReasons.filter(reason=>!old.reviewReasons.includes(reason)));
    const resolvedReasons=sorted(old.reviewReasons.filter(reason=>!now.reviewReasons.includes(reason)));
    const changes={
      symbol,
      inputBytesChanged:old.fileSha256!==now.fileSha256,
      latestBarAdvanced:now.latestCompletedBar>old.latestCompletedBar,
      latestBarMovedBackward:now.latestCompletedBar<old.latestCompletedBar,
      statusChanged:old.researchReadiness!==now.researchReadiness,
      newlyFlaggedReasons:newReasons,
      noLongerFlaggedReasons:resolvedReasons,
    };
    if(changes.inputBytesChanged||changes.latestBarAdvanced||changes.latestBarMovedBackward||
       changes.statusChanged||newReasons.length||resolvedReasons.length){
      updated.push(changes);
    }else{
      unchanged.push(symbol);
    }
  }
  return {
    schema:'project9-market-audit-change-report-v1',
    previousReviewDate:before.reviewDate,
    currentReviewDate:after.reviewDate,
    researchOnly:true,
    vendorAuthenticityVerified:false,
    brokerageConnected:false,
    executionAllowed:false,
    added,removed,updated,unchanged,
    attentionRequired:removed.length>0||updated.some(item=>
      item.latestBarMovedBackward||item.newlyFlaggedReasons.length>0),
    notice:'Changed files or resolved review flags do not validate data authenticity, predictive ability, or permission to trade.',
  };
}
