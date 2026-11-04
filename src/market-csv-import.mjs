import {normalizeMarketDataset,CURRENT_MARKET_DATA_SCHEMA,isStrictISODate} from './market-intelligence.mjs';

const cols=['date','open','high','low','close','volume'];
const numeric=/^(?:\d+(?:\.\d+)?|\.\d+)$/;
const whole=/^(?:0|[1-9]\d*)$/;

/**
 * Convert a deliberately simple, authorized local daily OHLCV CSV to the
 * provider-neutral research contract. No web requests, price verification or
 * automatic assumption of adjustment, survivorship or distribution rights.
 * Quoted fields and thousands separators are deliberately unsupported.
 */
export function convertAuthorizedMarketCSV(text,{
  symbol,source,retrievedAt,confirmedResearchPermission=false
}={}){
  if(confirmedResearchPermission!==true)
    throw new Error('Explicit research-data permission confirmation is required');
  if(typeof text!=='string'||text.length>750000)throw new Error('Invalid or oversized OHLCV CSV');
  if(typeof source!=='string'||source.trim().length<2||source.trim().length>100)
    throw new Error('Provide a concise, identifiable data source');
  if(typeof retrievedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(retrievedAt)||
     !Number.isFinite(Date.parse(retrievedAt))||!/[zZ]|[+-]\d{2}:\d{2}$/.test(retrievedAt))
    throw new Error('Explicit timezone-aware retrieval timestamp required');
  const rows=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  if(rows.length<61||rows.length>3001)throw new Error('Require 60–3000 completed historical bars');
  const header=rows.shift().split(',').map(value=>value.trim().toLowerCase());
  if(header.length!==6||new Set(header).size!==6||!cols.every(key=>header.includes(key)))
    throw new Error('Required daily CSV columns: date,open,high,low,close,volume');
  const bars=rows.map((line,index)=>{
    const parts=line.split(',');
    if(parts.length!==6)throw new Error('Invalid CSV columns at data row '+(index+1));
    const raw=Object.fromEntries(header.map((key,i)=>[key,parts[i].trim()]));
    if(!isStrictISODate(raw.date))throw new Error('Invalid completed-bar date at row '+(index+1));
    for(const key of ['open','high','low','close'])
      if(!numeric.test(raw[key]))throw new Error('Invalid decimal '+key+' at row '+(index+1));
    if(!whole.test(raw.volume))throw new Error('Invalid integer volume at row '+(index+1));
    return {date:raw.date,open:Number(raw.open),high:Number(raw.high),
      low:Number(raw.low),close:Number(raw.close),volume:Number(raw.volume)};
  });
  // All provenance fields are intentionally conservative; file-level checks
  // and an attestation never establish authentic or cleared upstream data.
  return normalizeMarketDataset({
    schema:CURRENT_MARKET_DATA_SCHEMA,
    symbol,currency:'USD',source:source.trim(),mode:'HISTORICAL',
    sourceAsOf:bars.at(-1).date,priceAdjustment:'UNKNOWN',
    provenance:{
      retrievedAt,
      adjustmentMethod:'UNKNOWN',
      corporateActions:'NOT_VERIFIED',
      survivorship:'NOT_ASSESSED',
      licensing:'USER_ASSERTED_PERMITTED'
    },
    bars
  });
}
