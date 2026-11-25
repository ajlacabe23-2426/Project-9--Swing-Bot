/**
 * Offline cross-source historical-data comparison (not authentication).
 *
 * This is a structural comparator for TWO separately supplied local JSON
 * byte streams. Different file hashes, source labels and even perfectly
 * matching bars do NOT prove independent vendors, point-in-time availability,
 * legal data rights, corporate actions, real fill prices or actual market data.
 * No I/O, network, accounts, broker, wallet, blockchain or execution.
 */
import {createHash} from 'node:crypto';
import {normalizeMarketDataset,isStrictISODate} from './market-intelligence.mjs';

const fail=why=>{throw new TypeError('Offline historical evidence refused: '+why);};
const MAX_BYTES=2_500_000;
const FIELDS=Object.freeze(['open','high','low','close']);
const PRICE_TOLERANCE_BPS=1;
const VOLUME_TOLERANCE_PCT=1;
const MAX_SAMPLES=12;
const h=bytes=>createHash('sha256').update(bytes).digest('hex');
const fixed=value=>Number(value.toFixed(6));
function parse(bytes,label){
  if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>MAX_BYTES)
    fail(label+' must be explicitly supplied nonempty JSON bytes <= 2.5 MB');
  let value;
  try{value=JSON.parse(bytes.toString('utf8'));}
  catch{fail(label+' is not JSON');}
  return normalizeMarketDataset(value);
}
function requireComparable(primary,witness,asOf){
  if(!isStrictISODate(asOf))fail('valid explicit YYYY-MM-DD comparison cutoff required');
  if(primary.symbol!==witness.symbol||primary.currency!==witness.currency)
    fail('different instrument or currency; refusing misleading cross-symbol comparison');
  if(primary.bars.at(-1).date>asOf||witness.bars.at(-1).date>asOf||
     primary.sourceAsOf>asOf||witness.sourceAsOf>asOf)
    fail('future-dated bars or source metadata after comparison cutoff');
}
function pairSummary(data,bytes){
  return Object.freeze({
    symbol:data.symbol,currency:data.currency,
    declaredSourceLabel:data.source,
    declaredMode:data.mode,
    schema:data.schema,
    sourceAsOf:data.sourceAsOf,
    firstCompletedBar:data.bars[0].date,
    lastCompletedBar:data.bars.at(-1).date,
    observedBars:data.bars.length,
    byteSha256:h(bytes),
    priceAdjustment:data.priceAdjustment,
    retrievedAtDeclared:data.provenance.retrievedAt,
    provenanceContract:data.provenance.contract,
    adjustmentMethodDeclared:data.provenance.adjustmentMethod,
    corporateActionsDeclared:data.provenance.corporateActions,
    survivorshipDeclared:data.provenance.survivorship,
    licensingDeclared:data.provenance.licensing,
    vendorAuthenticityIndependentlyVerified:false,
    pointInTimeAvailabilityIndependentlyVerified:false,
    licensingIndependentlyVerified:false
  });
}
function add(list,flag){if(!list.includes(flag))list.push(flag);}
function timeAfterAsOf(iso,asOf){return iso!==null&&iso.slice(0,10)>asOf;}
function relativeBps(a,b){return Math.abs(a-b)/Math.max(Math.abs(a),Math.abs(b),1e-12)*10_000;}
function relativePct(a,b){return Math.abs(a-b)/Math.max(Math.abs(a),Math.abs(b),1)*100;}

export function compareLocalHistoricalSources({
  primaryBytes,witnessBytes,asOf
}={}){
  const primary=parse(primaryBytes,'primary'),
    witness=parse(witnessBytes,'witness');
  requireComparable(primary,witness,asOf);
  const a=pairSummary(primary,primaryBytes),b=pairSummary(witness,witnessBytes);
  const reasons=[];
  if(a.byteSha256===b.byteSha256)add(reasons,'IDENTICAL_INPUT_BYTES_NOT_INDEPENDENT');
  if(a.declaredSourceLabel===b.declaredSourceLabel)
    add(reasons,'IDENTICAL_DECLARED_SOURCE_LABELS');
  if(a.priceAdjustment!==b.priceAdjustment||
     a.adjustmentMethodDeclared!==b.adjustmentMethodDeclared)
    add(reasons,'PRICE_ADJUSTMENT_OR_METHODOLOGY_CONFLICT');
  if(a.corporateActionsDeclared!==b.corporateActionsDeclared)
    add(reasons,'CORPORATE_ACTION_DECLARATIONS_DIFFER');
  if(a.survivorshipDeclared!==b.survivorshipDeclared)
    add(reasons,'SURVIVORSHIP_DECLARATIONS_DIFFER');
  if(a.licensingDeclared!==b.licensingDeclared)
    add(reasons,'LICENSING_DECLARATIONS_DIFFER');
  if(!a.retrievedAtDeclared||!b.retrievedAtDeclared)
    add(reasons,'MISSING_DECLARED_RETRIEVAL_TIMESTAMP');
  if(timeAfterAsOf(a.retrievedAtDeclared,asOf)||
     timeAfterAsOf(b.retrievedAtDeclared,asOf))
    add(reasons,'RETRIEVAL_DECLARED_AFTER_COMPARISON_CUTOFF');

  const aByDate=new Map(primary.bars.map(bar=>[bar.date,bar]));
  const bByDate=new Map(witness.bars.map(bar=>[bar.date,bar]));
  const dates=Array.from(new Set([...aByDate.keys(),...bByDate.keys()])).sort();
  let common=0,onlyA=0,onlyB=0,ohlcMismatchDates=0,volumeMismatchDates=0;
  let maxOhlcDifferenceBps=0,maxVolumeDifferencePct=0;
  const discrepancySamples=[];
  const sample=(date,field,difference)=>{
    if(discrepancySamples.length<MAX_SAMPLES){
      discrepancySamples.push(Object.freeze({
        date,field,
        differenceUnit:field==='volume'?'PERCENT':'BASIS_POINTS',
        relativeDifference:fixed(difference)
      }));
    }
  };
  for(const date of dates){
    const first=aByDate.get(date),second=bByDate.get(date);
    if(!first||!second){
      if(first)onlyA++;else onlyB++;
      sample(date,first?'MISSING_FROM_WITNESS':'MISSING_FROM_PRIMARY',0);
      continue;
    }
    common++;
    let mismatched=false;
    for(const field of FIELDS){
      const diff=relativeBps(first[field],second[field]);
      maxOhlcDifferenceBps=Math.max(maxOhlcDifferenceBps,diff);
      if(diff>PRICE_TOLERANCE_BPS){
        mismatched=true;sample(date,field,diff);
      }
    }
    if(mismatched)ohlcMismatchDates++;
    const volumeDiff=relativePct(first.volume,second.volume);
    maxVolumeDifferencePct=Math.max(maxVolumeDifferencePct,volumeDiff);
    if(volumeDiff>VOLUME_TOLERANCE_PCT){
      volumeMismatchDates++;sample(date,'volume',volumeDiff);
    }
  }
  if(common<60)add(reasons,'FEWER_THAN_60_MATCHED_DATES');
  if(onlyA||onlyB)add(reasons,'MISSING_DATES_BETWEEN_LOCAL_INPUTS');
  if(ohlcMismatchDates)add(reasons,'OHLC_PRICE_DISCREPANCIES');
  if(volumeMismatchDates)add(reasons,'VOLUME_DISCREPANCIES');
  // This warning is ALWAYS present. A second file and declared vendor
  // name do not constitute an independent proof of source independence.
  add(reasons,'SOURCE_INDEPENDENCE_AND_AUTHENTICITY_NOT_ESTABLISHED');

  const structuralDifferences=onlyA+onlyB+ohlcMismatchDates+volumeMismatchDates;
  const finding=a.byteSha256===b.byteSha256
    ?'DUPLICATE_INPUT_NOT_INDEPENDENT'
    :common<60?'INSUFFICIENT_OVERLAP'
      :structuralDifferences||a.priceAdjustment!==b.priceAdjustment||
       a.adjustmentMethodDeclared!==b.adjustmentMethodDeclared
        ?'DISCREPANCIES_REQUIRE_MANUAL_REVIEW'
        :'LOCAL_RECORDS_AGREE_AUTHENTICITY_UNVERIFIED';

  return Object.freeze({
    schema:'project9-offline-cross-source-provenance-audit-v1',
    scope:'TWO_UNTRUSTED_LOCAL_HISTORICAL_FILES',
    reviewCutoff:asOf,
    status:finding,
    thresholds:Object.freeze({
      maxAcceptedPriceDifferenceBps:PRICE_TOLERANCE_BPS,
      maxAcceptedVolumeDifferencePct:VOLUME_TOLERANCE_PCT,
      minCommonDatesForComparison:60
    }),
    primary:a,witness:b,
    overlap:Object.freeze({
      commonDates:common,
      onlyPrimaryDates:onlyA,
      onlyWitnessDates:onlyB,
      priceDiscrepancyDates:ohlcMismatchDates,
      volumeDiscrepancyDates:volumeMismatchDates,
      maxOhlcDifferenceBps:fixed(maxOhlcDifferenceBps),
      maxVolumeDifferencePct:fixed(maxVolumeDifferencePct),
      allBarDatesMatched:onlyA===0&&onlyB===0
    }),
    discrepancySamples:Object.freeze(discrepancySamples),
    reviewReasons:Object.freeze(reasons),
    verification:Object.freeze({
      rawFileHashesCalculated:true,
      dateAlignedBarComparison:true,
      sourceIndependenceAuthenticated:false,
      historicalAuthenticityIndependentlyVerified:false,
      pointInTimeAvailabilityIndependentlyVerified:false,
      corporateActionsIndependentlyVerified:false,
      dataLicensingIndependentlyVerified:false,
      authenticBrokerFillsObserved:false,
      realOrdersCreated:0,
      blockchainTransactionsBroadcast:0,
      externalCalls:0,
      productionGate:'NO_GO'
    })
  });
}

export function renderLocalHistoricalComparisonMarkdown(report){
  if(report?.schema!=='project9-offline-cross-source-provenance-audit-v1'||
     report?.verification?.productionGate!=='NO_GO'||
     report.verification.historicalAuthenticityIndependentlyVerified!==false||
     report.verification.sourceIndependenceAuthenticated!==false)
    fail('cannot render unsafe or unrelated comparison report');
  const x=report.overlap;
  return [
    '# StarNet — Historical Source Comparison',
    '',
    '**'+report.status+' — PRODUCTION NO_GO**',
    '',
    '| Input | Declared source label | Bars | SHA-256 |',
    '|---|---|---:|---|',
    '| Primary | '+report.primary.declaredSourceLabel.replaceAll('|','/')+' | '+report.primary.observedBars+' | \x60'+report.primary.byteSha256+'\x60 |',
    '| Witness | '+report.witness.declaredSourceLabel.replaceAll('|','/')+' | '+report.witness.observedBars+' | \x60'+report.witness.byteSha256+'\x60 |',
    '',
    'Review cutoff: '+report.reviewCutoff+'.',
    'Common dates: '+x.commonDates+'. Missing from witness: '+x.onlyPrimaryDates+
      '. Missing from primary: '+x.onlyWitnessDates+'.',
    'OHLC discrepancy dates: '+x.priceDiscrepancyDates+
      '. Volume discrepancy dates: '+x.volumeDiscrepancyDates+'.',
    '',
    '## Review reasons',
    ...report.reviewReasons.map(item=>'- '+item),
    '',
    '**Local agreement is NOT independently authenticated history.** Source names, retrieval timestamps, data rights, corporate-action claims and point-in-time availability remain unverified declarations.',
    '',
    '**No live orders, brokerage, wallets, blockchain transfers or automatic promotion.**'
  ].join('\n')+'\n';
}
