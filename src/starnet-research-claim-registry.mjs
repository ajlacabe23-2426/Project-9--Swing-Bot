/**
 * Phase 15 — offline research claim registry and separate local review notes.
 *
 * Every supported claim is derived from a Phase 14 bundle independently
 * reproduced from the ORIGINAL local bytes and local methodology hash.
 * A user-supplied review label is never an authenticated external reviewer.
 * No actual trading, network, broker, wallet or blockchain activity.
 */
import {createHash} from 'node:crypto';
import {verifyStarNetResearchReproducibility} from './starnet-offline-reproducibility.mjs';

const fail=reason=>{throw new TypeError('StarNet research claims refused: '+reason);};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const SHA=/^[a-f0-9]{64}$/;
const ZERO='0'.repeat(64);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,expected)=>object(value)&&Object.keys(value).length===expected.length&&
  expected.every(key=>Object.hasOwn(value,key));
const nonEmpty=value=>typeof value==='string'&&value.length>=3&&value.length<=80&&
  /^[A-Z0-9][A-Z0-9_-]*$/.test(value);
const ACTIONS=new Set(['ACKNOWLEDGE_LOCAL_CALCULATION','DISPUTE_CLAIM','REQUEST_EXTERNAL_EVIDENCE']);
const REASONS=new Set(['LOCAL_CALCULATION_RECHECKED','INSUFFICIENT_EVIDENCE',
  'SOURCE_ORIGIN_UNVERIFIED','METHODOLOGY_REVIEW_NEEDED','CONFLICTING_EVIDENCE']);
const LOCAL_ONLY='SUPPORTED_LOCAL_CALCULATION_ONLY';

function assertResearchBoundary(record){
  if(!record||record.release?.productionGate!=='NO_GO'||
     record.release.realOrdersCreated!==0||
     record.release.blockchainTransactionsBroadcast!==0||
     record.release.externalCalls!==0||
     record.release.liveTradingEnabled!==false||
     record.methodology?.externalCodeSignatureVerified!==false||
     record.evidenceGaps?.independentHistoricalSourceAuthenticity!=='NOT_VERIFIED'||
     record.evidenceGaps?.independentThirdPartyReproduction!=='NOT_PERFORMED')
    fail('reproduction record contains unsafe or incorrectly promoted evidence');
}
function claim(claimId,kind,status,description,observed,record,requiredEvidence){
  return Object.freeze({
    claimId,kind,status,description,observed,
    evidence:Object.freeze({
      originalInputSha256:record.inputs.historicalDataSha256,
      originalMethodologySha256:record.methodology.localSourceCodeSha256,
      reproducedResultSha256:record.resultIdentity.resultSha256,
      reproductionBundleSha256:record.bundleSha256
    }),
    requiredEvidence:Object.freeze(requiredEvidence),
    independentlyAuthenticated:false,
    productionGate:'NO_GO'
  });
}

/**
 * Requires the actual original bytes and unchanged code fingerprint.
 * Passing does not authenticate the historic data, source labels or human.
 */
export function buildStarNetResearchClaimRegistry({
  reproductionRecord,originalInputs
}={}){
  assertResearchBoundary(reproductionRecord);
  const result=verifyStarNetResearchReproducibility(reproductionRecord,originalInputs);
  if(result.finding!=='EXACT_LOCAL_REPRODUCTION'||
     result.originalInputFilesRechecked!==true||
     result.methodologyBytesRechecked!==true||
     result.independentMarketAuthenticityVerified!==false||
     result.productionGate!=='NO_GO')
    fail('Phase 14 local reproduction evidence is incomplete');
  const d=reproductionRecord.resultIdentity?.descriptive;
  if(!d||!Array.isArray(d.chronologicalPhases)||d.chronologicalPhases.length!==3||
     d.chronologicalPhases[2]?.phase!=='CHRONOLOGICAL_HOLDOUT')
    fail('missing fixed research study partitions');
  const holdout=d.chronologicalPhases[2].strategyClosedWindows;
  if(!Number.isSafeInteger(holdout)||holdout<0)
    fail('invalid descriptive holdout count');
  const floor=20; // Phase 13 descriptive review cue, not statistical power.
  const claims=[
    claim('SIM-CLAIM-LOCAL-REPRODUCTION','LOCAL_REPRODUCIBILITY',LOCAL_ONLY,
      'Same permitted input bytes and local methodology reproduced the same descriptive result',
      {reproducedResultSha256:result.resultSha256},reproductionRecord,
      ['ORIGINAL_INPUT_BYTES','SAME_LOCAL_CODE_FINGERPRINT']),
    claim('SIM-CLAIM-BAR-COUNT','HISTORICAL_BAR_COUNT',LOCAL_ONLY,
      'A local parser counted the historical observations; market authenticity not established',
      {count:d.historicalBars},reproductionRecord,['SOURCE_ORIGIN_AUTHENTICATION']),
    claim('SIM-CLAIM-CHRONOLOGY','CHRONOLOGICAL_PARTITIONS',LOCAL_ONLY,
      'Frozen contiguous partition construction was recomputed from local historical observations',
      {completedBars:d.chronologicalPhases.map(p=>p.completedBars)},reproductionRecord,
      ['POINT_IN_TIME_DATA_AVAILABILITY']),
    claim('SIM-CLAIM-HOLDOUT','HOLDOUT_SAMPLE_ADVISORY',
      holdout<floor?'INSUFFICIENT_DESCRIPTIVE_OBSERVATIONS':'REFERENCE_FLOOR_ONLY_NOT_VALIDATED',
      'A descriptive count compared to a non-statistical reference floor cannot prove predictive skill',
      {observations:holdout,descriptiveReferenceFloor:floor},reproductionRecord,
      ['INDEPENDENT_SAMPLE_POWER_AND_DEPENDENCE_REVIEW']),
    claim('SIM-CLAIM-SOURCE-AUTHENTICITY','SOURCE_AUTHENTICITY','NOT_VERIFIED',
      'File fingerprints and matching local source labels do not independently authenticate a market archive',
      {sourceKind:reproductionRecord.sourceKind},reproductionRecord,
      ['AUTHENTICATED_THIRD_PARTY_SOURCE_EVIDENCE']),
    claim('SIM-CLAIM-CORPORATE-ACTIONS','CORPORATE_ACTIONS','NOT_VERIFIED',
      'Local notice and adjustment declarations are not authenticated issuer events',
      {custodyStatus:d.custodyStatus},reproductionRecord,
      ['INDEPENDENT_ISSUER_AND_CORPORATE_ACTION_RECORDS']),
    claim('SIM-CLAIM-DATA-RIGHTS','DATA_RIGHTS','NOT_VERIFIED',
      'Local documentation does not establish legally permitted market-data use or redistribution',
      {dataRightsStatus:'NOT_VERIFIED'},reproductionRecord,
      ['INDEPENDENT_TERMS_AND_DATA_RIGHTS_REVIEW']),
    claim('SIM-CLAIM-PREDICTIVE-EFFICACY','PREDICTIVE_EFFICACY','NOT_ESTABLISHED',
      'A descriptive chronological split is not independent out-of-sample predictive evidence',
      {independentStatisticalPowerEstablished:false},reproductionRecord,
      ['INDEPENDENT_POINT_IN_TIME_HOLDOUT_AND_STATISTICAL_REVIEW']),
    claim('SIM-CLAIM-EXTERNAL-REVIEW','INDEPENDENT_EXTERNAL_REVIEW','NOT_PERFORMED',
      'No independently authenticated external reviewer has approved this research',
      {externalReviewCompleted:false},reproductionRecord,
      ['IDENTITY_VERIFIED_EXTERNAL_REVIEWER_REPORT'])
  ];
  const body={
    schema:'project9-offline-research-claim-registry-v1',
    scope:'UNTRUSTED_LOCAL_RESEARCH_ONLY',
    sourceReproductionBundleSha256:reproductionRecord.bundleSha256,
    sourceResultSha256:result.resultSha256,
    sourceInputSha256:reproductionRecord.inputs.historicalDataSha256,
    sourceMethodologySha256:reproductionRecord.methodology.localSourceCodeSha256,
    claims,
    supportedLocalCalculationClaims:claims.filter(c=>c.status===LOCAL_ONLY).length,
    missingOrLimitedEvidenceClaims:claims.filter(c=>c.status!==LOCAL_ONLY).length,
    reviewerAuthentication:'NOT_PERFORMED',
    independentExternalReview:'NOT_PERFORMED',
    realOrdersCreated:0,
    externalCalls:0,
    blockchainTransactionsBroadcast:0,
    productionGate:'NO_GO'
  };
  return Object.freeze({...body,registrySha256:hash(body)});
}
function checkRegistry(registry){
  if(!registry||registry.schema!=='project9-offline-research-claim-registry-v1'||
     registry.productionGate!=='NO_GO'||registry.independentExternalReview!=='NOT_PERFORMED'||
     registry.reviewerAuthentication!=='NOT_PERFORMED'||
     registry.realOrdersCreated!==0||registry.externalCalls!==0||
     registry.blockchainTransactionsBroadcast!==0||
     !SHA.test(registry.registrySha256)||
     !Array.isArray(registry.claims)||registry.claims.length!==9||
     registry.claims.some(x=>x.independentlyAuthenticated!==false||x.productionGate!=='NO_GO'))
    fail('invalid or promoted claim registry');
  const {registrySha256,...body}=registry;
  if(hash(body)!==registrySha256)fail('claim registry changed since its local fingerprint');
}
export function newStarNetResearchReviewLedger(registry){
  checkRegistry(registry);
  return Object.freeze({
    schema:'project9-local-research-review-ledger-v1',
    scope:'UNAUTHENTICATED_LOCAL_REVIEW_NOTES',
    registrySha256:registry.registrySha256,
    entries:Object.freeze([]),headHash:ZERO,
    reviewIdentityVerified:false,
    independentlyAuthenticatedReviewer:false,
    approvalsPromoteClaimStatus:false,
    productionGate:'NO_GO'
  });
}
export function replayStarNetResearchReviewLedger(registry,ledger){
  checkRegistry(registry);
  if(!keys(ledger,['schema','scope','registrySha256','entries','headHash',
    'reviewIdentityVerified','independentlyAuthenticatedReviewer',
    'approvalsPromoteClaimStatus','productionGate'])||
    ledger.schema!=='project9-local-research-review-ledger-v1'||
    ledger.scope!=='UNAUTHENTICATED_LOCAL_REVIEW_NOTES'||
    ledger.registrySha256!==registry.registrySha256||
    ledger.reviewIdentityVerified!==false||
    ledger.independentlyAuthenticatedReviewer!==false||
    ledger.approvalsPromoteClaimStatus!==false||
    ledger.productionGate!=='NO_GO'||
    !Array.isArray(ledger.entries)||ledger.entries.length>200||
    !SHA.test(ledger.headHash))
    fail('invalid or promoted local review ledger');
  let previous=ZERO;
  const seen=new Set(),validIds=new Set(registry.claims.map(c=>c.claimId));
  for(let i=0;i<ledger.entries.length;i++){
    const entry=ledger.entries[i];
    if(!keys(entry,['sequence','previousHash','note','hash'])||
       entry.sequence!==i+1||entry.previousHash!==previous||!SHA.test(entry.hash))
      fail('review hash chain or sequence is invalid');
    const note=entry.note;
    if(!keys(note,['noteId','claimId','action','reviewerLabel','reasonCode'])||
       !nonEmpty(note.noteId)||!note.noteId.startsWith('SIM-NOTE-')||
       !validIds.has(note.claimId)||!ACTIONS.has(note.action)||
       !nonEmpty(note.reviewerLabel)||!note.reviewerLabel.startsWith('LOCAL-REVIEWER-')||
       !REASONS.has(note.reasonCode)||seen.has(note.noteId))
      fail('review note violates strict local-only schema or has duplicate ID');
    const claim=registry.claims.find(c=>c.claimId===note.claimId);
    if(note.action==='ACKNOWLEDGE_LOCAL_CALCULATION'&&
       (claim.status!==LOCAL_ONLY||note.reasonCode!=='LOCAL_CALCULATION_RECHECKED'))
      fail('a local acknowledgment cannot approve unverified or insufficient claims');
    if(note.action!=='ACKNOWLEDGE_LOCAL_CALCULATION'&&
       note.reasonCode==='LOCAL_CALCULATION_RECHECKED')
      fail('reason does not match review decision');
    const expected=hash([entry.sequence,previous,note,ledger.registrySha256]);
    if(entry.hash!==expected)fail('review note content changed or hash chain invalid');
    previous=expected;seen.add(note.noteId);
  }
  if(previous!==ledger.headHash)fail('review ledger head does not match entries');
  return Object.freeze({noteCount:ledger.entries.length,headHash:previous,
    localReviewerIdentitiesAuthenticated:false,
    independentApprovalRecorded:false,productionGate:'NO_GO'});
}
export function appendStarNetResearchReviewNote(registry,ledger,note){
  replayStarNetResearchReviewLedger(registry,ledger);
  if(ledger.entries.length>=200)fail('review note fixture cap reached');
  const sequence=ledger.entries.length+1;
  const entry={sequence,previousHash:ledger.headHash,note,
    hash:hash([sequence,ledger.headHash,note,ledger.registrySha256])};
  const next={
    ...ledger,
    entries:[...ledger.entries,entry],headHash:entry.hash
  };
  replayStarNetResearchReviewLedger(registry,next);
  return Object.freeze(next);
}
export function buildStarNetResearchClaimReviewReport(registry,ledger){
  const replay=replayStarNetResearchReviewLedger(registry,ledger);
  const claims=registry.claims.map(claim=>{
    const notes=ledger.entries.filter(x=>x.note.claimId===claim.claimId);
    return Object.freeze({
      claimId:claim.claimId,kind:claim.kind,status:claim.status,
      observed:claim.observed,
      sourceReproductionBundleSha256:claim.evidence.reproductionBundleSha256,
      neededEvidence:claim.requiredEvidence,
      localReviewNotes:notes.length,
      lastLocalReviewAction:notes.length?notes.at(-1).note.action:null,
      independentReviewerVerified:false,
      statusChangedByLocalReview:false
    });
  });
  return Object.freeze({
    schema:'project9-offline-claim-review-report-v1',
    status:'LOCAL_CALCULATIONS_ONLY_INDEPENDENT_REVIEW_NOT_PERFORMED',
    registrySha256:registry.registrySha256,
    localReviewLedgerHeadSha256:replay.headHash,
    localNoteCount:replay.noteCount,
    claims:Object.freeze(claims),
    localNotesAreUnverifiedDeclarations:true,
    independentlyAuthenticatedExternalReview:false,
    predictiveEfficacyEstablished:false,
    marketDataAuthenticityEstablished:false,
    productionGate:'NO_GO'
  });
}
export function renderStarNetClaimReviewMarkdown(report){
  if(!report||report.schema!=='project9-offline-claim-review-report-v1'||
     report.productionGate!=='NO_GO'||report.independentlyAuthenticatedExternalReview!==false||
     report.predictiveEfficacyEstablished!==false||
     !Array.isArray(report.claims)||report.claims.length!==9)
    fail('unsafe claim report for Markdown rendering');
  return [
    '# StarNet — Phase 15 Claim Verification',
    '',
    '**Offline evidence only. Independent source and reviewer authenticity are NOT VERIFIED. Production NO_GO.**',
    '',
    '| Claim | Evidence status | Local notes |',
    '|---|---|---:|',
    ...report.claims.map(c=>'| '+c.kind+' | '+c.status+' | '+c.localReviewNotes+' |'),
    '',
    '## Evidence and review boundaries',
    '',
    '- Research record fingerprint: \x60'+report.registrySha256+'\x60.',
    '- Local review notes: '+report.localNoteCount+'. Their author identities are **not authenticated**.',
    '- Local notes cannot promote unsupported claims or establish independent review.',
    '- Market-data authenticity, corporate actions, data rights and predictive reliability remain unverified.',
    '- No real broker orders, wallet transactions or automatic production promotion.'
  ].join('\n')+'\n';
}
