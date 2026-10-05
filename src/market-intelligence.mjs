import {rsi,sma} from './engine.mjs';

export const MARKET_DATA_SCHEMA='project9-market-data-v1';
export const MARKET_DATA_MODES=new Set(['HISTORICAL','DELAYED','REALTIME']);
export const PRICE_ADJUSTMENTS=new Set(['RAW','VENDOR_ADJUSTED','UNKNOWN']);

const round=(value,places=4)=>Number(value.toFixed(places));
const isObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
const isoDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
  Number.isFinite(Date.parse(value+'T00:00:00.000Z'));

function validateBar(bar,index,previousDate){
  if(!isObject(bar))throw new Error('Market bar '+index+' must be an object');
  const keys=['date','open','high','low','close','volume'];
  if(Object.keys(bar).some(key=>!keys.includes(key))||keys.some(key=>!(key in bar)))
    throw new Error('Market bar '+index+' has invalid fields');
  if(!isoDate(bar.date))throw new Error('Market bar '+index+' has invalid date');
  if(previousDate&&bar.date<=previousDate)throw new Error('Market bars must be unique and strictly ascending');
  for(const key of ['open','high','low','close']){
    if(!Number.isFinite(bar[key])||bar[key]<=0)throw new Error('Market bar '+index+' has invalid '+key);
  }
  if(!Number.isSafeInteger(bar.volume)||bar.volume<0)throw new Error('Market bar '+index+' has invalid volume');
  if(bar.high<Math.max(bar.open,bar.close)||bar.low>Math.min(bar.open,bar.close)||bar.low>bar.high)
    throw new Error('Market bar '+index+' has inconsistent OHLC values');
  return {date:bar.date,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume};
}

export function normalizeMarketDataset(input){
  if(!isObject(input))throw new Error('Market dataset must be an object');
  const allowed=['schema','symbol','currency','source','mode','sourceAsOf','priceAdjustment','bars'];
  if(Object.keys(input).some(key=>!allowed.includes(key)))throw new Error('Market dataset has unsupported fields');
  if(input.schema!==MARKET_DATA_SCHEMA)throw new Error('Unsupported market-data schema');
  if(typeof input.symbol!=='string'||!/^[A-Z0-9.\-]{1,15}$/.test(input.symbol))throw new Error('Invalid market symbol');
  if(typeof input.currency!=='string'||!/^[A-Z]{3}$/.test(input.currency))throw new Error('Invalid market currency');
  if(typeof input.source!=='string'||input.source.trim().length<2||input.source.trim().length>100)throw new Error('Invalid market-data source');
  if(!MARKET_DATA_MODES.has(input.mode))throw new Error('Invalid market-data mode');
  if(!isoDate(input.sourceAsOf))throw new Error('Invalid source as-of date');
  if(!PRICE_ADJUSTMENTS.has(input.priceAdjustment))throw new Error('Invalid price-adjustment declaration');
  if(!Array.isArray(input.bars)||input.bars.length<60||input.bars.length>3000)
    throw new Error('Market dataset requires 60–3000 completed daily bars');
  let previous=null;
  const bars=input.bars.map((bar,index)=>{const normalized=validateBar(bar,index,previous);previous=normalized.date;return normalized;});
  if(input.sourceAsOf<bars.at(-1).date)throw new Error('Source as-of date cannot precede the latest market bar');
  return {
    schema:MARKET_DATA_SCHEMA,
    symbol:input.symbol,
    currency:input.currency,
    source:input.source.trim(),
    mode:input.mode,
    sourceAsOf:input.sourceAsOf,
    priceAdjustment:input.priceAdjustment,
    bars
  };
}

export function atr(bars,end,period=14){
  if(!Array.isArray(bars)||!Number.isInteger(end)||!Number.isInteger(period)||period<2||end<period||end>=bars.length)return null;
  let total=0;
  for(let index=end-period+1;index<=end;index++){
    const bar=bars[index],previousClose=bars[index-1].close;
    total+=Math.max(bar.high-bar.low,Math.abs(bar.high-previousClose),Math.abs(bar.low-previousClose));
  }
  return round(total/period,6);
}

function average(values){
  if(!values.length)return null;
  return values.reduce((sum,value)=>sum+value,0)/values.length;
}

export function evaluateSwingSetup(input,{asOfIndex=null,paperCapital=10_000,paperRiskFraction=0.01}={}){
  const dataset=normalizeMarketDataset(input),bars=dataset.bars;
  const end=asOfIndex===null?bars.length-1:asOfIndex;
  if(!Number.isInteger(end)||end<50||end>=bars.length)throw new Error('Swing evaluation requires at least 51 completed bars');
  if(!Number.isFinite(paperCapital)||paperCapital<=0||paperCapital>10_000_000)throw new Error('Invalid paper capital');
  if(!Number.isFinite(paperRiskFraction)||paperRiskFraction<=0||paperRiskFraction>0.05)throw new Error('Invalid paper risk fraction');

  const current=bars[end],fast=sma(bars,end,20),slow=sma(bars,end,50),momentum=rsi(bars,end,14),range=atr(bars,end,14);
  const previous20=bars.slice(end-20,end);
  const priorHigh=Math.max(...previous20.map(bar=>bar.high));
  const averageVolume=average(previous20.map(bar=>bar.volume));
  const relativeVolume=averageVolume>0?current.volume/averageVolume:null;

  const checks={
    above20:current.close>fast,
    trendAligned:fast>slow,
    constructiveMomentum:momentum>=50&&momentum<=72,
    breakout:current.close>priorHigh,
    volumeConfirmation:relativeVolume!==null&&relativeVolume>=1.2
  };
  const weights={above20:20,trendAligned:25,constructiveMomentum:20,breakout:25,volumeConfirmation:10};
  const score=Object.entries(checks).reduce((sum,[key,passed])=>sum+(passed?weights[key]:0),0);
  const classification=score>=80?'PAPER_SETUP_STRONG':score>=60?'PAPER_SETUP_WATCH':'NO_PAPER_SETUP';

  const riskPerUnit=range===null?null:range*2;
  const paperRiskBudget=paperCapital*paperRiskFraction;
  const paperUnits=riskPerUnit&&riskPerUnit>0?Math.floor((paperRiskBudget/riskPerUnit)*1000)/1000:0;
  const entryReference=current.close;
  const stopReference=riskPerUnit?Math.max(0.01,entryReference-riskPerUnit):null;
  const targetReference=riskPerUnit?entryReference+riskPerUnit*2:null;

  return {
    schema:'project9-swing-evaluation-v1',
    symbol:dataset.symbol,
    asOf:current.date,
    source:{name:dataset.source,mode:dataset.mode,sourceAsOf:dataset.sourceAsOf,priceAdjustment:dataset.priceAdjustment},
    observed:{
      close:round(current.close,6),
      sma20:round(fast,6),
      sma50:round(slow,6),
      rsi14:round(momentum,2),
      atr14:range,
      prior20High:round(priorHigh,6),
      relativeVolume:relativeVolume===null?null:round(relativeVolume,3)
    },
    checks,
    score,
    classification,
    paperRiskPlan:{
      basis:'HYPOTHETICAL_ATR_REFERENCE_ONLY',
      paperCapital:round(paperCapital,2),
      paperRiskFraction,
      paperRiskBudget:round(paperRiskBudget,2),
      entryReference:round(entryReference,6),
      stopReference:stopReference===null?null:round(stopReference,6),
      targetReference:targetReference===null?null:round(targetReference,6),
      riskPerUnit:riskPerUnit===null?null:round(riskPerUnit,6),
      maxPaperUnits:paperUnits
    },
    evidence:[
      {label:'Completed close',value:round(current.close,6),date:current.date},
      {label:'20-session mean',value:round(fast,6),date:current.date},
      {label:'50-session mean',value:round(slow,6),date:current.date},
      {label:'14-session RSI',value:round(momentum,2),date:current.date},
      {label:'14-session ATR',value:range,date:current.date}
    ],
    safety:{
      resultType:'RESEARCH_DECISION_SUPPORT',
      realOrders:false,
      brokerageConnected:false,
      executionAllowed:false,
      investmentRecommendation:false,
      futureBarsUsed:false
    }
  };
}

export function rankWatchlist(inputs,options={}){
  if(!Array.isArray(inputs)||inputs.length<1||inputs.length>100)throw new Error('Watchlist requires 1–100 market datasets');
  const results=inputs.map(input=>evaluateSwingSetup(input,options));
  const symbols=new Set();
  for(const result of results){
    if(symbols.has(result.symbol))throw new Error('Watchlist symbols must be unique');
    symbols.add(result.symbol);
  }
  return results.sort((a,b)=>b.score-a.score||a.symbol.localeCompare(b.symbol));
}
