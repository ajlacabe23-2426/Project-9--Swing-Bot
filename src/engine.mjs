/**
 * Synthetic-only educational research simulator. No market-data provider, broker
 * integration, order-placement API, investment guidance or future-bar access.
 */
export const VERSION=1;
export const INITIAL_CASH=10_000;
export const START_CURSOR=29;
export const MAX_WEIGHT=0.25;
export const TARGET_WEIGHT=0.10;
export const SLIPPAGE=0.0005;
export const FEE_RATE=0.001;
export const MIN_FEE=0.50;
const round=(n,p=6)=>Number(n.toFixed(p));
function rng(seed){let x=seed>>>0;return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
export function generateScenario(seed=73,length=190){
  if(!Number.isSafeInteger(seed)||seed<1||seed>1_000_000||!Number.isInteger(length)||length<50||length>1000)throw new Error('Invalid scenario parameters');
  const random=rng(seed),bars=[];let previous=100;const date=new Date('2024-01-01T00:00:00.000Z');
  while(bars.length<length){
    date.setUTCDate(date.getUTCDate()+1);
    if([0,6].includes(date.getUTCDay()))continue;
    const t=bars.length,regime=t<55?0.003:t<104?-0.0035:t<144?0.0015:-0.0008,cycle=0.006*Math.sin(t/5.3);
    const open=previous*(1+(random()-0.5)*0.009);
    const close=Math.max(10,open*(1+regime+cycle+(random()-0.5)*0.024));
    const high=Math.max(open,close)*(1+0.002+random()*0.009),low=Math.min(open,close)*(1-0.002-random()*0.009);
    bars.push({date:date.toISOString().slice(0,10),open:round(open),high:round(high),low:round(low),close:round(close),volume:Math.round(90000+random()*110000)});
    previous=close;
  }return bars;
}
export function sma(bars,end,period){
  if(!Number.isInteger(end)||!Number.isInteger(period)||period<=0||end+1<period||end>=bars.length)return null;
  let sum=0;for(let i=end-period+1;i<=end;i++)sum+=bars[i].close;return round(sum/period);
}
export function rsi(bars,end,period=14){
  if(end<period||end>=bars.length)return null;
  let gains=0,losses=0;for(let i=end-period+1;i<=end;i++){const change=bars[i].close-bars[i-1].close;gains+=Math.max(0,change);losses+=Math.max(0,-change);}
  if(losses===0)return gains===0?50:100;return round(100-100/(1+gains/losses),2);
}
export function indicators(bars,asOf){return {fast:sma(bars,asOf,5),slow:sma(bars,asOf,20),rsi:rsi(bars,asOf),close:bars[asOf].close,date:bars[asOf].date};}
export function signalAt(bars,asOf){
  if(asOf<20||asOf>=bars.length)return null;
  const prior=indicators(bars,asOf-1),now=indicators(bars,asOf);
  if(prior.fast===null||prior.slow===null||now.fast===null||now.slow===null)return null;
  if(prior.fast<=prior.slow&&now.fast>now.slow)return 'ENTER';
  if(prior.fast>=prior.slow&&now.fast<now.slow)return 'EXIT';
  return null;
}
export function initialState(seed=73){
  const bars=generateScenario(seed,50);
  return {version:VERSION,seed,cursor:START_CURSOR,cash:INITIAL_CASH,quantity:0,pending:null,trades:[],events:[],equity:[{date:bars[START_CURSOR].date,value:INITIAL_CASH}]};
}
export function equity(state,bar){return round(state.cash+state.quantity*bar.close,2);}
function event(state,date,kind,message){state.events.push({id:state.events.length+1,date,kind,message});}
export function step(state,bars=generateScenario(state.seed)){
  if(state.cursor>=bars.length-1)return {state,finished:true};
  const s=structuredClone(state),nextIndex=s.cursor+1,current=bars[nextIndex];
  if(s.pending){
    const order=s.pending;s.pending=null;
    const fillPrice=current.open*(order.side==='ENTER'?1+SLIPPAGE:1-SLIPPAGE);
    if(order.side==='ENTER'&&s.quantity===0){
      const nav=s.cash,notionalLimit=Math.min(nav*TARGET_WEIGHT,nav*MAX_WEIGHT,s.cash*0.95);
      const feeEstimate=Math.max(MIN_FEE,notionalLimit*FEE_RATE);
      const quantity=Math.floor(((notionalLimit-feeEstimate)/fillPrice)*1000)/1000;
      const notional=quantity*fillPrice,fee=Math.max(MIN_FEE,notional*FEE_RATE);
      if(quantity>0&&notional+fee<=s.cash&&notional/nav<=MAX_WEIGHT){
        s.cash=round(s.cash-notional-fee);s.quantity=round(quantity);
        s.trades.push({side:'PAPER_BUY',signalDate:order.signalDate,fillDate:current.date,quantity:round(quantity),price:round(fillPrice),fee:round(fee,2),cashAfter:round(s.cash,2)});
        event(s,current.date,'FILL','Hypothetical entry filled at the next synthetic session open, including modeled fees and slippage.');
      }else event(s,current.date,'BLOCK','Simulation exposure rule blocked an entry.');
    }else if(order.side==='EXIT'&&s.quantity>0){
      const quantity=s.quantity,notional=quantity*fillPrice,fee=Math.max(MIN_FEE,notional*FEE_RATE);
      s.cash=round(s.cash+notional-fee);s.quantity=0;
      s.trades.push({side:'PAPER_SELL',signalDate:order.signalDate,fillDate:current.date,quantity:round(quantity),price:round(fillPrice),fee:round(fee,2),cashAfter:round(s.cash,2)});
      event(s,current.date,'FILL','Hypothetical exit filled at the next synthetic session open, including modeled fees and slippage.');
    }
  }
  s.cursor=nextIndex;const signal=signalAt(bars,s.cursor);
  if(signal&&((signal==='ENTER'&&s.quantity===0)||(signal==='EXIT'&&s.quantity>0))){
    s.pending={side:signal,signalDate:current.date};
    event(s,current.date,'SIGNAL','Hypothetical '+signal.toLowerCase()+' condition observed after close; queued for the next synthetic open.');
  }
  s.equity.push({date:current.date,value:equity(s,current)});
  return {state:s,finished:nextIndex===bars.length-1};
}
export function run(state,count=20,bars=generateScenario(state.seed)){
  if(!Number.isInteger(count)||count<1||count>60)throw new Error('Run length must be 1–60');
  let result={state,finished:false};for(let i=0;i<count;i++){result=step(result.state,bars);if(result.finished)break;}return result;
}
export function maxDrawdown(points){
  let high=INITIAL_CASH,worst=0;for(const point of points){high=Math.max(high,point.value);worst=Math.min(worst,point.value/high-1);}return round(worst*100,2);
}
export function report(state,bars=generateScenario(state.seed)){
  const asOf=state.cursor,visibleBars=bars.slice(0,asOf+1),now=indicators(bars,asOf),prior=indicators(bars,asOf-1),signal=signalAt(bars,asOf);
  const value=equity(state,bars[asOf]),benchmark=round(INITIAL_CASH*now.close/bars[START_CURSOR].close,2),last=state.events.at(-1);
  const evidence=[
    {label:'Simulated closing price',value:now.close.toFixed(2),source:'Synthetic candle '+now.date},
    {label:'5-bar moving average',value:now.fast?.toFixed(2)??'Unavailable',source:'Synthetic closes, last 5 completed bars'},
    {label:'20-bar moving average',value:now.slow?.toFixed(2)??'Unavailable',source:'Synthetic closes, last 20 completed bars'},
    {label:'14-bar relative strength index',value:now.rsi?.toFixed(2)??'Unavailable',source:'Synthetic closes, last 14 changes'}
  ];
  const interpretation={engine:'DETERMINISTIC_EXPLANATION_NOT_GENERATIVE_AI',
    headline:now.fast>now.slow?'Short average above long average':'Short average at or below long average',
    observed:'On synthetic session '+now.date+', the 5-bar mean is '+now.fast?.toFixed(2)+', compared with the 20-bar mean '+now.slow?.toFixed(2)+'.',
    hypothesis:signal==='ENTER'?'A crossover condition was observed at the close; a hypothetical entry is queued for the next synthetic open.':signal==='EXIT'?'A crossover condition was observed at the close; a hypothetical exit is queued for the next synthetic open.':'The configured crossover rule did not change state on this completed bar.',
    counterevidence:'The prior completed bar had 5-bar and 20-bar means of '+prior.fast?.toFixed(2)+' and '+prior.slow?.toFixed(2)+'. Averages lag observed prices and do not predict the next session.',
    uncertainty:'Synthetic generated data, no real-market validation. Simulated fills and costs omit many actual market conditions.',
    lastEvent:last?last.message:'No hypothetical order has been queued yet.',evidence};
  return {mode:'SYNTHETIC_ONLY',environment:'LOCAL_PAPER_ONLY',market:'SIM-01 · generated hypothetical instrument',
    seed:state.seed,cursor:state.cursor,totalBars:bars.length,date:now.date,
    bars:visibleBars.slice(-85).map((bar,i)=>({...bar,ma5:sma(visibleBars,visibleBars.length-Math.min(85,visibleBars.length)+i,5),ma20:sma(visibleBars,visibleBars.length-Math.min(85,visibleBars.length)+i,20)})),
    cash:round(state.cash,2),quantity:state.quantity,portfolioValue:value,pnl:round(value-INITIAL_CASH,2),
    returnPct:round((value/INITIAL_CASH-1)*100,2),benchmarkValue:benchmark,benchmarkPct:round((benchmark/INITIAL_CASH-1)*100,2),
    peakDrawdownPct:maxDrawdown(state.equity),pending:state.pending,trades:state.trades,events:state.events.slice(-12),
    equity:state.equity,signal,interpretation,safeguards:{maxWeight:MAX_WEIGHT,targetWeight:TARGET_WEIGHT,modelFeeRate:FEE_RATE,modelSlippage:SLIPPAGE,noBroker:true}};
}
export function historicalExperiment(seed=73){
  const bars=generateScenario(seed);
  const one=run(initialState(seed),60,bars),two=run(one.state,60,bars),three=run(two.state,60,bars);
  const final=run(three.state,60,bars).state,summary=report(final,bars);
  return {seed,strategy:'5/20 crossover, next-open simulation',start:bars[START_CURSOR].date,end:summary.date,
    simulatedReturnPct:summary.returnPct,benchmarkPct:summary.benchmarkPct,peakDrawdownPct:summary.peakDrawdownPct,
    tradeCount:final.trades.length,caveat:'In-sample demonstration using generated, not historical market data. Not predictive or indicative of attainable real returns.'};
}
