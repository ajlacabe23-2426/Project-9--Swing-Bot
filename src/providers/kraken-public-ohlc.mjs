/**
 * Kraken public REST OHLC source — isolated, read-only crypto research evidence.
 * Separate from stock research, paper ledgers and order logic.
 * Docs: https://docs.kraken.com/api-reference/market-data/get-ohlc-data
 */
const PAIRS=Object.freeze({'BTC/USD':'XBTUSD','ETH/USD':'ETHUSD'});
const INTERVALS=new Set([1,5,15,30,60,240,1440]);
const RETURN_KEYS=Object.freeze({'BTC/USD':new Set(['XXBTZUSD','XBTUSD']),'ETH/USD':new Set(['XETHZUSD','ETHUSD'])});
const NUMERIC=/^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const canonicalUtc=x=>typeof x==='string'&&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)&&
  Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const decimal=x=>typeof x==='string'&&NUMERIC.test(x)&&Number.isFinite(Number(x));

export function buildKrakenPublicOHLCUrl({pair='BTC/USD',intervalMinutes=60}={}){
  if(!Object.hasOwn(PAIRS,pair))throw new TypeError('Unsupported public crypto spot pair');
  if(!INTERVALS.has(intervalMinutes))throw new TypeError('Unsupported public crypto candle interval');
  const url=new URL('https://api.kraken.com/0/public/OHLC');
  url.searchParams.set('pair',PAIRS[pair]);
  url.searchParams.set('interval',String(intervalMinutes));
  return url;
}

/**
 * Kraken contract: final OHLC row is an unfinished current candle
 * regardless of observer clock. Up to 720 recent rows, even with since.
 */
export function inspectKrakenPublicOHLC(payload,{pair='BTC/USD',intervalMinutes=60,retrievedAt}={}){
  buildKrakenPublicOHLCUrl({pair,intervalMinutes});
  if(!canonicalUtc(retrievedAt))throw new TypeError('Canonical UTC retrieval timestamp required');
  if(!obj(payload)||!Array.isArray(payload.error)||payload.error.length!==0||!obj(payload.result))
    throw new TypeError('Invalid or rejected Kraken public OHLC response');
  const keys=Object.keys(payload.result).filter(key=>key!=='last');
  if(keys.length!==1||!RETURN_KEYS[pair].has(keys[0])||!Number.isSafeInteger(payload.result.last)||payload.result.last<0)
    throw new TypeError('Kraken OHLC response must have one venue pair and cursor');
  const rows=payload.result[keys[0]];
  if(!Array.isArray(rows)||rows.length<2||rows.length>720)
    throw new TypeError('Kraken returned invalid or unsupported OHLC row count');
  const intervalSeconds=intervalMinutes*60;
  let previous=null;
  const parsed=rows.map((row,index)=>{
    if(!Array.isArray(row)||row.length!==8||
       !Number.isSafeInteger(row[0])||row[0]<0||row[0]%intervalSeconds!==0||
       !row.slice(1,7).every(decimal)||!Number.isSafeInteger(row[7])||row[7]<0)
      throw new TypeError('Invalid Kraken OHLC record at position '+index);
    const [start,open,high,low,close,vwap,volume,trades]=row;
    if(previous!==null&&start<=previous)
      throw new TypeError('Kraken OHLC records must be unique and ascending');
    previous=start;
    const [o,h,l,c,v,qty]=[open,high,low,close,vwap,volume].map(Number);
    if(![o,h,l,c,v].every(x=>x>0)||qty<0||h<Math.max(o,c)||l>Math.min(o,c)||l>h||v<l||v>h)
      throw new TypeError('Inconsistent Kraken OHLC values at position '+index);
    if(start*1000>Date.parse(retrievedAt)+1000)
      throw new TypeError('Kraken OHLC record starts after retrieval');
    return {startUtc:new Date(start*1000).toISOString(),startUnixSeconds:start,
      open:o,high:h,low:l,close:c,vwap:v,volumeBaseUnits:qty,trades};
  });
  const unfinished=parsed.at(-1);
  const candles=parsed.slice(0,-1);
  let gaps=0,missingIntervals=0,largestGapIntervals=0;
  for(let i=1;i<candles.length;i++){
    const diff=candles[i].startUnixSeconds-candles[i-1].startUnixSeconds;
    if(diff%intervalSeconds!==0)throw new TypeError('Unaligned Kraken crypto OHLC interval gap');
    const missing=diff/intervalSeconds-1;
    if(missing>0){gaps++;missingIntervals+=missing;largestGapIntervals=Math.max(largestGapIntervals,missing);}
  }
  const reasons=[];
  if(candles.length<60)reasons.push('INSUFFICIENT_COMPLETED_CANDLES_FOR_EXTENDED_RESEARCH');
  if(gaps>0)reasons.push('MISSING_24_7_CANDLE_INTERVALS');
  const latest=candles.at(-1);
  const latestAgeMs=Date.parse(retrievedAt)-(latest.startUnixSeconds+intervalSeconds)*1000;
  if(latestAgeMs<0)throw new TypeError('Last purportedly completed candle has not ended');
  if(latestAgeMs>intervalSeconds*1000*3)reasons.push('RECENT_CLOSED_INTERVALS_ABSENT');
  return {
    schema:'starnet-crypto-ohlc-inspection-v1',
    assetClass:'CRYPTO_SPOT',venue:'KRAKEN_SPOT',pair,
    baseAsset:pair.split('/')[0],quoteAsset:pair.split('/')[1],
    intervalMinutes,timeZone:'UTC',sessionModel:'TWENTY_FOUR_SEVEN',
    priceConvention:'VENUE_RAW_SPOT_PRICES',volumeUnit:'BASE_ASSET_UNITS',
    source:'Kraken public OHLC REST',retrievedAt,
    responsePairKey:keys[0],lastCursor:payload.result.last,
    completedCandles:candles,completedCount:candles.length,
    lastCompletedStartUtc:latest.startUtc,latestCompletedIntervalAgeMs:latestAgeMs,
    excludedUnfinishedStartUtc:unfinished.startUtc,incompleteCandlesExcluded:1,
    gapCount:gaps,missingIntervals,largestGapIntervals,reportedHistoryLimit:720,
    status:reasons.length?'REVIEW_REQUIRED':'STRUCTURALLY_PLAUSIBLE_NOT_AUTHENTICATED',
    reviewReasons:reasons,
    exchangeDataAuthenticated:false,historicalAvailabilityIndependentlyVerified:false,
    marketDataRightsIndependentlyVerified:false,brokerageConnected:false,
    alertsCreated:0,ordersCreated:0,productionGate:'NO_GO'
  };
}

/** Only a public read-only GET. No credentials, account state, or orders. */
export async function fetchKrakenPublicOHLC({
  pair='BTC/USD',intervalMinutes=60,
  fetchImpl=globalThis.fetch,now=()=>new Date()
}={}){
  if(typeof fetchImpl!=='function')throw new TypeError('Fetch implementation required');
  const url=buildKrakenPublicOHLCUrl({pair,intervalMinutes});
  let response;
  try{
    response=await fetchImpl(url,{method:'GET',headers:{Accept:'application/json'},
      redirect:'error',signal:AbortSignal.timeout(10000)});
  }catch{throw new Error('Public crypto OHLC request failed');}
  if(!response?.ok)throw new Error('Public crypto OHLC request returned status '+(response?.status??'unknown'));
  let payload;
  try{payload=await response.json();}
  catch{throw new Error('Public crypto OHLC response was not JSON');}
  const timestamp=now();
  if(!(timestamp instanceof Date)||!Number.isFinite(timestamp.getTime()))
    throw new TypeError('Invalid local research clock');
  return inspectKrakenPublicOHLC(payload,{pair,intervalMinutes,retrievedAt:timestamp.toISOString()});
}
