const $=id=>document.getElementById(id);
const usd=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
const num=(n,d=3)=>new Intl.NumberFormat('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n);
let latest=null,busy=false;
function linePath(bars,accessor,min,max,width,height){
  const points=bars.map((b,i)=>({v:accessor(b),x:34+(i/Math.max(1,bars.length-1))*(width-62)})).filter(p=>p.v!==null&&Number.isFinite(p.v));
  return points.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+(height-25-(p.v-min)/(max-min)*(height-48)).toFixed(2)).join(' ');
}
function drawChart(bars){
  const svg=$('price-chart'),ns='http://www.w3.org/2000/svg';svg.replaceChildren();if(!bars.length)return;
  const values=bars.flatMap(b=>[b.close,b.ma5,b.ma20]).filter(v=>v!==null&&Number.isFinite(v));
  let min=Math.min(...values),max=Math.max(...values);const pad=(max-min)*.12||1;min-=pad;max+=pad;
  const add=(tag,attrs,text)=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=text;svg.appendChild(el);};
  for(let i=0;i<5;i++){const y=18+i*59;add('line',{x1:35,x2:732,y1:y,y2:y,stroke:'#37505a','stroke-dasharray':'3 6','stroke-width':.7});add('text',{x:5,y:y+4,fill:'#79969c','font-size':10},(max-(max-min)*i/4).toFixed(1));}
  for(const [key,color,w] of [['ma20','#7996a7',1.3],['ma5','#e1c98b',1.5],['close','#a6dda7',2.5]]){
    const path=linePath(bars,b=>b[key],min,max,760,284);if(path)add('path',{d:path,fill:'none',stroke:color,'stroke-width':w,'stroke-linecap':'round','stroke-linejoin':'round'});
  }
  $('chart-range').textContent=bars[0].date+' — '+bars.at(-1).date+' / '+bars.length+' completed sessions';
}
function render(s){
  latest=s;
  $('nav').textContent=usd(s.portfolioValue);
  $('return').textContent=(s.returnPct>0?'+':'')+s.returnPct.toFixed(2)+'%';
  $('return').className=s.returnPct>0?'positive':s.returnPct<0?'negative':'';
  $('pnl').textContent='Virtual P/L: '+usd(s.pnl)+' · synthetic benchmark '+(s.benchmarkPct>0?'+':'')+s.benchmarkPct.toFixed(2)+'%';
  $('drawdown').textContent=s.peakDrawdownPct.toFixed(2)+'%';
  $('date').textContent=s.date;
  $('progress').textContent='Session '+(s.cursor+1)+' of '+s.totalBars+' · seed '+s.seed;
  $('cash').textContent=usd(s.cash);
  $('quantity').textContent=num(s.quantity);
  $('pending').textContent=s.pending?(s.pending.side==='ENTER'?'HYPOTHETICAL ENTRY':'HYPOTHETICAL EXIT'):'NONE';
  $('headline').textContent=s.interpretation.headline;
  $('observed').textContent=s.interpretation.observed;
  $('hypothesis').textContent=s.interpretation.hypothesis;
  $('counter').textContent=s.interpretation.counterevidence;
  $('uncertainty').textContent=s.interpretation.uncertainty;
  $('evidence').replaceChildren(...s.interpretation.evidence.map(e=>{
    const div=document.createElement('div'),label=document.createElement('span'),value=document.createElement('strong');
    label.textContent=e.label;label.title=e.source;value.textContent=e.value;div.append(label,value);return div;
  }));
  $('seed').value=String(s.seed);
  $('status').textContent=s.cursor>=s.totalBars-1?'Scenario completed. Reset to begin another simulation.':
    s.pending?'Next session: '+(s.pending.side==='ENTER'?'hypothetical entry':'hypothetical exit')+' pending. '+s.interpretation.lastEvent:s.interpretation.lastEvent;
  $('trade-count').textContent=s.trades.length+' FILLS';
  const tbody=$('ledger-body');tbody.replaceChildren();
  if(!s.trades.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.className='empty';td.textContent='No hypothetical fills recorded.';tr.append(td);tbody.append(tr);}
  for(const t of [...s.trades].reverse()){const tr=document.createElement('tr');for(const value of [t.fillDate,t.side==='PAPER_BUY'?'VIRTUAL BUY':'VIRTUAL SELL',num(t.quantity),usd(t.price),usd(t.fee)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}tbody.append(tr);}
  $('step').disabled=busy||s.cursor>=s.totalBars-1;$('run').disabled=busy||s.cursor>=s.totalBars-1;drawChart(s.bars);
}
async function request(path,body){
  const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Local request failed');return data;
}
async function action(path,body){
  if(busy)return;busy=true;$('step').disabled=true;$('run').disabled=true;$('reset').disabled=true;$('experiment-button').disabled=true;
  $('status').textContent='Processing synthetic research session…';
  let failure=null;
  try{const state=await request(path,body);render(state);$('experiment-result').textContent='Scenario changed. Run the experiment for independent full-replay results.';}
  catch(error){failure=error instanceof Error?error.message:'Unknown local error';}
  finally{
    busy=false;$('reset').disabled=false;$('experiment-button').disabled=false;
    if(latest)render(latest);
    if(failure)$('status').textContent='Could not complete local simulation: '+failure;
  }
}
$('step').addEventListener('click',()=>action('/api/step',{}));
$('run').addEventListener('click',()=>action('/api/run',{count:20}));
$('reset').addEventListener('click',()=>{
  const seed=Number($('seed').value);
  if(!Number.isSafeInteger(seed)||seed<1||seed>1000000){$('status').textContent='Use an integer scenario seed between 1 and 1,000,000.';return;}
  action('/api/reset',{seed});
});
$('experiment-button').addEventListener('click',async()=>{
  $('experiment-button').disabled=true;$('experiment-result').textContent='Running reproducible synthetic scenario…';
  try{
    const r=await request('/api/experiment'),panel=$('experiment-result');panel.replaceChildren();
    for(const [label,value] of [['Simulated strategy return',r.simulatedReturnPct.toFixed(2)+'%'],['Synthetic buy-and-hold comparison',r.benchmarkPct.toFixed(2)+'%'],['Maximum simulated drawdown',r.peakDrawdownPct.toFixed(2)+'%'],['Virtual fills',String(r.tradeCount)],['Scenario',String(r.seed)+' · '+r.start+' → '+r.end]]){
      const row=document.createElement('div'),a=document.createElement('span'),b=document.createElement('strong');a.textContent=label;b.textContent=value;row.append(a,b);panel.append(row);
    }
    const caution=document.createElement('p');caution.textContent=r.caveat;panel.append(caution);
  }catch(e){$('experiment-result').textContent='Experiment unavailable: '+e.message;}
  finally{$('experiment-button').disabled=false;}
});
$('ai-explain').addEventListener('click',async()=>{
  $('ai-explain').disabled=true;$('ai-output').textContent='Requesting optional synthetic-data commentary…';
  try{const r=await request('/api/ai-report',{});$('ai-output').textContent=r.enabled?'MODEL COMMENTARY · '+r.explanation+' LIMITATIONS · '+r.limitations+' — '+r.provenance:r.reason;}
  catch(e){$('ai-output').textContent='AI commentary unavailable: '+e.message;}
  finally{$('ai-explain').disabled=false;}
});
request('/api/state').then(render).catch(e=>{$('status').textContent='Local API unavailable: '+e.message;});
