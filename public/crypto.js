/** StarNet public crypto research view: user-initiated, no keys, no orders. */
const $=id=>document.getElementById(id);
const ns='http://www.w3.org/2000/svg';
const chart=$('crypto-price-chart');
const set=(id,value)=>{$(id).textContent=String(value);};
const money=x=>typeof x==='number'&&Number.isFinite(x)?
  new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:4}).format(x):'—';

function renderClosedCandles(points){
  chart.replaceChildren();
  const valid=Array.isArray(points)?points.filter(x=>
    typeof x.close==='number'&&Number.isFinite(x.close)&&x.close>0):[];
  if(valid.length<2){
    chart.setAttribute('aria-label','Insufficient completed candles to display');
    return;
  }
  const closes=valid.map(x=>x.close);
  const low=Math.min(...closes),high=Math.max(...closes);
  const pad=high===low?Math.max(high*0.005,0.01):(high-low)*0.08;
  const min=low-pad,max=high+pad;
  const margin=30,w=760-2*margin,h=250-2*margin;
  for(let i=0;i<4;i++){
    const y=margin+i*h/3;
    const grid=document.createElementNS(ns,'line');
    grid.setAttribute('x1',String(margin));
    grid.setAttribute('x2',String(margin+w));
    grid.setAttribute('y1',String(y));
    grid.setAttribute('y2',String(y));
    grid.setAttribute('stroke','#24404a');
    grid.setAttribute('stroke-width','1');
    chart.append(grid);
  }
  const line=document.createElementNS(ns,'polyline');
  line.setAttribute('fill','none');
  line.setAttribute('stroke','#6de4d4');
  line.setAttribute('stroke-width','3');
  line.setAttribute('stroke-linejoin','round');
  line.setAttribute('stroke-linecap','round');
  line.setAttribute('points',closes.map((v,i)=>
    (margin+(i/(closes.length-1))*w).toFixed(1)+','+
    (margin+(1-(v-min)/(max-min))*h).toFixed(1)).join(' '));
  chart.append(line);
  chart.setAttribute('aria-label',valid.length+
    ' completed historical crypto spot closing prices from '+valid[0].startUtc+
    ' to '+valid.at(-1).startUtc+' UTC');
}
async function inspectPublicCandles(event){
  event.preventDefault();
  const button=$('crypto-inspect');
  if(button.disabled)return;
  const pair=$('crypto-pair').value,interval=$('crypto-interval').value;
  button.disabled=true;
  set('crypto-status','Inspecting permitted public exchange candles…');
  try{
    const query=new URLSearchParams({pair,interval});
    const response=await fetch('/api/crypto/public-ohlc?'+query.toString(),{
      method:'GET',headers:{Accept:'application/json'},cache:'no-store'
    });
    const report=await response.json();
    if(!response.ok)throw new Error(report?.error||'The public source is unavailable');
    set('crypto-venue',report.venue+' · '+report.pair);
    set('crypto-count',report.completedCount);
    set('crypto-excluded',report.incompleteCandlesExcluded);
    set('crypto-gaps',report.missingIntervals);
    set('crypto-close',money(report.chartCandles?.at(-1)?.close));
    set('crypto-retrieved',report.retrievedAt);
    set('crypto-quality',report.status);
    set('crypto-reasons',report.reviewReasons?.length?
      'Review required: '+report.reviewReasons.join(', '):
      'No structural flags detected. Source authenticity, data rights, and price executability are still NOT verified.');
    set('crypto-status','Inspection complete — '+report.completedCount+
      ' completed, venue-specific historical candles. No trading actions performed.');
    set('crypto-chart-caption','Kraken '+report.pair+' · '+report.intervalMinutes+
      '-minute completed candles · UTC · raw venue prices. This is historical context, NOT a current executable quote.');
    renderClosedCandles(report.chartCandles);
  }catch(error){
    set('crypto-status','Inspection unavailable: '+error.message);
    set('crypto-quality','SOURCE UNAVAILABLE');
    set('crypto-reasons','No quote accepted. The rest of StarNet remains unchanged.');
    chart.replaceChildren();
    chart.setAttribute('aria-label','No validated public source candle data');
  }finally{button.disabled=false;}
}
$('crypto-form').addEventListener('submit',inspectPublicCandles);
