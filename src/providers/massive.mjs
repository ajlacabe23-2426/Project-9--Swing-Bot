import {normalizeMarketDataset,CURRENT_MARKET_DATA_SCHEMA} from '../market-intelligence.mjs';

const BASE_URL='https://api.massive.com';
const isoDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
  Number.isFinite(Date.parse(value+'T00:00:00.000Z'));

function normalizedSymbol(value){
  const symbol=String(value||'').trim().toUpperCase();
  if(!/^[A-Z0-9.\-]{1,15}$/.test(symbol))throw new Error('Invalid Massive stock symbol');
  return symbol;
}
function dateRange(from,to){
  if(!isoDate(from)||!isoDate(to)||from>to)throw new Error('Invalid Massive date range');
  return {from,to};
}

export function buildMassiveDailyUrl({symbol,from,to,apiKey}){
  const ticker=normalizedSymbol(symbol),range=dateRange(from,to);
  if(typeof apiKey!=='string'||apiKey.trim().length<8)throw new Error('Massive API key is required');
  const url=new URL(BASE_URL+'/v2/aggs/ticker/'+encodeURIComponent(ticker)+'/range/1/day/'+range.from+'/'+range.to);
  url.searchParams.set('adjusted','true');
  url.searchParams.set('sort','asc');
  url.searchParams.set('limit','5000');
  url.searchParams.set('apiKey',apiKey.trim());
  return url;
}

export async function fetchMassiveDailyDataset({symbol,from,to,apiKey,fetchImpl=globalThis.fetch}){
  if(typeof fetchImpl!=='function')throw new Error('A fetch implementation is required');
  const ticker=normalizedSymbol(symbol),url=buildMassiveDailyUrl({symbol:ticker,from,to,apiKey});
  let response;
  try{
    response=await fetchImpl(url,{headers:{Accept:'application/json'}});
  }catch{
    throw new Error('Massive market-data request failed');
  }
  if(!response||!response.ok)throw new Error('Massive market-data request failed with status '+(response?.status??'unknown'));
  let payload;
  try{payload=await response.json();}catch{throw new Error('Massive returned invalid JSON');}
  if(!payload||payload.status!=='OK'||!Array.isArray(payload.results))throw new Error('Massive returned an invalid aggregate response');
  const bars=payload.results.map((item,index)=>{
    const timestamp=Number(item.t),volume=Number(item.v);
    const bar={
      date:Number.isFinite(timestamp)?new Date(timestamp).toISOString().slice(0,10):'',
      open:Number(item.o),high:Number(item.h),low:Number(item.l),close:Number(item.c),
      volume:Number.isFinite(volume)?Math.round(volume):NaN
    };
    if(!bar.date||![bar.open,bar.high,bar.low,bar.close].every(Number.isFinite)||!Number.isSafeInteger(bar.volume))
      throw new Error('Massive aggregate '+index+' is malformed');
    return bar;
  });
  if(bars.length<60)throw new Error('Massive response needs at least 60 completed daily bars for swing analysis');
  return normalizeMarketDataset({
    schema:CURRENT_MARKET_DATA_SCHEMA,
    symbol:ticker,
    currency:'USD',
    source:'Massive Stocks adjusted daily aggregates',
    mode:'HISTORICAL',
    sourceAsOf:bars.at(-1).date,
    priceAdjustment:'VENDOR_ADJUSTED',
    provenance:{
      retrievedAt:new Date().toISOString(),
      adjustmentMethod:'PROVIDER_ADJUSTED_UNVERIFIED',
      corporateActions:'PROVIDER_ADJUSTED_NOT_INDEPENDENTLY_VERIFIED',
      survivorship:'NOT_ASSESSED',
      licensing:'PROVIDER_TERMS_REVIEW_REQUIRED'
    },
    bars
  });
}
