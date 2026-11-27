/**
 * Kraken public spot ticker feed: bounded, READ-ONLY classroom market observer.
 * No credentials, accounts, trading, order placement, alerts, storage or
 * trading signals. Never treat venue quotes as consolidated executable prices.
 * Official schema: https://docs.kraken.com/exchange/api-reference/spot-websocket-v2/ticker
 */
export const KRAKEN_SPOT_PUBLIC_WSS='wss://ws.kraken.com/v2';
export const KRAKEN_PUBLIC_PAIRS=Object.freeze(['BTC/USD','ETH/USD']);
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const price=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const nonnegative=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
// Date.parse normalizes some impossible calendar dates and 24:00:00.
// Compare the UTC calendar fields after normalizing fractional precision only.
const utc=x=>{
  if(typeof x!=='string')return false;
  const match=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(x);
  if(!match)return false;
  const milliseconds=(match[2]??'').padEnd(3,'0').slice(0,3);
  const normalized=match[1]+'.'+milliseconds+'Z';
  const parsed=Date.parse(normalized);
  return Number.isFinite(parsed)&&new Date(parsed).toISOString()===normalized;
};

/** Only public ticker data, no private channels, credentials or orders. */
export function krakenPublicTickerSubscription(){
  return {
    method:'subscribe',
    params:{channel:'ticker',symbol:[...KRAKEN_PUBLIC_PAIRS],event_trigger:'bbo',snapshot:true}
  };
}

/**
 * Parse a public ticker snapshot or update. Ignore harmless control/heartbeat.
 * Return plain, explicitly unverified *venue observations*, not trade ideas.
 */
export function parseKrakenPublicTickerFrame(raw,{receivedAt,maxAgeMs=60_000}={}){
  if(typeof raw!=='string'||raw.length>16_384)
    throw new TypeError('Bounded Kraken JSON ticker frame required');
  if(!utc(receivedAt))throw new TypeError('Canonical UTC receipt timestamp required');
  if(!Number.isSafeInteger(maxAgeMs)||maxAgeMs<1000||maxAgeMs>300_000)
    throw new TypeError('Bounded observation age threshold required');
  let message;
  try{message=JSON.parse(raw)}catch{throw new TypeError('Invalid public ticker JSON');}
  if(!isObject(message))throw new TypeError('Ticker frame must be a JSON object');
  if(message.method==='subscribe'){
    if(message.success===false)throw new Error('Public ticker subscription rejected');
    return [];
  }
  if(message.channel!=='ticker')return [];
  if(!['snapshot','update'].includes(message.type)||!Array.isArray(message.data)||
     message.data.length<1||message.data.length>20)
    throw new TypeError('Invalid public ticker event frame');
  const receiptMs=Date.parse(receivedAt);
  return message.data.map((x,i)=>{
    if(!isObject(x)||!KRAKEN_PUBLIC_PAIRS.includes(x.symbol)||
       !price(x.bid)||!price(x.ask)||x.ask<x.bid||
       !nonnegative(x.bid_qty)||!nonnegative(x.ask_qty)||
       !utc(x.timestamp)||
       (x.last!==undefined&&!price(x.last)))
      throw new TypeError('Invalid public ticker observation '+i);
    const eventMs=Date.parse(x.timestamp);
    if(eventMs>receiptMs+1000)
      throw new TypeError('Future quote timestamp');
    const ageMs=Math.max(0,receiptMs-eventMs);
    return {
      schema:'starnet-public-crypto-ticker-observation-v1',
      source:'Kraken public spot ticker v2',
      symbol:x.symbol,
      venueScope:'KRAKEN_SPOT_ONLY_NOT_CONSOLIDATED',
      dataKind:'TOP_OF_BOOK_SNAPSHOT_OR_UPDATE',
      eventType:message.type,
      exchangeTimestamp:x.timestamp,
      receivedAt,
      quoteAgeMs:ageMs,
      bid:x.bid,ask:x.ask,last:x.last??null,
      bidQuantity:x.bid_qty,askQuantity:x.ask_qty,
      status:ageMs<=maxAgeMs?'RECENT_RECEIPT_UNVERIFIED':'STALE_OR_DELAYED_OBSERVATION',
      providerAuthenticated:false,
      marketDataRightsIndependentlyVerified:false,
      executablePriceIndependentlyVerified:false,
      signalGenerated:false,
      brokerageConnected:false,
      realOrdersEnabled:false,
      realOrdersCreated:0,
      productionGate:'NO_GO'
    };
  });
}
