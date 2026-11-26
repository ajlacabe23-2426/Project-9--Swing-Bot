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


async function inspectPublicQuote(){
  const button=$('crypto-quote-inspect');
  if(button.disabled)return;
  button.disabled=true;
  set('crypto-quote-status','Requesting one public venue observation…');
  try{
    const query=new URLSearchParams({pair:$('crypto-pair').value});
    const response=await fetch('/api/crypto/public-ticker?'+query,{
      method:'GET',headers:{Accept:'application/json'},cache:'no-store'
    });
    const report=await response.json();
    if(!response.ok)throw new Error(report?.error||'Public quote unavailable');
    if(report.status!=='RECENT_BY_REPORTED_TIMESTAMPS_ONLY'||
       report.feedCoverage!=='SINGLE_EXCHANGE_ONLY')
      throw new Error('Source validation incomplete');
    set('crypto-quote-bid',money(report.bid));
    set('crypto-quote-ask',money(report.ask));
    set('crypto-quote-last',money(report.last));
    set('crypto-quote-status','Kraken '+report.pair+' — exchange-local public view, NOT confirmed executable');
    set('crypto-quote-evidence','Exchange timestamp: '+report.exchangeTimestamp+
      ' · receipt: '+report.receivedAt+' · reported age: '+
      report.quoteAgeMs+' ms. No independent authentication, trading, or orders.');
  }catch(error){
    for(const id of ['crypto-quote-bid','crypto-quote-ask','crypto-quote-last'])set(id,'—');
    set('crypto-quote-status','No current public quote accepted: '+error.message);
    set('crypto-quote-evidence','The source is unavailable, stale, or rate-limited. No previous price is silently reused. No orders possible.');
  }finally{button.disabled=false;}
}
$('crypto-quote-inspect').addEventListener('click',inspectPublicQuote);
$('crypto-pair').addEventListener('change',()=>{
  for(const id of ['crypto-quote-bid','crypto-quote-ask','crypto-quote-last'])set(id,'—');
  set('crypto-quote-status','Pair changed. Inspect to obtain a new source observation.');
  set('crypto-quote-evidence','Previously viewed quotes are cleared when selecting another market.');
});
