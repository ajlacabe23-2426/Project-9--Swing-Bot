/**
 * Local-only custody-reference auditor for UNTRUSTED historical datasets.
 * A matching hash proves local byte identity, not vendor authenticity.
 * References, event dates, capture times and rights are declarations unless
 * separately corroborated outside this program.
 * No network, provider, brokerage, wallet, account or execution path.
 */
import {createHash} from 'node:crypto';
import {normalizeMarketDataset,isStrictISODate} from './market-intelligence.mjs';

const reject=reason=>{throw new TypeError('StarNet offline custody evidence refused: '+reason);};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;
const exact=(value,fields)=>obj(value)&&
  Reflect.ownKeys(value).length===fields.length&&fields.every(k=>Object.hasOwn(value,k));
const nonempty=x=>typeof x==='string'&&x.length>=3&&x.length<=80&&
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(x);
const digest=x=>createHash('sha256').update(x).digest('hex');
const SHA=/^[a-f0-9]{64}$/;
const MAX_BYTES=2_500_000;
const TYPES=new Set(['ARCHIVE_SNAPSHOT','CORPORATE_ACTION_NOTICE','LICENSE_TERMS']);
const ACTIONS=new Set(['SPLIT','DIVIDEND','MERGER','SPINOFF']);
const CLAIMED_SOURCES=new Set(['ENGINEERED_OFFLINE_FIXTURE','USER_SUPPLIED_UNVERIFIED_JSON']);
const METHOD=new Set(['ENGINEERED_FIXTURE','OPERATOR_LOCAL_COPY']);
const epoch=iso=>{
  if(typeof iso!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(iso))return null;
  const ms=Date.parse(iso);
  return Number.isFinite(ms)&&new Date(ms).toISOString()===iso?ms:null;
};
function validateBytes(bytes,label){
  if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>MAX_BYTES)
    reject(label+' must be 1 to 2.5MB of explicitly supplied local JSON bytes');
  try{return JSON.parse(bytes.toString('utf8'));}
  catch{reject(label+' must be valid JSON');}
}
const day=x=>x.slice(0,10);
const early=(a,b)=>Date.parse(a)<=Date.parse(b);
function lookupReferences(refs){
  const found=new Map();
  for(const item of refs){
    if(!exact(item,['referenceId','kind','sha256','claimedPublishedAt'])||
      !nonempty(item.referenceId)||!TYPES.has(item.kind)||
      !SHA.test(item.sha256)||epoch(item.claimedPublishedAt)===null)
      reject('malformed source reference or unknown reference kind');
    if(found.has(item.referenceId))reject('duplicate source reference ID');
    found.set(item.referenceId,item);
  }
  return found;
}
function requireRef(map,id,kind){
  if(!nonempty(id)||!map.has(id)||map.get(id).kind!==kind)
    reject('missing or mismatched '+kind+' reference ID');
  return map.get(id);
}
function validateActions(actions,refs,first,last,cutoff,capturedAt){
  if(!exact(actions,['status','records'])||!Array.isArray(actions.records)||
    actions.records.length>100)
    reject('invalid corporate action reference section');
  if(!['NOT_ASSESSED','NO_EVENTS_DECLARED','REFERENCES_DECLARED'].includes(actions.status))
    reject('invalid corporate action status');
  if(actions.status==='REFERENCES_DECLARED'&&actions.records.length===0)
    reject('corporate action references declared but none supplied');
  if(actions.status!=='REFERENCES_DECLARED'&&actions.records.length!==0)
    reject('corporate action records contradict their section status');
  let previous='',laterThanEffective=0;
  for(const record of actions.records){
    if(!exact(record,['eventId','eventDate','kind','referenceId','claimedAvailableAt'])||
      !nonempty(record.eventId)||!isStrictISODate(record.eventDate)||
      record.eventDate<first||record.eventDate>last||!ACTIONS.has(record.kind)||
      epoch(record.claimedAvailableAt)===null)
      reject('invalid corporate action event, date, or reference');
    if(record.eventDate<previous)reject('corporate action events not chronological');
    previous=record.eventDate;
    const ref=requireRef(refs,record.referenceId,'CORPORATE_ACTION_NOTICE');
    if(!early(ref.claimedPublishedAt,cutoff+'T23:59:59.999Z')||
      !early(record.claimedAvailableAt,cutoff+'T23:59:59.999Z')||
      !early(record.claimedAvailableAt,capturedAt))
      reject('corporate action evidence claims future availability');
    if(day(record.claimedAvailableAt)>record.eventDate)laterThanEffective++;
  }
  return laterThanEffective;
}

/**
 * All verification is structural and local. Even apparently complete
 * references cannot assert independent authentication.
 */
export function auditStarNetOfflineCustody({
  marketBytes,manifestBytes,asOf,sourceKind
}={}){
  if(!CLAIMED_SOURCES.has(sourceKind)||!isStrictISODate(asOf))
    reject('explicit permitted source kind and valid review cutoff required');
  const dataset=normalizeMarketDataset(validateBytes(marketBytes,'dataset'));
  const manifest=validateBytes(manifestBytes,'manifest');
  if(!exact(manifest,['schema','scope','dataset','capture','references','corporateActions','rights'])||
    manifest.schema!=='project9-offline-history-custody-manifest-v1'||
    manifest.scope!=='UNTRUSTED_LOCAL_RESEARCH_ARTIFACTS')
    reject('exact untrusted custody manifest schema and fields required');
  if(!exact(manifest.dataset,['sha256','symbol','currency','sourceAsOf','declaredSource'])||
    !SHA.test(manifest.dataset.sha256)||manifest.dataset.sha256!==digest(marketBytes)||
    manifest.dataset.symbol!==dataset.symbol||
    manifest.dataset.currency!==dataset.currency||
    manifest.dataset.sourceAsOf!==dataset.sourceAsOf||
    manifest.dataset.declaredSource!==dataset.source)
    reject('manifest file identity differs from exact historical dataset bytes or metadata');
  if(dataset.bars.at(-1).date>asOf||dataset.sourceAsOf>asOf)
    reject('dataset contains future observations relative to review cutoff');

  if(!exact(manifest.capture,['method','claimedCapturedAt','snapshotReferenceId'])||
    !METHOD.has(manifest.capture.method)||
    epoch(manifest.capture.claimedCapturedAt)===null)
    reject('invalid acquisition method or capture timestamp');
  if(sourceKind==='ENGINEERED_OFFLINE_FIXTURE'&&
     manifest.capture.method!=='ENGINEERED_FIXTURE'||
     sourceKind==='USER_SUPPLIED_UNVERIFIED_JSON'&&
     manifest.capture.method!=='OPERATOR_LOCAL_COPY')
    reject('capture acquisition method contradicts input class');
  const capturedAt=manifest.capture.claimedCapturedAt;
  if(day(capturedAt)<dataset.sourceAsOf||day(capturedAt)>asOf)
    reject('claimed capture timestamp outside source and review boundary');
  if(dataset.provenance.retrievedAt&&
     Date.parse(dataset.provenance.retrievedAt)>Date.parse(capturedAt))
    reject('dataset declared retrieval timestamp after claimed capture');

  if(!Array.isArray(manifest.references)||manifest.references.length<1||
     manifest.references.length>100)
    reject('manifest must contain 1–100 local reference records');
  const refs=lookupReferences(manifest.references);
  const snapshot=requireRef(refs,manifest.capture.snapshotReferenceId,'ARCHIVE_SNAPSHOT');
  if(!early(snapshot.claimedPublishedAt,capturedAt))
    reject('claimed archive published after claimed capture');
  for(const item of refs.values()){
    if(!early(item.claimedPublishedAt,asOf+'T23:59:59.999Z'))
      reject('source reference claims publication after the review cutoff');
  }

  if(!exact(manifest.rights,['status','referenceId'])||
     !['NOT_VERIFIED','TERMS_REFERENCE_DECLARED'].includes(manifest.rights.status))
    reject('invalid data-rights evidence declaration');
  if(manifest.rights.status==='TERMS_REFERENCE_DECLARED')
    requireRef(refs,manifest.rights.referenceId,'LICENSE_TERMS');
  else if(manifest.rights.referenceId!==null)
    reject('rights NOT_VERIFIED cannot include a license reference');

  const laterThanEffective=validateActions(
    manifest.corporateActions,refs,dataset.bars[0].date,
    dataset.bars.at(-1).date,asOf,capturedAt);

  const warnings=[];
  if(manifest.rights.status==='NOT_VERIFIED')warnings.push('DATA_RIGHTS_NOT_VERIFIED');
  if(manifest.corporateActions.status==='NOT_ASSESSED')
    warnings.push('CORPORATE_ACTIONS_NOT_ASSESSED');
  if(manifest.corporateActions.status==='NO_EVENTS_DECLARED')
    warnings.push('NO_CORPORATE_ACTIONS_IS_SELF_DECLARED');
  if(laterThanEffective)warnings.push('ACTION_NOTICES_POSTDATE_EFFECTIVE_DATE');
  if(dataset.priceAdjustment==='VENDOR_ADJUSTED'&&
     manifest.corporateActions.status!=='REFERENCES_DECLARED')
    warnings.push('ADJUSTED_PRICES_WITHOUT_ACTION_REFERENCES');
  // This warning never disappears because links and claimed timestamps
  // do not constitute third-party signatures, an archive API or legal review.
  warnings.push('REFERENCE_ORIGIN_AND_PIT_NOT_INDEPENDENTLY_AUTHENTICATED');

  return Object.freeze({
    schema:'project9-offline-custody-evidence-audit-v1',
    scope:'UNTRUSTED_LOCAL_FILES_ONLY',
    reviewCutoff:asOf,
    status:warnings.length>1?'REVIEW_REQUIRED':'DECLARATIONS_CONSISTENT_AUTHENTICITY_UNVERIFIED',
    dataset:Object.freeze({
      symbol:dataset.symbol,sourceAsOf:dataset.sourceAsOf,
      inputSha256:digest(marketBytes),
      firstCompletedBar:dataset.bars[0].date,
      lastCompletedBar:dataset.bars.at(-1).date,
      observedBars:dataset.bars.length
    }),
    manifestSha256:digest(manifestBytes),
    declaredCapture:Object.freeze({...manifest.capture}),
    references:Object.freeze({
      total:manifest.references.length,
      archiveSnapshotCount:manifest.references.filter(x=>x.kind==='ARCHIVE_SNAPSHOT').length,
      actionNoticeCount:manifest.references.filter(x=>x.kind==='CORPORATE_ACTION_NOTICE').length,
      licenseTermsCount:manifest.references.filter(x=>x.kind==='LICENSE_TERMS').length,
      corporateActionRecords:manifest.corporateActions.records.length,
      actionNoticesAfterEventDate:laterThanEffective,
      rightsStatus:manifest.rights.status,
      corporateActionStatus:manifest.corporateActions.status
    }),
    reviewReasons:Object.freeze(warnings),
    verification:Object.freeze({
      exactLocalByteHashesMatch:true,
      declaredCaptureDateChronologicallyConsistent:true,
      localReferenceTypesAndDatesChecked:true,
      independentSourceAuthenticityVerified:false,
      pointInTimeAvailabilityIndependentlyVerified:false,
      corporateActionTruthVerified:false,
      termsOfUseIndependentlyReviewed:false,
      signedArchiveEvidenceVerified:false,
      realOrdersCreated:0,
      blockchainTransactionsBroadcast:0,
      externalCalls:0,
      productionGate:'NO_GO'
    })
  });
}
