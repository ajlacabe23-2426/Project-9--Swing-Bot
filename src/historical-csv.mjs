import {normalizeMarketDataset,CURRENT_MARKET_DATA_SCHEMA,isStrictISODate} from './market-intelligence.mjs';

const NUMBER=/^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const SYMBOL=/^[A-Z0-9.\-]{1,15}$/;
const MAX_CSV_LENGTH=400_000;

function fail(message){
  throw Object.assign(new Error(message),{status:400});
}

/**
 * Validate a user-supplied historical OHLCV CSV. This parser deliberately
 * excludes multi-line quoted fields, formulas and HTML. Nothing is executed.
 * Date order may be ascending or descending; output is always ascending.
 */
export function parseHistoricalCsv({csv,symbol,source,priceAdjustment,confirmedRights},now=new Date()){
  if(confirmedRights!==true)fail('Confirm that you have permission to use this historical dataset.');
  if(typeof csv!=='string'||!csv.trim()||csv.length>MAX_CSV_LENGTH)
    fail('Provide a nonempty CSV smaller than 400 KB.');
  if(typeof symbol!=='string'||!SYMBOL.test(symbol))
    fail('Enter a valid uppercase U.S. ticker symbol.');
  if(typeof source!=='string'||source.trim().length<3||source.trim().length>100)
    fail('Enter the actual historical-data source (3–100 characters).');
  if(!['RAW','VENDOR_ADJUSTED','UNKNOWN'].includes(priceAdjustment))
    fail('Select an explicit price-adjustment declaration.');
  const cleaned=csv.replace(/^\uFEFF/,'').trim();
  if(/["<>]/.test(cleaned))fail('CSV contains unsupported quoted fields or markup; export a plain OHLCV CSV.');
  const lines=cleaned.split(/\r?\n/);
  if(lines.length<61||lines.length>3001)fail('Historical CSV needs 60–3000 completed daily observations.');
  const header=lines[0].split(',').map(column=>column.trim().toLowerCase());
  const fields=['date','open','high','low','close','volume'];
  if(header.length>20||new Set(header).size!==header.length)
    fail('Historical CSV has duplicated or excessive columns.');
  const indexes=fields.map(field=>header.indexOf(field));
  if(indexes.some(index=>index<0))fail('CSV requires Date,Open,High,Low,Close,Volume columns.');
  const bars=[];
  for(let line=1;line<lines.length;line++){
    const columns=lines[line].split(',').map(value=>value.trim());
    if(columns.length!==header.length)fail('CSV row '+(line+1)+' has an inconsistent column count.');
    const date=columns[indexes[0]];
    if(!isStrictISODate(date))fail('CSV row '+(line+1)+' has an invalid date.');
    const nums=indexes.slice(1).map(index=>{
      const value=columns[index];
      if(!NUMBER.test(value))fail('CSV row '+(line+1)+' contains an invalid numeric field.');
      const result=Number(value);
      if(!Number.isFinite(result))fail('CSV row '+(line+1)+' contains a nonfinite number.');
      return result;
    });
    bars.push({date,open:nums[0],high:nums[1],low:nums[2],close:nums[3],volume:nums[4]});
  }
  if(bars.length>1&&bars[0].date>bars[1].date)bars.reverse();
  const latest=bars.at(-1).date;
  const today=now.toISOString().slice(0,10);
  if(latest>=today)fail('Only fully completed prior trading-day bars may be imported.');
  const adjustmentMethod=priceAdjustment==='RAW'?'RAW_UNADJUSTED':
    priceAdjustment==='VENDOR_ADJUSTED'?'PROVIDER_ADJUSTED_UNVERIFIED':'UNKNOWN';
  try{
    return normalizeMarketDataset({
      schema:CURRENT_MARKET_DATA_SCHEMA,
      symbol,currency:'USD',source:source.trim(),
      mode:'HISTORICAL',sourceAsOf:latest,priceAdjustment,
      provenance:{
        retrievedAt:now.toISOString(),
        adjustmentMethod,
        corporateActions:priceAdjustment==='VENDOR_ADJUSTED'
          ?'PROVIDER_ADJUSTED_NOT_INDEPENDENTLY_VERIFIED':'NOT_VERIFIED',
        survivorship:'NOT_ASSESSED',
        licensing:'USER_ASSERTED_PERMITTED'
      },
      bars
    });
  }catch(error){
    fail('Historical CSV rejected: '+error.message);
  }
}
