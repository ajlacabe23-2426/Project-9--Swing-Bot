import {createDecisionMap} from './decision-map.js';
import {buildDecisionMap} from './decision-map-core.mjs';
const $=id=>document.getElementById(id);
const usd=n=>Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n):'—';
const num=(n,d=2)=>Number.isFinite(n)?new Intl.NumberFormat('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n):'—';
let state=null,selectedSymbol=null,busy=false,referenceView='current';
const decisionMap=createDecisionMap();

async function request(path,body){
  const options=body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
  const response=await fetch(path,options),payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload.error||'Request failed');
  return payload;
}
function cell(text,className=''){
  const td=document.createElement('td');td.textContent=text;if(className)td.className=className;return td;
}
function metric(label,value){
  const row=document.createElement('div'),a=document.createElement('span'),b=document.createElement('strong');
  a.textContent=label;b.textContent=value;row.append(a,b);return row;
}
function scans(){
  return Object.values(state?.lastScans||{}).sort((a,b)=>b.score-a.score||a.symbol.localeCompare(b.symbol));
}
function statusClass(value){
  return value==='PAPER_SETUP_STRONG'?'classification-strong':value==='PAPER_SETUP_WATCH'?'classification-watch':'classification-none';
}
function canCreatePaperTicket(scan){
  return !!scan&&scan.classification!=='NO_PAPER_SETUP'&&
    Number.isFinite(scan.paperRiskPlan?.maxPaperUnits)&&scan.paperRiskPlan.maxPaperUnits>=0.001;
}
function drawSetupChart(scan,ticket){
  const svg=$('setup-chart'),ns='http://www.w3.org/2000/svg';svg.replaceChildren();
  const bars=scan?.chartBars||[];if(!bars.length)return;
  const model=buildDecisionMap(scan,ticket),refs=model.references||{};
  svg.setAttribute('aria-label','Completed daily closes; '+model.summary);
  const values=bars.flatMap(bar=>[bar.close]).concat(Object.values(refs)).filter(Number.isFinite);
  let min=Math.min(...values),max=Math.max(...values);const pad=(max-min)*.12||1;min-=pad;max+=pad;
  const width=760,height=284;
  const add=(tag,attrs,text)=>{const el=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));if(text!==undefined)el.textContent=text;svg.appendChild(el);return el;};
  for(let i=0;i<5;i++){
    const y=18+i*59;
    add('line',{x1:38,x2:735,y1:y,y2:y,stroke:'#37505a','stroke-dasharray':'3 6','stroke-width':.7});
    add('text',{x:4,y:y+4,fill:'#79969c','font-size':10},(max-(max-min)*i/4).toFixed(2));
  }
  const yFor=value=>height-25-(value-min)/(max-min)*(height-48);
  const path=bars.map((bar,index)=>{
    const x=40+(index/Math.max(1,bars.length-1))*690,y=yFor(bar.close);
    return (index?'L':'M')+x.toFixed(2)+' '+y.toFixed(2);
  }).join(' ');
  add('path',{d:path,fill:'none',stroke:'#a6dda7','stroke-width':2.3,'stroke-linecap':'round','stroke-linejoin':'round'});
  for(const [label,value,stroke] of [['ENTRY',refs.entry,'#e1c98b'],['STOP',refs.stop,'#d59c9c'],['TARGET',refs.target,'#9bc9df']]){
    if(!Number.isFinite(value))continue;
    const y=yFor(value);add('line',{x1:40,x2:735,y1:y,y2:y,stroke,'stroke-width':1,'stroke-dasharray':'5 5'});
    add('text',{x:650,y:y-5,fill:stroke,'font-size':9},label+' '+value.toFixed(2));
    const index=label==='ENTRY'?bars.findIndex(bar=>bar.date===model.referenceDate):-1;
    if(label!=='ENTRY'||index>=0){
      const x=label==='ENTRY'?40+index/Math.max(1,bars.length-1)*690:735;
      const marker=add('circle',{'data-reference':label.toLowerCase(),cx:x,cy:y,r:4,fill:stroke});
      const title=document.createElementNS(ns,'title');title.textContent=model.referenceLabel+' · '+label+' reference '+value.toFixed(4);marker.append(title);
    }
  }
  const outcome=ticket?.outcome;
  const exitIndex=bars.findIndex(bar=>bar.date===outcome?.observedThrough);
  if(exitIndex>=0&&Number.isFinite(outcome?.exitReference)&&['STOP_REFERENCE_TOUCHED','TARGET_REFERENCE_TOUCHED'].includes(outcome.status)){
    const x=40+exitIndex/Math.max(1,bars.length-1)*690,y=yFor(outcome.exitReference);
    const marker=add('circle',{'data-outcome':outcome.status,cx:x,cy:y,r:6,fill:'#e5eddf',stroke:'#102c32','stroke-width':2});
    const title=document.createElementNS(ns,'title');title.textContent='Paper reference touch · '+outcome.observedThrough+' · '+outcome.status+' · not an executable fill';marker.append(title);
  }
  add('text',{x:40,y:281,fill:'#79969c','font-size':9},bars[0].date);
  add('text',{x:650,y:281,fill:'#79969c','font-size':9},bars.at(-1).date);
}
function renderScanner(){
  const tbody=$('scanner-body');tbody.replaceChildren();
  const ranked=scans();
  if(!ranked.length){const tr=document.createElement('tr');const td=cell('No scanned symbols yet.','empty');td.colSpan=7;tr.append(td);tbody.append(tr);return;}
  for(const scan of ranked){
    const tr=document.createElement('tr');tr.className=scan.symbol===selectedSymbol?'selected-row':'';
    const symbolCell=document.createElement('td'),button=document.createElement('button');button.className='scanner-symbol';button.textContent=scan.symbol;
    button.addEventListener('click',()=>{selectedSymbol=scan.symbol;referenceView='current';render();});symbolCell.append(button);tr.append(symbolCell);
    tr.append(cell(String(scan.score)),cell(scan.classification,statusClass(scan.classification)),cell(usd(scan.observed.close)),cell(num(scan.observed.rsi14,1)),cell(scan.observed.relativeVolume===null?'—':num(scan.observed.relativeVolume,2)+'×'),cell(scan.asOf));
    tbody.append(tr);
  }
}
function renderDetail(){
  const scan=state?.lastScans?.[selectedSymbol];
  const observed=$('setup-observed'),checks=$('setup-checks'),plan=$('paper-plan');
  observed.replaceChildren();checks.replaceChildren();plan.replaceChildren();
  if(!scan){
    $('setup-title').textContent='Select a scanned symbol';$('setup-tag').textContent='NO SETUP';$('setup-tag').className='tag';
    $('setup-score').textContent='—';$('setup-source').textContent='Refresh a symbol to inspect source-bound evidence.';
    $('create-ticket').disabled=true;$('setup-chart').replaceChildren();renderReferenceView(null);decisionMap.update(null,null);return;
  }
  $('setup-title').textContent=scan.symbol+' · '+scan.asOf;
  $('setup-tag').textContent=scan.classification.replaceAll('_',' ');
  $('setup-tag').className='tag '+statusClass(scan.classification);
  $('setup-score').textContent=String(scan.score);
  $('setup-source').textContent=scan.source.name+' · '+scan.source.mode+' · source as of '+scan.source.sourceAsOf+' · '+scan.source.priceAdjustment;
  for(const [label,value] of [
    ['Completed close',usd(scan.observed.close)],['20-session mean',usd(scan.observed.sma20)],['50-session mean',usd(scan.observed.sma50)],
    ['RSI (14)',num(scan.observed.rsi14,1)],['ATR (14)',usd(scan.observed.atr14)],['Prior 20-session high',usd(scan.observed.prior20High)],
    ['Relative volume',scan.observed.relativeVolume===null?'—':num(scan.observed.relativeVolume,2)+'×']
  ])observed.append(metric(label,value));
  const labels={above20:'Close above 20-session mean',trendAligned:'20-session mean above 50-session mean',constructiveMomentum:'RSI in configured research band',breakout:'Close above prior 20-session high',volumeConfirmation:'Relative-volume confirmation'};
  for(const [key,value] of Object.entries(scan.checks))checks.append(metric(labels[key]||key,value?'PASS':'NO'));
  const p=scan.paperRiskPlan;
  for(const [label,value] of [['Paper capital basis',usd(p.paperCapital)],['Paper risk budget',usd(p.paperRiskBudget)],['Entry reference',usd(p.entryReference)],['Stop reference',usd(p.stopReference)],['Target reference',usd(p.targetReference)],['Risk per unit',usd(p.riskPerUnit)],['Maximum virtual units',num(p.maxPaperUnits,3)],['Execution readiness',String(scan.executionReadiness?.status||'NOT_ASSESSED').replaceAll('_',' ')]])plan.append(metric(label,value));
  $('paper-units').max=String(p.maxPaperUnits);
  const current=Number($('paper-units').value);if(!Number.isFinite(current)||current<=0||current>p.maxPaperUnits)$('paper-units').value=String(Math.min(1,p.maxPaperUnits).toFixed(3));
  $('create-ticket').disabled=!canCreatePaperTicket(scan);
  const ticket=renderReferenceView(scan);
  decisionMap.update(scan,ticket);drawSetupChart(scan,ticket);
}
function renderReferenceView(scan){
  const select=$('reference-view');select.replaceChildren();
  const add=(value,label)=>{const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);};
  add('current','Current scan references'+(scan?' · '+scan.asOf:''));
  const tickets=(state?.tickets||[]).filter(t=>t.symbol===scan?.symbol);
  for(const ticket of tickets)add(ticket.id,'Frozen '+ticket.id+' · '+ticket.openedAsOf);
  if(!tickets.some(t=>t.id===referenceView))referenceView='current';
  select.value=referenceView;select.disabled=!scan;
  const ticket=tickets.find(t=>t.id===referenceView)||null;
  const model=buildDecisionMap(scan,ticket);
  $('reference-context').textContent=model.summary;
  return ticket;
}
function renderAlerts(){
  const box=$('alerts');box.replaceChildren();const alerts=state?.alerts||[];$('alert-count').textContent=alerts.length+' ALERT'+(alerts.length===1?'':'S');
  if(!alerts.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='No classification changes recorded.';box.append(empty);return;}
  for(const alert of alerts.slice(0,12)){
    const card=document.createElement('div');card.className='alert-card';
    const title=document.createElement('strong');title.textContent=alert.symbol+' · '+alert.from.replaceAll('_',' ')+' → '+alert.to.replaceAll('_',' ');
    const meta=document.createElement('span');meta.textContent='Score '+alert.scoreFrom+' → '+alert.scoreTo+' · '+alert.asOf;
    card.append(title,meta);box.append(card);
  }
}
function renderTickets(){
  const tbody=$('ticket-body');tbody.replaceChildren();const tickets=state?.tickets||[];$('ticket-count').textContent=tickets.length+' TICKET'+(tickets.length===1?'':'S');
  if(!tickets.length){const tr=document.createElement('tr'),td=cell('No paper tickets yet.','empty');td.colSpan=9;tr.append(td);tbody.append(tr);return;}
  for(const ticket of tickets){
    const o=ticket.outcome||{};
    const tr=document.createElement('tr');
    tr.append(cell(ticket.id),cell(ticket.symbol),cell(ticket.openedAsOf),cell(usd(ticket.entryReference)),cell(usd(ticket.stopReference)),cell(usd(ticket.targetReference)),cell(String(o.status||'—').replaceAll('_',' ')),cell(o.paperPnl===null?'—':usd(o.paperPnl)),cell(o.rMultiple===null?'—':num(o.rMultiple,2)+'R'));
    tbody.append(tr);
  }
}
function renderStatus(){
  const errors=state?.lastRefreshErrors||[];
  if(errors.length){
    $('workstation-status').textContent='Refresh completed with '+errors.length+' issue'+(errors.length===1?'':'s')+': '+errors.slice(0,3).map(item=>item.symbol+' — '+item.message).join(' | ');
    return;
  }
  $('workstation-status').textContent=state?.lastRefresh?'Last completed-bar refresh: '+new Date(state.lastRefresh).toLocaleString()+'.':'No scanned data yet. Connect Massive Stocks or import a permitted historical CSV above, then refresh your watchlist.';
}
function render(){
  if(!state)return;
  if(document.activeElement!==$('watchlist'))$('watchlist').value=state.watchlist.join(', ');
  const ranked=scans();if(!selectedSymbol||!state.lastScans[selectedSymbol])selectedSymbol=ranked[0]?.symbol||null;
  renderStatus();renderScanner();renderDetail();renderAlerts();renderTickets();
}
async function runAction(button,fn){
  if(busy)return;busy=true;const original=button.textContent;button.disabled=true;
  try{state=await fn();render();}catch(error){$('workstation-status').textContent=error.message;}
  finally{
    busy=false;
    button.disabled=button.id==='create-ticket'
      ?!canCreatePaperTicket(state?.lastScans?.[selectedSymbol])
      :false;
    button.textContent=original;
  }
}
async function loadMarketConnection(){
  try{
    const connection=await request('/api/market/status');
    $('market-connection-badge').textContent=connection.connected?'PROVIDER CONNECTED':'PROVIDER NOT CONNECTED';
    $('market-connection-status').textContent=connection.connected
      ?'Massive Stocks credential is configured locally. Refresh your watchlist for historical market prices.'
      :'No provider key configured. Connect one below, or import a permitted historical CSV to analyze completed market bars.';
  }catch(error){
    $('market-connection-badge').textContent='CONNECTION STATUS UNAVAILABLE';
    $('market-connection-status').textContent=error.message;
  }
}
function marketMessage(message){$('market-action-status').textContent=message;}
$('market-connect-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy)return;
  const button=$('connect-market'),apiKey=$('massive-key').value.trim();
  if(!apiKey)return marketMessage('Enter your own Massive Stocks API key.');
  busy=true;button.disabled=true;marketMessage('Verifying actual AAPL historical data with Massive Stocks…');
  try{
    const response=await request('/api/market/connect',{apiKey});
    $('massive-key').value='';
    state=response.workstation;selectedSymbol='AAPL';referenceView='current';
    render();await loadMarketConnection();
    marketMessage('Connected. Real historical AAPL completed bars through '+response.asOf+' loaded into the scanner.');
  }catch(error){
    $('massive-key').value='';
    marketMessage('Connection failed: '+error.message+' No simulated prices were substituted.');
  }finally{busy=false;button.disabled=false;}
});
$('market-import-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy)return;
  const file=$('market-csv').files?.[0],button=$('import-market');
  if(!file)return marketMessage('Select a historical OHLCV CSV file.');
  if(file.size>400_000)return marketMessage('Historical CSV exceeds the 400 KB import limit.');
  busy=true;button.disabled=true;marketMessage('Validating genuine historical CSV rows…');
  try{
    const csv=await file.text();
    const result=await request('/api/market/import',{
      csv,
      symbol:$('market-symbol').value.trim().toUpperCase(),
      source:$('market-source').value.trim(),
      priceAdjustment:$('market-adjustment').value,
      confirmedRights:$('market-rights').checked
    });
    state=result.workstation;selectedSymbol=result.symbol;referenceView='current';
    $('market-csv').value='';render();await loadMarketConnection();
    marketMessage('Imported '+result.bars+' completed historical '+result.symbol+' bars through '+result.asOf+'. Analysis loaded below.');
  }catch(error){
    marketMessage('Import rejected: '+error.message);
  }finally{busy=false;button.disabled=false;}
});

$('reference-view').addEventListener('change',()=>{referenceView=$('reference-view').value;renderDetail();});
$('save-watchlist').addEventListener('click',()=>runAction($('save-watchlist'),async()=>{
  const symbols=$('watchlist').value.split(',').map(value=>value.trim()).filter(Boolean);
  return request('/api/workstation/watchlist',{symbols});
}));
$('refresh').addEventListener('click',()=>runAction($('refresh'),async()=>request('/api/workstation/refresh',{})));
$('create-ticket').addEventListener('click',()=>runAction($('create-ticket'),async()=>{
  const paperUnits=Number($('paper-units').value);
  if(!selectedSymbol||!Number.isFinite(paperUnits)||paperUnits<=0)throw new Error('Choose a scanned setup and valid virtual-unit amount.');
  return request('/api/workstation/tickets',{symbol:selectedSymbol,paperUnits});
}));
request('/api/workstation').then(value=>{state=value;render();return loadMarketConnection();}).catch(error=>{$('workstation-status').textContent='Workstation unavailable: '+error.message;});
