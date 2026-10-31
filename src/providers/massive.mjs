import {normalizeMarketDataset,CURRENT_MARKET_DATA_SCHEMA,isStrictISODate} from '../market-intelligence.mjs';

const BASE_URL='https://api.massive.com';
// Massive's US stock daily aggregate timestamp is midnight America/New_York,
// not midnight UTC. The UTC instant shifts between 04:00 and 05:00 with DST.
// Validate the provider's exchange-local day boundary before deriving a date.
const EXCHANGE_DAY=new Intl.DateTimeFormat('en-US',{
  timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
});
function stockDailyDate(instant){
  const parts=Object.fromEntries(EXCHANGE_DAY.formatToParts(instant)
    .filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  if(parts.hour!=='00'||parts.minute!=='00'||parts.second!=='00'||
     instant.getUTCMilliseconds()!==0)return null;
  return parts.year+'-'+parts.month+'-'+parts.day;
}
function normalizedSymbol(value){
  const symbol=String(value||'').trim().toUpperCase();
  if(!/^[A-Z0-9.\-]{1,15}$/.test(symbol))throw new Error('Invalid Massive stock symbol');
  return symbol;
}
function dateRange(from,to){
  if(!isStrictISODate(from)||!isStrictISODate(to)||from>to)throw new Error('Invalid Massive date range');
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
  if(!response||!response.ok){
    const status=response?.status??'unknown';
    const guidance=status===401?' (key rejected: run npm run setup:market)':
      status===403?' (Stocks historical-data entitlement unavailable)':
      status===429?' (rate limit reached: wait before refreshing)':'';
    throw new Error('Massive market-data request failed with status '+status+guidance);
  }
  let payload;
  try{payload=await response.json();}catch{throw new Error('Massive returned invalid JSON');}
  if(!payload||payload.status!=='OK'||!Array.isArray(payload.results))throw new Error('Massive returned an invalid aggregate response');
  // A successful HTTP response does not establish that the data is for the requested symbol.
  // Never attribute another instrument's prices to this research watchlist entry.
  if(payload.ticker!==ticker)throw new Error('Massive aggregate ticker does not match the requested symbol');
  const bars=payload.results.map((item,index)=>{
    // Fail closed on missing, coerced, noninteger or silently rounded provider
    // fields. Null/missing volume must never masquerade as a real zero-volume
    // session, and JSON string prices must not become trusted observations.
    const malformed=()=>new Error('Massive aggregate '+index+' is malformed');
    if(!item||typeof item!=='object'||Array.isArray(item)||
       !Number.isSafeInteger(item.t)||item.t<0||
       (!Number.isFinite(item.v)||item.v<0||item.v>Number.MAX_SAFE_INTEGER)||
       !['o','h','l','c'].every(key=>typeof item[key]==='number'&&Number.isFinite(item[key])&&item[key]>0))
      throw malformed();
    const instant=new Date(item.t);
    const marketDate=Number.isFinite(instant.getTime())?stockDailyDate(instant):null;
    if(!marketDate)throw malformed();
    const bar={
      date:marketDate,
      open:item.o,high:item.h,low:item.l,close:item.c,volume:item.v
    };
    if(bar.date<from||bar.date>to)
      throw new Error('Massive aggregate '+index+' falls outside the requested date range');
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
