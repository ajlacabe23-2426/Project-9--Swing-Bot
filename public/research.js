import {MAX_BYTES,parseHistoricalCsv,analyzeHistoricalResearch} from './research-core.mjs';
const $=id=>document.getElementById(id);
const format=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2,minimumFractionDigits:2}).format(n);
function metricRows(target,period){
  target.replaceChildren();
  const values=[
    ['Time period',period.start+' – '+period.end],
    ['Completed bars',String(period.bars)],
    ['Simulated end value','$'+format(period.simulatedEndValue)],
    ['Simulated change',format(period.simulatedReturnPct)+'%'],
    ['Unadjusted price comparison',format(period.comparisonReturnPct)+'%'],
    ['Max hypothetical drawdown',format(period.simulatedMaxDrawdownPct)+'%'],
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
$('dataset-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const file=$('csv').files?.[0],source=$('source').value.trim(),status=$('import-status');
  $('results').hidden=true;
  try{
    if(!file)throw new Error('Select a CSV file first');
    if(!$('rights').checked)throw new Error('Confirm you have permission for local research');
    if(file.size>MAX_BYTES)throw new Error('CSV exceeds 550 KB');
    status.textContent='Validating locally selected CSV…';
    const content=await file.text(),parsed=parseHistoricalCsv(content),result=analyzeHistoricalResearch(parsed,source);
    $('provenance').textContent='DECLARED SOURCE: '+result.sourceDeclaredByUser+' · '+result.rows+' BARS · '+result.earliest+' → '+result.latest+' · '+result.mode+' · FILE STAYS IN YOUR BROWSER';
    metricRows($('training-metrics'),result.train);metricRows($('holdout-metrics'),result.holdout);
    for(const stress of result.holdoutStress)metricRows($('stress-'+stress.multiplier+'x'),stress);
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
    $('results').hidden=false;
    status.textContent='Browser-only experiment complete. No file sent to a server or model. No synthetic paper portfolio state changed.';
  }catch(error){status.textContent='Research import rejected: '+(error instanceof Error?error.message:'Unknown error');}
});
