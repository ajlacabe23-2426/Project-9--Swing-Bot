import {MAX_BYTES,parseHistoricalCsv,analyzeHistoricalResearch,datasetFingerprint,buildExperimentManifest} from './research-core.mjs';
const $=id=>document.getElementById(id);
const format=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2,minimumFractionDigits:2}).format(n);
let currentManifest=null;
function metricRows(target,period){
  target.replaceChildren();
  const values=[
    ['Time period',period.start+' – '+period.end],
    ['Completed bars',String(period.bars)],
    ['Simulated end value','$'+format(period.simulatedEndValue)],
    ['Simulated change',format(period.simulatedReturnPct)+'%'],
    ['Unadjusted price comparison',format(period.comparisonReturnPct)+'%'],
    ['Difference vs comparison',format(period.excessReturnVsComparisonPct)+'%'],
    ['Comparison end value','
    ['Modeled fees','$'+format(period.simulatedFees)],
    ['Simulated fills',String(period.fillCount)],
    ['Blocked fills',String(period.blockedCount)],
    ['Open paper units',String(period.openUnits)]
  ];
  if(period.trainingBars){values.unshift(['Prior development history',period.trainingStart+' – '+period.trainingEnd+' · '+period.trainingBars+' bars']);}
  for(const [label,value] of values){
    const row=document.createElement('div'),name=document.createElement('span'),number=document.createElement('strong');
    name.textContent=label;number.textContent=value;row.append(name,number);target.append(row);
  }
}
function qualityRows(target,quality,readiness){
  target.replaceChildren();
  const values=[
    ['Research readiness',readiness.status.replaceAll('_',' ')],
    ['Observed bars',String(quality.observedBars)],
    ['Calendar span',String(quality.calendarSpanDays)+' days'],
    ['Weekday coverage',format(quality.weekdayCoveragePct)+'%'],
    ['Multi-day gaps',String(quality.multiDayGaps)],
    ['Zero-volume bars',String(quality.zeroVolumeBars)],
    ['Large adjacent open gaps',String(quality.largeAdjacentOpenGaps)],
    ['Close-return outliers (>20%)',String(quality.closeReturnOutliers)],
    ['Extreme intraday ranges (>30%)',String(quality.extremeIntradayRanges)],
    ['Flat close transitions',String(quality.flatCloseTransitions)],
    ['Duplicate OHLCV transitions',String(quality.duplicateOhlcvTransitions)],
    ['Longest flat-close run',String(quality.longestFlatCloseRun)+' bars'],
    ['Largest calendar gap',String(quality.maxCalendarGapDays)+' days'],
    ['Review reasons',readiness.reviewReasons.length?readiness.reviewReasons.join(', '):'None from structural checks']
  ];
  for(const [label,value] of values){
    const row=document.createElement('div'),name=document.createElement('span'),number=document.createElement('strong');
    name.textContent=label;number.textContent=value;row.append(name,number);target.append(row);
  }
}
$('dataset-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const file=$('csv').files?.[0],status=$('import-status');
  const provenance={
    source:$('source').value.trim(),
    instrument:$('instrument').value.trim(),
    currency:$('currency').value.trim(),
    priceAdjustment:$('price-adjustment').value,
    asOfDate:$('source-as-of').value
  };
  $('results').hidden=true;currentManifest=null;$('download-manifest').disabled=true;
  try{
    if(!file)throw new Error('Select a CSV file first');
    if(!$('rights').checked)throw new Error('Confirm you have permission for local research');
    if(file.size>MAX_BYTES)throw new Error('CSV exceeds 550 KB');
    status.textContent='Validating locally selected CSV…';
    const content=await file.text(),parsed=parseHistoricalCsv(content),result=analyzeHistoricalResearch(parsed,provenance);
    const fingerprint=await datasetFingerprint(content);
    currentManifest=buildExperimentManifest(result,fingerprint);
    $('provenance').textContent='DECLARED SOURCE: '+result.sourceDeclaredByUser+' · INSTRUMENT '+result.instrumentDeclaredByUser+' · '+result.currencyDeclaredByUser+' · ADJUSTMENT '+result.priceAdjustmentDeclaredByUser+' · SOURCE AS OF '+result.sourceAsOfDate+' · '+result.rows+' BARS · '+result.earliest+' → '+result.latest+' · '+result.mode+' · LOCAL SHA-256 '+fingerprint+' · FILE STAYS IN YOUR BROWSER';
    qualityRows($('quality-metrics'),result.dataQuality,result.researchReadiness);metricRows($('training-metrics'),result.train);metricRows($('holdout-metrics'),result.holdout);
    for(const fold of result.walkForward)metricRows($('walk-'+fold.fold),fold);
    for(const stress of result.holdoutStress)metricRows($('stress-'+stress.multiplier+'x'),stress);
    for(const check of result.chronologicalChecks)metricRows($('segment-'+check.segment),check);
    $('warnings').replaceChildren();
    for(const message of [...result.warnings,...result.limitations]){
      const item=document.createElement('li');item.textContent=message;$('warnings').append(item);
    }
    $('holdout-fills').replaceChildren();
    for(const fill of result.holdout.fills.slice(0,20)){
      const tr=document.createElement('tr');
      for(const value of [fill.signalDate,fill.fillDate,fill.kind,format(fill.quantity),'$'+format(fill.price)]){
        const td=document.createElement('td');td.textContent=value;tr.append(td);
      }$('holdout-fills').append(tr);
    }
    if(result.holdout.fills.length===0){
      const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent='No hypothetical fills in the held-out window.';tr.append(td);$('holdout-fills').append(tr);
    }
    $('results').hidden=false;$('download-manifest').disabled=false;
    status.textContent='Browser-only experiment complete. No file sent to a server or model. No synthetic paper portfolio state changed.';
  }catch(error){status.textContent='Research import rejected: '+(error instanceof Error?error.message:'Unknown error');}
});

$('download-manifest').addEventListener('click',()=>{
  if(!currentManifest)return;
  const blob=new Blob([JSON.stringify(currentManifest,null,2)+'\n'],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='project9-experiment-'+currentManifest.dataset.sha256.slice(0,12)+'.json';
  document.body.appendChild(link);link.click();link.remove();
  URL.revokeObjectURL(url);
});
+format(period.comparisonEndValue)],
    ['Max hypothetical drawdown',format(period.simulatedMaxDrawdownPct)+'%'],
    ['Comparison max drawdown',format(period.comparisonMaxDrawdownPct)+'%'],
    ['Modeled fees','$'+format(period.simulatedFees)],
    ['Simulated fills',String(period.fillCount)],
    ['Blocked fills',String(period.blockedCount)],
    ['Open paper units',String(period.openUnits)]
  ];
  for(const [label,value] of values){
    const row=document.createElement('div'),name=document.createElement('span'),number=document.createElement('strong');
    name.textContent=label;number.textContent=value;row.append(name,number);target.append(row);
  }
}
function qualityRows(target,quality,readiness){
  target.replaceChildren();
  const values=[
    ['Research readiness',readiness.status.replaceAll('_',' ')],
    ['Observed bars',String(quality.observedBars)],
    ['Calendar span',String(quality.calendarSpanDays)+' days'],
    ['Weekday coverage',format(quality.weekdayCoveragePct)+'%'],
    ['Multi-day gaps',String(quality.multiDayGaps)],
    ['Zero-volume bars',String(quality.zeroVolumeBars)],
    ['Large adjacent open gaps',String(quality.largeAdjacentOpenGaps)],
    ['Close-return outliers (>20%)',String(quality.closeReturnOutliers)],
    ['Extreme intraday ranges (>30%)',String(quality.extremeIntradayRanges)],
    ['Flat close transitions',String(quality.flatCloseTransitions)],
    ['Largest calendar gap',String(quality.maxCalendarGapDays)+' days'],
    ['Review reasons',readiness.reviewReasons.length?readiness.reviewReasons.join(', '):'None from structural checks']
  ];
  for(const [label,value] of values){
    const row=document.createElement('div'),name=document.createElement('span'),number=document.createElement('strong');
    name.textContent=label;number.textContent=value;row.append(name,number);target.append(row);
  }
}
$('dataset-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const file=$('csv').files?.[0],status=$('import-status');
  const provenance={
    source:$('source').value.trim(),
    instrument:$('instrument').value.trim(),
    currency:$('currency').value.trim(),
    priceAdjustment:$('price-adjustment').value,
    asOfDate:$('source-as-of').value
  };
  $('results').hidden=true;currentManifest=null;$('download-manifest').disabled=true;
  try{
    if(!file)throw new Error('Select a CSV file first');
    if(!$('rights').checked)throw new Error('Confirm you have permission for local research');
    if(file.size>MAX_BYTES)throw new Error('CSV exceeds 550 KB');
    status.textContent='Validating locally selected CSV…';
    const content=await file.text(),parsed=parseHistoricalCsv(content),result=analyzeHistoricalResearch(parsed,provenance);
    const fingerprint=await datasetFingerprint(content);
    currentManifest=buildExperimentManifest(result,fingerprint);
    $('provenance').textContent='DECLARED SOURCE: '+result.sourceDeclaredByUser+' · INSTRUMENT '+result.instrumentDeclaredByUser+' · '+result.currencyDeclaredByUser+' · ADJUSTMENT '+result.priceAdjustmentDeclaredByUser+' · SOURCE AS OF '+result.sourceAsOfDate+' · '+result.rows+' BARS · '+result.earliest+' → '+result.latest+' · '+result.mode+' · LOCAL SHA-256 '+fingerprint+' · FILE STAYS IN YOUR BROWSER';
    qualityRows($('quality-metrics'),result.dataQuality,result.researchReadiness);metricRows($('training-metrics'),result.train);metricRows($('holdout-metrics'),result.holdout);
    for(const stress of result.holdoutStress)metricRows($('stress-'+stress.multiplier+'x'),stress);
    for(const check of result.chronologicalChecks)metricRows($('segment-'+check.segment),check);
    $('warnings').replaceChildren();
    for(const message of [...result.warnings,...result.limitations]){
      const item=document.createElement('li');item.textContent=message;$('warnings').append(item);
    }
    $('holdout-fills').replaceChildren();
    for(const fill of result.holdout.fills.slice(0,20)){
      const tr=document.createElement('tr');
      for(const value of [fill.signalDate,fill.fillDate,fill.kind,format(fill.quantity),'$'+format(fill.price)]){
        const td=document.createElement('td');td.textContent=value;tr.append(td);
      }$('holdout-fills').append(tr);
    }
    if(result.holdout.fills.length===0){
      const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent='No hypothetical fills in the held-out window.';tr.append(td);$('holdout-fills').append(tr);
    }
    $('results').hidden=false;$('download-manifest').disabled=false;
    status.textContent='Browser-only experiment complete. No file sent to a server or model. No synthetic paper portfolio state changed.';
  }catch(error){status.textContent='Research import rejected: '+(error instanceof Error?error.message:'Unknown error');}
});

$('download-manifest').addEventListener('click',()=>{
  if(!currentManifest)return;
  const blob=new Blob([JSON.stringify(currentManifest,null,2)+'\n'],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='project9-experiment-'+currentManifest.dataset.sha256.slice(0,12)+'.json';
  document.body.appendChild(link);link.click();link.remove();
  URL.revokeObjectURL(url);
});
