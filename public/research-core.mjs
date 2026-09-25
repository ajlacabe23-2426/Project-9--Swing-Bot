/**
 * Point-in-time research on user-supplied CSV only.
 * Browser-only import; never writes data to the paper ledger or a backend.
 * Source and rights declarations are unverified; not investment guidance.
 */
export const RESEARCH_VERSION='historical-csv-v3-chronological-consistency';
export const MAX_BYTES=550_000,MAX_ROWS=3000,MIN_ROWS=100;
/** Stable local-data fingerprint for reproducible research; no upload or storage. */
export async function datasetFingerprint(csv){
  if(typeof csv!=='string'||!csv.trim()||new TextEncoder().encode(csv).byteLength>MAX_BYTES)
    throw new Error('Fingerprint requires a bounded local CSV');
  if(!globalThis.crypto?.subtle)throw new Error('Local SHA-256 is unavailable in this browser');
  const bytes=new TextEncoder().encode(csv);
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

const money=value=>Math.round(value*1e8)/1e8;
const pct=value=>Math.round(value*10000)/100;
const required=['date','open','high','low','close','volume'];
const exactDay=text=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;
  const parsed=new Date(text+'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===text?parsed:null;
};
function cells(csv){
  const result=[],row=[];let current='',quoted=false;
  for(let i=0;i<csv.length;i++){
    const char=csv[i];
    if(quoted){
      if(char==='"'&&csv[i+1]==='"'){current+='"';i++;}
      else if(char==='"')quoted=false;
      else current+=char;
    }else if(char==='"'&&current==='')quoted=true;
    else if(char===','){row.push(current);current='';}
    else if(char==='\n'){row.push(current);result.push([...row]);row.length=0;current='';}
    else if(char==='\r'){if(csv[i+1]!=='\n')throw new Error('Unsupported line endings');}
    else if(char==='"')throw new Error('Malformed CSV quotation');
    else current+=char;
  }
  if(quoted)throw new Error('Unclosed CSV quotation');
  if(current!==''||row.length){row.push(current);result.push([...row]);}
  return result.filter((r,i)=>i===0||r.some(v=>v.trim()!==''));
}
export function parseHistoricalCsv(input){
  if(typeof input!=='string'||!input.trim())throw new Error('Provide a nonempty CSV file');
  if(new TextEncoder().encode(input).byteLength>MAX_BYTES)throw new Error('CSV is too large (550 KB maximum)');
  const rows=cells(input.replace(/^\uFEFF/,''));
  if(rows.length<MIN_ROWS+1||rows.length>MAX_ROWS+1)throw new Error('Provide 100–3000 completed daily bars');
  const header=rows[0].map(v=>v.trim().toLowerCase());
  if(header.length!==required.length||new Set(header).size!==required.length||required.some(k=>!header.includes(k)))
    throw new Error('CSV headers must contain exactly date,open,high,low,close,volume');
  let previous=null,previousClose=null;
  const warnings=new Set(['User-supplied source, licensing and price adjustments cannot be independently verified.','Raw OHLC prices may omit splits, dividends, delistings and other corporate actions.']);
  const bars=rows.slice(1).map((row,index)=>{
    const line=index+2;
    if(row.length!==header.length)throw new Error('Line '+line+': wrong number of CSV fields');
    const record=Object.fromEntries(header.map((k,i)=>[k,row[i].trim()]));
    const day=exactDay(record.date);
    if(!day||day.getUTCDay()===0||day.getUTCDay()===6)throw new Error('Line '+line+': invalid weekday date');
    if(previous&&day<=previous)throw new Error('Line '+line+': dates must be strictly ascending and unique');
    if(previous&&(day-previous)/86400000>5)warnings.add('Missing business sessions or a multi-day gap detected; review source coverage and trading calendars.');
    const values={};
    for(const key of ['open','high','low','close']){
      const raw=record[key];
      if(!/^(?:\d+\.?\d*|\.\d+)$/.test(raw))throw new Error('Line '+line+': invalid '+key);
      const v=Number(raw);if(!Number.isFinite(v)||v<=0||v>1e9)throw new Error('Line '+line+': invalid '+key);
      values[key]=v;
    }
    if(!/^\d+$/.test(record.volume)||!Number.isSafeInteger(Number(record.volume))||Number(record.volume)>1e12)throw new Error('Line '+line+': invalid volume');
    if(values.high<Math.max(values.open,values.close)||values.low>Math.min(values.open,values.close))
      throw new Error('Line '+line+': inconsistent OHLC');
    if(previousClose&&(values.open/previousClose>1.3||values.open/previousClose<0.7))
      warnings.add('Large adjacent-session price gap detected. Check splits, adjustments, trading halts and data quality.');
    if(Number(record.volume)===0)warnings.add('A zero-volume session was detected; simulated fills may not be feasible.');
    previous=day;previousClose=values.close;
    return {date:record.date,...values,volume:Number(record.volume)};
  });
  return {bars,warnings:[...warnings],kind:'USER_SUPPLIED_UNVERIFIED_CSV',priceAdjustment:'UNKNOWN'};
}
function mean(bars,end,period){
  if(end-period+1<0)return null;
  let total=0;for(let i=end-period+1;i<=end;i++)total+=bars[i].close;
  return total/period;
}
function signal(bars,index){
  if(index<20)return null;
  const p5=mean(bars,index-1,5),p20=mean(bars,index-1,20);
  const n5=mean(bars,index,5),n20=mean(bars,index,20);
  if(p5<=p20&&n5>n20)return 'ENTER';
  if(p5>=p20&&n5<n20)return 'EXIT';
  return null;
}
export function evaluateSlice(bars,start,end,{costMultiplier=1}={}){
  if(!Array.isArray(bars)||!Number.isInteger(start)||!Number.isInteger(end)||start<20||end>=bars.length||end-start<2)
    throw new Error('Invalid research window');
  if(![1,2,4].includes(costMultiplier))throw new Error('Invalid modeled cost multiplier');
  const feeRate=0.001*costMultiplier,slippage=0.0005*costMultiplier,minFee=0.5*costMultiplier;
  let cash=10_000,units=0,pending=null,peak=10_000,drawdown=0;
  let paidFees=0,blocked=0;const fills=[],curve=[];
  for(let i=start;i<=end;i++){
    const bar=bars[i];
    if(pending){
      const prior=pending;pending=null;
      if(bar.volume===0){blocked++;}
      else if(prior.side==='ENTER'&&units===0){
        const fill=bar.open*(1+slippage),notionalLimit=Math.min(cash*0.1,cash*0.25);
        const preliminaryFee=Math.max(minFee,notionalLimit*feeRate);
        const quantity=Math.floor((notionalLimit-preliminaryFee)/fill*1000)/1000;
        const notional=quantity*fill,fee=Math.max(minFee,notional*feeRate);
        if(quantity>0&&notional+fee<=cash){cash=money(cash-notional-fee);units=quantity;paidFees+=fee;
          fills.push({kind:'SIMULATED_BUY',signalDate:prior.date,fillDate:bar.date,quantity,price:money(fill),fee:money(fee)});}
        else blocked++;
      }else if(prior.side==='EXIT'&&units>0){
        const fill=bar.open*(1-slippage),quantity=units,fee=Math.max(minFee,quantity*fill*feeRate);
        cash=money(cash+quantity*fill-fee);paidFees+=fee;units=0;
        fills.push({kind:'SIMULATED_SELL',signalDate:prior.date,fillDate:bar.date,quantity,price:money(fill),fee:money(fee)});
      }
    }
    const value=cash+units*bar.close;peak=Math.max(peak,value);drawdown=Math.min(drawdown,value/peak-1);
    curve.push({date:bar.date,value:money(value)});
    if(i<end){
      const found=signal(bars,i);
      if(found&&((found==='ENTER'&&units===0)||(found==='EXIT'&&units>0)))pending={side:found,date:bar.date};
    }
  }
  const value=cash+units*bars[end].close,benchmark=bars[end].close/bars[start].close*10_000;
  return {start:bars[start].date,end:bars[end].date,bars:end-start+1,
    simulatedEndValue:money(value),simulatedReturnPct:pct(value/10_000-1),
    comparisonReturnPct:pct(benchmark/10_000-1),simulatedMaxDrawdownPct:pct(drawdown),
    simulatedFees:money(paidFees),fillCount:fills.length,blockedCount:blocked,
    openUnits:units,markToMarket:true,
    modelCosts:{multiplier:costMultiplier,feeRate,slippage,minFee},fills,curve};
}
export function analyzeHistoricalResearch({bars,warnings,kind},source){
  if(kind!=='USER_SUPPLIED_UNVERIFIED_CSV'||!Array.isArray(bars)||bars.length<MIN_ROWS||bars.length>MAX_ROWS)
    throw new Error('Invalid imported research dataset');
  if(typeof source!=='string'||source.trim().length<3||source.trim().length>140)
    throw new Error('A source label of 3–140 characters is required');
  const cut=Math.floor(bars.length*.7);
  if(cut<30||bars.length-cut<20)throw new Error('Dataset is too short for a separate holdout');
  const train=evaluateSlice(bars,20,cut-1),holdout=evaluateSlice(bars,cut,bars.length-1);
  const holdoutStress=[2,4].map(multiplier=>({multiplier,...evaluateSlice(bars,cut,bars.length-1,{costMultiplier:multiplier})}));
  // Three nonoverlapping chronological segments provide a descriptive stability check.
  // Each starts with independent paper cash; prior completed bars are used only for indicator warmup.
  // This is NOT a third held-out experiment, statistical confidence bound, or evidence of profitability.
  const available=bars.length-20;
  const boundaries=[20,20+Math.floor(available/3),20+Math.floor(available*2/3),bars.length];
  const chronologicalChecks=boundaries.slice(0,3).map((start,index)=>({
    segment:index+1,
    ...evaluateSlice(bars,start,boundaries[index+1]-1)
  }));
  return {engine:RESEARCH_VERSION,mode:'UPLOADED_UNVERIFIED_HISTORICAL_CSV',sourceDeclaredByUser:source.trim(),
    fileNeverSentToServer:true,split:'CHRONOLOGICAL_70_30_FIXED',train,holdout,holdoutStress,chronologicalChecks,rows:bars.length,
    earliest:bars[0].date,latest:bars.at(-1).date,warnings,
    limitations:['Historical bars supplied by a user are not authenticated or independently verified.',
      'Strategy uses fixed 5/20 crossover rules; no optimization or selection of the holdout.',
      'Holdout simulates a fresh paper portfolio at the partition date, using earlier completed bars for moving-average warmup.',
      'Next-open fills are modeled at available OHLC prices with fixed costs. Market impact, order book and execution uncertainty are not reproduced.',
      'Three nonoverlapping chronological consistency segments use independent hypothetical balances; prior completed bars may warm up indicators. They are descriptive checks, not independent market regimes, statistical validation, or additional untouched holdouts.',
      'The 2× and 4× modeled-cost stress runs replay the same fixed rule on the same held-out dates with independent virtual balances. They are not confidence intervals, predictions or independently verified execution prices.',
      'Unadjusted data may misstate performance around splits and dividends; this is not evidence of attainable real returns.']};
}
