const summary=document.querySelector('#preview-summary');
const cards=document.querySelector('#preview-cards');
const status=document.querySelector('#preview-status');
const button=document.querySelector('#run-preview');
const text=(tag,value,className='')=>{
  const element=document.createElement(tag);
  element.textContent=String(value);
  if(className)element.className=className;
  return element;
};
function statistic(label,value){
  const box=document.createElement('div');box.className='ap-stat';
  box.append(text('span',label),text('strong',value));
  return box;
}
function line(label,value){
  const div=document.createElement('div');div.className='ap-rule';
  div.append(text('span',label),text('strong',value));
  return div;
}
function cardFor(result){
  const card=document.createElement('article');card.className='ap-card';
  const fired=result.status==='DEMO_RULE_TRIGGERED';
  const blocked=result.status==='BLOCKED_INVALID_REVIEW_DATE';
  const label=blocked?'REJECTED SOURCE DATE':fired?'RULE TRIGGERED':'NO RULE TRIGGER';
  card.append(text('span',label,'ap-pill'+(blocked?' ap-muted':'')),
    text('h2',result.symbol+' · '+result.scenarioId.replaceAll('-',' ')),
    text('p',blocked?'No rule was evaluated because the requested review date exceeds the declared historical source date.':fired?
      'Both completed-session conditions passed in the engineered example.':'One or more completed-session conditions did not pass.'));
  card.append(line('Rule version',result.rule.id));
  card.append(line('Rule date',result.signalDate||'Not evaluated'));
  card.append(line('Close above SMA 50',blocked?'NOT RUN':result.checks.closeAboveSma50?'PASS':'FAIL'));
  card.append(line('Close above prior 20 high',blocked?'NOT RUN':result.checks.closeAbovePrevious20High?'PASS':'FAIL'));
  if(result.observed){
    card.append(line('Completed close',result.observed.completedClose),
      line('50-session SMA',result.observed.sma50),
      line('Prior 20 high',result.observed.previous20High));
  }
  card.append(line('Real notification eligible','NO'),line('Orders placed','0'));
  const metadata=text('div','Input SHA-256: '+result.inputSha256+'\nSource as-of: '+result.sourceAsOf+'\nReasons: '+result.reasons.join(', '),'ap-meta');
  metadata.style.whiteSpace='pre-line';
  card.append(metadata);
  return card;
}
async function run(){
  button.disabled=true;
  status.textContent='Evaluating fixed synthetic examples without modifying saved workstation state…';
  try{
    const response=await fetch('/api/alerts/preview',{cache:'no-store'});
    if(!response.ok)throw new Error('Preview API returned HTTP '+response.status);
    const data=await response.json();
    if(data.schema!=='project9-synthetic-alert-preview-v1'||data.authenticMarketData!==false||
       data.noStateMutation!==true||data.realOrdersCreated!==0)
      throw new Error('Unexpected preview safety contract');
    summary.replaceChildren(
      statistic('Demo rules triggered',data.counts.triggeredExamples),
      statistic('Demo non-triggers',data.counts.noTriggerExamples),
      statistic('Rejected scenarios',data.counts.blockedExamples),
      statistic('Notifications sent',data.counts.actualNotificationsSent));
    cards.replaceChildren(...data.scenarios.map(cardFor));
    status.textContent='Preview complete. The results are deterministic and read-only; all notification and trading functions remain disabled.';
  }catch(error){
    summary.replaceChildren();cards.replaceChildren();
    status.textContent='Preview unavailable: '+String(error.message||error);
  }finally{button.disabled=false;}
}
button.addEventListener('click',run);
run();
