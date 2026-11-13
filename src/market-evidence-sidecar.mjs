import {createHash} from 'node:crypto';
import {normalizeMarketDataset,isStrictISODate} from './market-intelligence.mjs';

export const EVIDENCE_SCHEMA='project9-market-evidence-sidecar-v1';
const SHA=/^[a-f0-9]{64}$/;
const MIC=/^[A-Z0-9]{4}$/;
const safeText=value=>typeof value==='string'&&value.trim().length>=2&&value.length<=120&&
  !/[\r\n]/.test(value)&&!/(?:https?:\/\/|api[_-]?key|bearer |token=)/i.test(value);
const sha=value=>createHash('sha256').update(value).digest('hex');
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function canonicalInstant(value){
  return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&
    Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
}
const allSha=(obj,keys)=>isObject(obj)&&keys.every(k=>SHA.test(obj[k]??''));
const requiredText=(obj,keys)=>isObject(obj)&&keys.every(k=>safeText(obj[k]));
const providerIdentity=value=>typeof value==='string'?value.trim().replace(/\s+/g,' ').toLowerCase():'';
const timesBefore=(sidecar,decisionAt)=>['availableAt','knownAt'].every(k=>
  canonicalInstant(sidecar.timeline?.[k])&&sidecar.timeline[k]<=decisionAt);

/**
 * Read-only first-stage evidence inspection. This is NOT an authenticator:
 * self-declared evidence, hashes and reviewer names cannot grant acceptance.
 */
export function assessMarketEvidence({datasetBytes,sidecar=null,decisionAt}={}){
  if(!canonicalInstant(decisionAt))throw new Error('Explicit canonical decisionAt is required');
  if(!(typeof datasetBytes==='string'||Buffer.isBuffer(datasetBytes)))
    throw new Error('Raw dataset bytes required');
  const bytes=Buffer.from(datasetBytes);
  if(bytes.length===0||bytes.length>2_000_000)throw new Error('Dataset must be 1–2000000 bytes');
  const input=JSON.parse(bytes.toString('utf8'));
  const dataset=normalizeMarketDataset(input);
  const digest=sha(bytes);
  const reasons=[];
  if(dataset.sourceAsOf>decisionAt.slice(0,10))reasons.push('SOURCE_AS_OF_AFTER_DECISION');
  if(!dataset.provenance.retrievedAt)reasons.push('DATASET_RETRIEVAL_TIMESTAMP_MISSING');
  else if(dataset.provenance.retrievedAt>decisionAt)reasons.push('DATASET_RETRIEVED_AFTER_DECISION');
  if(!isObject(sidecar)){
    reasons.push('MISSING_EVIDENCE_SIDECAR');
  }else{
    if(sidecar.schema!==EVIDENCE_SCHEMA)reasons.push('UNSUPPORTED_EVIDENCE_SCHEMA');
    if(sidecar.datasetSha256!==digest)reasons.push('RAW_DATASET_SHA_MISMATCH');
    if(sidecar.symbol!==dataset.symbol||sidecar.currency!==dataset.currency||
      !safeText(sidecar.securityId)||!MIC.test(sidecar.venueMic??'')||
      sidecar.units!=='SHARES')reasons.push('INSTRUMENT_IDENTITY_INCOMPLETE');
    if(!requiredText(sidecar.provider,['name','product','parserVersion','transformVersion'])||
      !allSha(sidecar.provider,['requestSha256','responseSha256']))
      reasons.push('PROVIDER_REQUEST_RESPONSE_IDENTITY_INCOMPLETE');
    if(!isObject(sidecar.timeline)||!['acquiredAt','availableAt','knownAt'].every(k=>
      canonicalInstant(sidecar.timeline[k])))reasons.push('EVIDENCE_TIMELINE_INVALID');
    else{
      if(!timesBefore(sidecar,decisionAt))reasons.push('EVIDENCE_NOT_KNOWN_AT_DECISION');
      if(sidecar.timeline.acquiredAt>decisionAt)reasons.push('ACQUIRED_AFTER_DECISION');
      if(sidecar.timeline.availableAt>sidecar.timeline.acquiredAt||
        sidecar.timeline.acquiredAt>sidecar.timeline.knownAt||
        sidecar.timeline.availableAt.slice(0,10)<dataset.sourceAsOf)
        reasons.push('EVIDENCE_TIMELINE_INCONSISTENT');
      if(dataset.provenance.retrievedAt&&
        sidecar.timeline.acquiredAt!==dataset.provenance.retrievedAt)
        reasons.push('DATASET_ACQUISITION_TIMESTAMP_MISMATCH');
    }
    if(!Array.isArray(sidecar.rights)||!sidecar.rights.some(r=>isObject(r)&&
      r.scope==='PRIVATE_RESEARCH'&&SHA.test(r.documentSha256??'')&&
      isStrictISODate(r.validFrom)&&isStrictISODate(r.validThrough)&&
      r.validFrom<=decisionAt.slice(0,10)&&r.validThrough>=decisionAt.slice(0,10)))
      reasons.push('DATED_PRIVATE_RESEARCH_RIGHTS_MISSING');
    if(!isObject(sidecar.reconciliation)||!safeText(sidecar.reconciliation.independentProvider)||
      providerIdentity(sidecar.reconciliation.independentProvider)===providerIdentity(sidecar.provider?.name)||
      !SHA.test(sidecar.reconciliation.reportSha256??'')||
      sidecar.reconciliation.discrepanciesResolved!==true)
      reasons.push('INDEPENDENT_RECONCILIATION_UNPROVEN');
    if(!isObject(sidecar.adjustments)||!SHA.test(sidecar.adjustments.ledgerSha256??'')||
      !safeText(sidecar.adjustments.basis)||!safeText(sidecar.adjustments.methodology))
      reasons.push('CORPORATE_ACTION_LEDGER_UNPROVEN');
    if(!isObject(sidecar.universe)||!SHA.test(sidecar.universe.membershipSha256??'')||
      !canonicalInstant(sidecar.universe.knownAt)||sidecar.universe.knownAt>decisionAt)
      reasons.push('PIT_UNIVERSE_MEMBERSHIP_UNPROVEN');
    if(!requiredText(sidecar.reviewer,['name','reasonCode'])||
      !canonicalInstant(sidecar.reviewer?.reviewedAt))
      reasons.push('REVIEWER_RECORD_MISSING');
    if('status' in sidecar||'verified' in sidecar)reasons.push('SELF_ASSERTED_VERIFICATION_IGNORED');
  }
  if(/synthetic|fictitious|invented|\bdemo\b|\bgenerated\b|\bsimulated\b/i.test(dataset.source))reasons.push('SYNTHETIC_DATA');
  const reasonCodes=[...new Set(reasons)].sort();
  const retrospectiveReasons=new Set(['ACQUIRED_AFTER_DECISION','DATASET_RETRIEVED_AFTER_DECISION']);
  return {
    schema:'project9-market-evidence-preflight-v1',
    symbol:dataset.symbol,rawDatasetSha256:digest,
    decisionAt,sourceAsOf:dataset.sourceAsOf,
    status:reasonCodes.some(reason=>!retrospectiveReasons.has(reason))?'QUARANTINED':
      reasonCodes.length?'RETROSPECTIVE_UNVERIFIED_PIT':'EVIDENCE_REVIEW_PENDING',
    reasonCodes,
    dataAuthenticityVerified:false,
    researchAccepted:false,
    alertEligible:false,
    brokerConnected:false,
    realOrdersAllowed:false,
    interpretation:'Offline identity and consistency preflight only. No independent authentication, data-rights certification, PIT approval or alert promotion.'
  };
}
