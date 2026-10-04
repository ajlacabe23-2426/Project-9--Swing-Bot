/**
 * Point-in-time research on user-supplied CSV only.
 * Browser-only import; never writes data to the paper ledger or a backend.
 * Source and rights declarations are unverified; not investment guidance.
 */
export const RESEARCH_VERSION='historical-csv-v7-walk-forward';
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
export const PRICE_ADJUSTMENT_STATUSES=['UNKNOWN','RAW_UNADJUSTED','VENDOR_ADJUSTED'];
const instrumentPattern=/^[A-Z0-9][A-Z0-9._-]{0,31}$/;
const currencyPattern=/^[A-Z]{3}$/;
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
export function summarizeDataQuality(bars){
  if(!Array.isArray(bars)||bars.length===0)throw new Error('Data-quality summary requires bars');
  let multiDayGaps=0,zeroVolumeBars=0,largeAdjacentOpenGaps=0,maxCalendarGapDays=0;
  let closeReturnOutliers=0,extremeIntradayRanges=0,flatCloseTransitions=0,duplicateOhlcvTransitions=0;
  let currentFlatCloseRun=1,longestFlatCloseRun=1;
  const firstDay=Date.parse(bars[0].date+'T00:00:00.000Z');
  const lastDay=Date.parse(bars.at(-1).date+'T00:00:00.000Z');
  let expectedWeekdays=0;
  for(let day=firstDay;day<=lastDay;day+=86400000){
    const weekday=new Date(day).getUTCDay();
    if(weekday!==0&&weekday!==6)expectedWeekdays++;
  }
  for(let i=0;i<bars.length;i++){
    const bar=bars[i];
    if(bar.volume===0)zeroVolumeBars++;
    if(bar.high/bar.low>1.3)extremeIntradayRanges++;
    if(i===0)continue;
    const previous=bars[i-1];
    const gapDays=(Date.parse(bar.date+'T00:00:00.000Z')-Date.parse(previous.date+'T00:00:00.000Z'))/86400000;
    maxCalendarGapDays=Math.max(maxCalendarGapDays,gapDays);
    if(gapDays>5)multiDayGaps++;
    if(bar.open/previous.close>1.3||bar.open/previous.close<0.7)largeAdjacentOpenGaps++;
    if(Math.abs(bar.close/previous.close-1)>0.2)closeReturnOutliers++;
    if(bar.open===previous.open&&bar.high===previous.high&&bar.low===previous.low&&bar.close===previous.close&&bar.volume===previous.volume)duplicateOhlcvTransitions++;
    if(bar.close===previous.close){flatCloseTransitions++;currentFlatCloseRun++;longestFlatCloseRun=Math.max(longestFlatCloseRun,currentFlatCloseRun);}
    else currentFlatCloseRun=1;
  }
  return {
    observedBars:bars.length,
    calendarSpanDays:Math.round((lastDay-firstDay)/86400000)+1,
    expectedWeekdays,
    weekdayCoveragePct:pct(bars.length/Math.max(expectedWeekdays,1)),
    multiDayGaps,
    zeroVolumeBars,
    largeAdjacentOpenGaps,
    closeReturnOutliers,
    extremeIntradayRanges,
    flatCloseTransitions,
    duplicateOhlcvTransitions,
    longestFlatCloseRun,
    maxCalendarGapDays
  };
}

export function normalizeResearchProvenance(input,latestDate){
  if(!input||typeof input!=='object')throw new Error('Research provenance is required');
  const source=String(input.source??'').trim();
  const instrument=String(input.instrument??'').trim().toUpperCase();
  const currency=String(input.currency??'').trim().toUpperCase();
  const priceAdjustment=String(input.priceAdjustment??'').trim().toUpperCase();
  const asOfDate=String(input.asOfDate??'').trim();
  if(source.length<3||source.length>140)throw new Error('A source label of 3–140 characters is required');
  if(!instrumentPattern.test(instrument))throw new Error('Instrument label must be 1–32 uppercase letters, numbers, dot, dash or underscore');
  if(!currencyPattern.test(currency))throw new Error('Currency must be a 3-letter code');
  if(!PRICE_ADJUSTMENT_STATUSES.includes(priceAdjustment))throw new Error('Price adjustment status is required');
  if(!exactDay(asOfDate))throw new Error('Source as-of date must be YYYY-MM-DD');
  if(latestDate&&asOfDate<latestDate)throw new Error('Source as-of date cannot be earlier than the latest imported bar');
  return {sourceDeclaredByUser:source,instrumentDeclaredByUser:instrument,currencyDeclaredByUser:currency,priceAdjustmentDeclaredByUser:priceAdjustment,sourceAsOfDate:asOfDate,independentlyVerified:false};
}

export function assessResearchReadiness(dataQuality,priceAdjustment){
  const reviewReasons=[];
  if(priceAdjustment==='UNKNOWN')reviewReasons.push('PRICE_ADJUSTMENT_UNKNOWN');
  if(dataQuality.multiDayGaps>0)reviewReasons.push('MULTI_DAY_GAPS');
  if(dataQuality.zeroVolumeBars>0)reviewReasons.push('ZERO_VOLUME_BARS');
  if(dataQuality.largeAdjacentOpenGaps>0||dataQuality.closeReturnOutliers>0)reviewReasons.push('PRICE_DISCONTINUITY');
  if(dataQuality.extremeIntradayRanges>0)reviewReasons.push('EXTREME_INTRADAY_RANGE');
  if(dataQuality.duplicateOhlcvTransitions>0)reviewReasons.push('DUPLICATE_OHLCV_TRANSITION');
  if(dataQuality.longestFlatCloseRun>=3)reviewReasons.push('STALE_CLOSE_RUN');
  if(dataQuality.weekdayCoveragePct<90)reviewReasons.push('LOW_WEEKDAY_COVERAGE');
  return {
    status:reviewReasons.length?'REVIEW_REQUIRED':'STRUCTURALLY_CLEAN_UNVERIFIED',
    reviewReasons
  };
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
  const warnings=new Set(['User-supplied source, licensing, instrument identity and adjustment declarations cannot be independently verified.']);
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
  return {bars,warnings:[...warnings],kind:'USER_SUPPLIED_UNVERIFIED_CSV',priceAdjustment:'UNKNOWN',dataQuality:summarizeDataQuality(bars)};
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
  let comparisonPeak=10_000,comparisonDrawdown=0;
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
    const comparisonValue=10_000*bar.close/bars[start].close;comparisonPeak=Math.max(comparisonPeak,comparisonValue);comparisonDrawdown=Math.min(comparisonDrawdown,comparisonValue/comparisonPeak-1);
    curve.push({date:bar.date,value:money(value)});
    if(i<end){
      const found=signal(bars,i);
      if(found&&((found==='ENTER'&&units===0)||(found==='EXIT'&&units>0)))pending={side:found,date:bar.date};
    }
  }
  const value=cash+units*bars[end].close,benchmark=bars[end].close/bars[start].close*10_000;
  return {start:bars[start].date,end:bars[end].date,bars:end-start+1,
    simulatedEndValue:money(value),simulatedReturnPct:pct(value/10_000-1),
    comparisonEndValue:money(benchmark),comparisonReturnPct:pct(benchmark/10_000-1),
    excessReturnVsComparisonPct:pct(value/10_000-benchmark/10_000),
    simulatedMaxDrawdownPct:pct(drawdown),comparisonMaxDrawdownPct:pct(comparisonDrawdown),
    simulatedFees:money(paidFees),fillCount:fills.length,blockedCount:blocked,
    openUnits:units,markToMarket:true,
    modelCosts:{multiplier:costMultiplier,feeRate,slippage,minFee},fills,curve};
}
export function buildWalkForwardEvaluation(bars,developmentEnd,{folds=4}={}){
  if(!Array.isArray(bars)||!Number.isInteger(developmentEnd)||developmentEnd>=bars.length||developmentEnd<60||!Number.isInteger(folds)||folds<2||folds>6)
    throw new Error('Invalid walk-forward configuration');
  const firstEvaluationStart=Math.max(40,Math.floor((developmentEnd+1)*0.45));
  const available=developmentEnd-firstEvaluationStart+1;
  if(available<folds*3)throw new Error('Development window is too short for walk-forward evaluation');
  const baseSize=Math.floor(available/folds),remainder=available%folds;
  const result=[];let start=firstEvaluationStart;
  for(let index=0;index<folds;index++){
    const size=baseSize+(index<remainder?1:0),end=start+size-1;
    const evaluation=evaluateSlice(bars,start,end);
    result.push({
      fold:index+1,
      trainingStart:bars[0].date,
      trainingEnd:bars[start-1].date,
      trainingBars:start,
      ...evaluation
    });
    start=end+1;
  }
  return result;
}

export function analyzeHistoricalResearch({bars,warnings,kind,dataQuality},provenanceInput){
  if(kind!=='USER_SUPPLIED_UNVERIFIED_CSV'||!Array.isArray(bars)||bars.length<MIN_ROWS||bars.length>MAX_ROWS)
    throw new Error('Invalid imported research dataset');
  const provenance=normalizeResearchProvenance(provenanceInput,bars.at(-1).date);
  const quality=dataQuality||summarizeDataQuality(bars);
  const researchReadiness=assessResearchReadiness(quality,provenance.priceAdjustmentDeclaredByUser);
  const cut=Math.floor(bars.length*.7);
  if(cut<30||bars.length-cut<20)throw new Error('Dataset is too short for a separate holdout');
  const train=evaluateSlice(bars,20,cut-1),holdout=evaluateSlice(bars,cut,bars.length-1);
  const walkForward=buildWalkForwardEvaluation(bars,cut-1,{folds:4});
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
  const provenanceWarnings=[];
  if(provenance.priceAdjustmentDeclaredByUser==='UNKNOWN')provenanceWarnings.push('Price-adjustment status is unknown; splits and distributions may distort both the strategy and the comparison return.');
  if(provenance.priceAdjustmentDeclaredByUser==='RAW_UNADJUSTED')provenanceWarnings.push('Prices are declared raw/unadjusted; corporate actions can create discontinuities that are not investment returns.');
  if(provenance.priceAdjustmentDeclaredByUser==='VENDOR_ADJUSTED')provenanceWarnings.push('Prices are declared vendor-adjusted, but the adjustment methodology and corporate-action coverage are not independently verified.');
  if(researchReadiness.status==='REVIEW_REQUIRED')provenanceWarnings.push('Structural data review required before interpreting simulated results: '+researchReadiness.reviewReasons.join(', ')+'.');
  return {engine:RESEARCH_VERSION,mode:'UPLOADED_UNVERIFIED_HISTORICAL_CSV',...provenance,
    provenance,fileNeverSentToServer:true,split:'CHRONOLOGICAL_70_30_FIXED',train,holdout,walkForward,holdoutStress,chronologicalChecks,rows:bars.length,
    earliest:bars[0].date,latest:bars.at(-1).date,warnings:[...warnings,...provenanceWarnings],dataQuality:quality,researchReadiness,
    limitations:['Historical bars supplied by a user are not authenticated or independently verified.',
      'Strategy uses fixed 5/20 crossover rules; no optimization or selection of the holdout.',
      'Holdout simulates a fresh paper portfolio at the partition date, using earlier completed bars for moving-average warmup.',
      'Four walk-forward folds are confined to the development period. Each uses expanding prior history for context and a fresh virtual balance for the next nonoverlapping evaluation block; the fixed rule is not retuned between folds and the untouched holdout is never used.',
      'Next-open fills are modeled at available OHLC prices with fixed costs. Market impact, order book and execution uncertainty are not reproduced.',
      'Three nonoverlapping chronological consistency segments use independent hypothetical balances; prior completed bars may warm up indicators. They are descriptive checks, not independent market regimes, statistical validation, or additional untouched holdouts.',
      'The 2× and 4× modeled-cost stress runs replay the same fixed rule on the same held-out dates with independent virtual balances. They are not confidence intervals, predictions or independently verified execution prices.',
      'Unadjusted data may misstate performance around splits and dividends; this is not evidence of attainable real returns.']};
}

function manifestPeriod(period){
  return {
    start:period.start,end:period.end,bars:period.bars,
    simulatedEndValue:period.simulatedEndValue,
    simulatedReturnPct:period.simulatedReturnPct,
    comparisonEndValue:period.comparisonEndValue,
    comparisonReturnPct:period.comparisonReturnPct,
    excessReturnVsComparisonPct:period.excessReturnVsComparisonPct,
    simulatedMaxDrawdownPct:period.simulatedMaxDrawdownPct,
    comparisonMaxDrawdownPct:period.comparisonMaxDrawdownPct,
    simulatedFees:period.simulatedFees,
    fillCount:period.fillCount,blockedCount:period.blockedCount,
    openUnits:period.openUnits,markToMarket:period.markToMarket,
    modelCosts:{...period.modelCosts}
  };
}
/**
 * Deterministic, browser-local experiment record. It intentionally excludes raw
 * bars, curves and individual fills so the record is compact and cannot be
 * mistaken for redistribution of the source dataset.
 */
export function buildExperimentManifest(result,fingerprint){
  if(!result||result.engine!==RESEARCH_VERSION||!result.fileNeverSentToServer)
    throw new Error('Invalid research result for manifest');
  if(typeof fingerprint!=='string'||!/^[0-9a-f]{64}$/.test(fingerprint))
    throw new Error('Invalid dataset fingerprint');
  return {
    schema:'project9-research-manifest-v3',
    engine:result.engine,
    mode:result.mode,
    dataset:{
      sha256:fingerprint,
      sourceDeclaredByUser:result.sourceDeclaredByUser,
      instrumentDeclaredByUser:result.instrumentDeclaredByUser,
      currencyDeclaredByUser:result.currencyDeclaredByUser,
      priceAdjustmentDeclaredByUser:result.priceAdjustmentDeclaredByUser,
      sourceAsOfDate:result.sourceAsOfDate,
      rows:result.rows,earliest:result.earliest,latest:result.latest,
      independentlyVerified:false,
      fileIncluded:false,
      dataQuality:{...result.dataQuality},
      researchReadiness:{status:result.researchReadiness.status,reviewReasons:[...result.researchReadiness.reviewReasons]}
    },
    experiment:{
      split:result.split,
      development:manifestPeriod(result.train),
      holdout:manifestPeriod(result.holdout),
      walkForward:result.walkForward.map(item=>({fold:item.fold,trainingStart:item.trainingStart,trainingEnd:item.trainingEnd,trainingBars:item.trainingBars,...manifestPeriod(item)})),
      holdoutCostStress:result.holdoutStress.map(item=>({
        multiplier:item.multiplier,...manifestPeriod(item)
      })),
      chronologicalChecks:result.chronologicalChecks.map(item=>({
        segment:item.segment,...manifestPeriod(item)
      }))
    },
    warnings:[...result.warnings],
    limitations:[...result.limitations],
    safety:{
      realOrders:false,
      brokerageConnected:false,
      investmentRecommendation:false,
      resultType:'HYPOTHETICAL_SIMULATION'
    }
  };
}
