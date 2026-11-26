import {normalizeMarketDataset,CURRENT_MARKET_DATA_SCHEMA,isStrictISODate} from '../market-intelligence.mjs';

const BASE_URL='https://api.massive.com';
const exchangeTimestamp=new Intl.DateTimeFormat('sv-SE',{
  timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
});
function normalizedSymbol(value){
  const symbol=String(value||'').trim().toUpperCase();
  if(!/^[A-Z0-9.\-]{1,15}$/.test(symbol))throw new Error('Invalid Massive stock symbol');
  return symbol;
}
function dateRange(from,to){
  if(!isStrictISODate(from)||!isStrictISODate(to)||from>to)throw new Error('Invalid Massive date range');
  return {from,to};
}

export function buildMassiveDailyUrl({symbol,from,to}){
  const ticker=normalizedSymbol(symbol),range=dateRange(from,to);
  const url=new URL(BASE_URL+'/v2/aggs/ticker/'+encodeURIComponent(ticker)+'/range/1/day/'+range.from+'/'+range.to);
  url.searchParams.set('adjusted','true');
  url.searchParams.set('sort','asc');
  url.searchParams.set('limit','5000');
  return url;
}

export async function fetchMassiveDailyDataset({symbol,from,to,apiKey,fetchImpl=globalThis.fetch}){
  if(typeof fetchImpl!=='function')throw new Error('A fetch implementation is required');
  if(typeof apiKey!=='string'||apiKey.trim().length<8)throw new Error('Massive API key is required');
  const ticker=normalizedSymbol(symbol),url=buildMassiveDailyUrl({symbol:ticker,from,to});
  let response;
  try{
    // Massive supports a Bearer header. Never place a secret in a URL: URLs may
    // be retained by tools, proxies, client diagnostics and request logs.
    response=await fetchImpl(url,{headers:{Accept:'application/json',Authorization:'Bearer '+apiKey.trim()},redirect:'error'});
  }catch{
    throw new Error('Massive market-data request failed');
  }
  if(!response||!response.ok)throw new Error('Massive market-data request failed with status '+(response?.status??'unknown'));
  let payload;
  try{payload=await response.json();}catch{throw new Error('Massive returned invalid JSON');}
  if(!payload||!['OK','DELAYED'].includes(payload.status)||!Array.isArray(payload.results))throw new Error('Massive returned an invalid aggregate response');
  // A successful HTTP response does not establish that the data is for the requested symbol.
  // Never attribute another instrument's prices to this research watchlist entry.
  if(payload.ticker!==ticker)throw new Error('Massive aggregate ticker does not match the requested symbol');
  // A range response containing a pointer to additional records is incomplete
  // until independently reconciled. Never treat a truncated snapshot as history.
  if(payload.next_url)throw new Error('Massive daily response was paginated; refusing incomplete research history');
  if(payload.resultsCount!==undefined&&(!Number.isSafeInteger(payload.resultsCount)||
     payload.resultsCount!==payload.results.length))
    throw new Error('Massive daily response count is inconsistent');
  const bars=payload.results.map((item,index)=>{
    // Preserve fractional share volume without coercing missing or string values.
    const malformed=()=>new Error('Massive aggregate '+index+' is malformed');
    if(!item||typeof item!=='object'||Array.isArray(item)||
       !Number.isSafeInteger(item.t)||item.t<0||
       !Number.isFinite(item.v)||item.v<0||item.v>Number.MAX_SAFE_INTEGER||
       !['o','h','l','c'].every(key=>typeof item[key]==='number'&&Number.isFinite(item[key])&&item[key]>0))
      throw malformed();
    const instant=new Date(item.t);
    if(!Number.isFinite(instant.getTime())||instant.getUTCMilliseconds()!==0)
      throw malformed();
    const [date,localTime]=exchangeTimestamp.format(instant).split(' ');
    if(localTime!=='00:00:00')throw malformed();
    const bar={
      date,
      open:item.o,high:item.h,low:item.l,close:item.c,volume:item.v
    };
    if(bar.date<from||bar.date>to)
      throw new Error('Massive aggregate '+index+' falls outside the requested date range');
    return bar;
  });
  if(bars.length<60)throw new Error('Massive response needs at least 60 completed daily bars for swing analysis');
  const candidate={
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
  };
  // Validating may add internal provenance.contract for the research report.
  // Do not persist that internal field into source JSON: downstream scanners
  // revalidate and reject fields outside the canonical v2 input contract.
  normalizeMarketDataset(candidate);
  return candidate;
}
