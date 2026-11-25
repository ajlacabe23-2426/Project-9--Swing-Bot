import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateScenario} from '../src/synthetic-fixtures.mjs';
import {auditStarNetOfflineCustody} from '../src/starnet-offline-custody-evidence.mjs';
import {runEvidenceCli,parseEvidenceArgs} from '../scripts/starnet-three-level-evidence.mjs';

const hash=data=>createHash('sha256').update(data).digest('hex');
const invented=()=> {
  const bars=generateScenario(73,190),asOf=bars.at(-1).date;
  return {
    schema:'project9-market-data-v2',symbol:'SIM09',currency:'USD',
    source:'INVENTED CLASSROOM HISTORY - NOT PROVIDER RECORDS',
    mode:'HISTORICAL',sourceAsOf:asOf,priceAdjustment:'RAW',
    provenance:{
      retrievedAt:asOf+'T00:00:00.000Z',
      adjustmentMethod:'RAW_UNADJUSTED',
      corporateActions:'NOT_VERIFIED',
      survivorship:'NOT_ASSESSED',licensing:'NOT_VERIFIED'
    },bars
  };
};
const ref=(id,kind,date,body)=>({
  referenceId:id,kind,sha256:hash(Buffer.from(body)),
  claimedPublishedAt:date+'T09:00:00.000Z'
});
const pack=(data,marketBytes=Buffer.from(JSON.stringify(data)))=>({
  schema:'project9-offline-history-custody-manifest-v1',
  scope:'UNTRUSTED_LOCAL_RESEARCH_ARTIFACTS',
  dataset:{
    sha256:hash(marketBytes),symbol:data.symbol,currency:data.currency,
    sourceAsOf:data.sourceAsOf,declaredSource:data.source
  },
  capture:{
    method:'OPERATOR_LOCAL_COPY',
    claimedCapturedAt:data.sourceAsOf+'T12:00:00.000Z',
    snapshotReferenceId:'OFFLINE-ARCHIVE-001'
  },
  references:[ref('OFFLINE-ARCHIVE-001','ARCHIVE_SNAPSHOT',
    data.sourceAsOf,'DECLARED ONLY NOT ACTUAL ARCHIVE')],
  corporateActions:{status:'NOT_ASSESSED',records:[]},
  rights:{status:'NOT_VERIFIED',referenceId:null}
});
const audit=(data,manifest,asOf=data.sourceAsOf,bytes=Buffer.from(JSON.stringify(data)))=>
  auditStarNetOfflineCustody({
    marketBytes:bytes,manifestBytes:Buffer.from(JSON.stringify(manifest)),
    asOf,sourceKind:'USER_SUPPLIED_UNVERIFIED_JSON'
  });

test('local byte hash and declared capture/reference dates check without authenticating any provider',()=>{
  const data=invented(),bytes=Buffer.from(JSON.stringify(data)),m=pack(data,bytes);
  const before=JSON.stringify(m);
  const r=audit(data,m,data.sourceAsOf,bytes);
  assert.equal(r.schema,'project9-offline-custody-evidence-audit-v1');
  assert.equal(r.scope,'UNTRUSTED_LOCAL_FILES_ONLY');
  assert.equal(r.status,'REVIEW_REQUIRED');
  assert.equal(r.dataset.inputSha256,hash(bytes));
  assert.equal(r.manifestSha256,hash(Buffer.from(before)));
  assert.equal(r.dataset.observedBars,190);
  assert.equal(r.references.archiveSnapshotCount,1);
  assert.equal(r.references.actionNoticeCount,0);
  assert.equal(r.references.licenseTermsCount,0);
  assert.ok(r.reviewReasons.includes('DATA_RIGHTS_NOT_VERIFIED'));
  assert.ok(r.reviewReasons.includes('CORPORATE_ACTIONS_NOT_ASSESSED'));
  assert.ok(r.reviewReasons.includes('REFERENCE_ORIGIN_AND_PIT_NOT_INDEPENDENTLY_AUTHENTICATED'));
  assert.equal(r.verification.exactLocalByteHashesMatch,true);
  assert.equal(r.verification.declaredCaptureDateChronologicallyConsistent,true);
  assert.equal(r.verification.independentSourceAuthenticityVerified,false);
  assert.equal(r.verification.pointInTimeAvailabilityIndependentlyVerified,false);
  assert.equal(r.verification.corporateActionTruthVerified,false);
  assert.equal(r.verification.termsOfUseIndependentlyReviewed,false);
  assert.equal(r.verification.signedArchiveEvidenceVerified,false);
  assert.equal(r.verification.externalCalls,0);
  assert.equal(r.verification.realOrdersCreated,0);
  assert.equal(r.verification.productionGate,'NO_GO');
  assert.equal(JSON.stringify(m),before);
});

test('complete-looking action and licensing references can be internally consistent but never externally verified',()=>{
  const data=invented(),m=pack(data),eventDate=data.bars[80].date;
  m.references.push(ref('OFFLINE-ACTION-001','CORPORATE_ACTION_NOTICE',eventDate,'CLAIMED EVENT NOTICE'));
  m.references.push(ref('OFFLINE-LICENSE-001','LICENSE_TERMS',eventDate,'CLAIMED TERMS'));
  m.corporateActions={status:'REFERENCES_DECLARED',records:[{
    eventId:'FAKE-EVENT-001',eventDate,kind:'SPLIT',
    referenceId:'OFFLINE-ACTION-001',claimedAvailableAt:eventDate+'T10:00:00.000Z'
  }]};
  m.rights={status:'TERMS_REFERENCE_DECLARED',referenceId:'OFFLINE-LICENSE-001'};
  const r=audit(data,m);
  assert.equal(r.status,'DECLARATIONS_CONSISTENT_AUTHENTICITY_UNVERIFIED');
  assert.equal(r.references.corporateActionRecords,1);
  assert.equal(r.references.actionNoticeCount,1);
  assert.equal(r.references.licenseTermsCount,1);
  assert.equal(r.references.rightsStatus,'TERMS_REFERENCE_DECLARED');
  assert.equal(r.verification.corporateActionTruthVerified,false);
  assert.equal(r.verification.pointInTimeAvailabilityIndependentlyVerified,false);
  assert.equal(r.verification.termsOfUseIndependentlyReviewed,false);
  assert.equal(r.verification.productionGate,'NO_GO');
});

test('corporate action notice after event is visible but cannot prove point-in-time facts',()=>{
  const data=invented(),m=pack(data);
  const eventDate=data.bars[90].date, noticeDate=data.bars[92].date;
  m.references.push(ref('OFFLINE-ACTION-002','CORPORATE_ACTION_NOTICE',noticeDate,'POST EVENT ONLY'));
  m.corporateActions={status:'REFERENCES_DECLARED',records:[{
    eventId:'FAKE-EVENT-002',eventDate,kind:'DIVIDEND',
    referenceId:'OFFLINE-ACTION-002',
    claimedAvailableAt:noticeDate+'T10:00:00.000Z'
  }]};
  const result=audit(data,m);
  assert.equal(result.references.actionNoticesAfterEventDate,1);
  assert.ok(result.reviewReasons.includes('ACTION_NOTICES_POSTDATE_EFFECTIVE_DATE'));
  assert.equal(result.verification.pointInTimeAvailabilityIndependentlyVerified,false);
});

test('tampered bytes, filename-source mismatch and impossible chronology fail closed',()=>{
  const data=invented(),orig=Buffer.from(JSON.stringify(data)),m=pack(data,orig);
  const changed=Buffer.from(JSON.stringify({...data,source:'TAMPERED SOURCE'}));
  assert.throws(()=>auditStarNetOfflineCustody({
    marketBytes:changed,manifestBytes:Buffer.from(JSON.stringify(m)),
    asOf:data.sourceAsOf,sourceKind:'USER_SUPPLIED_UNVERIFIED_JSON'
  }),/manifest file identity/);
  for(const mutation of [
    x=>{x.dataset.sha256='a'.repeat(64);},
    x=>{x.dataset.symbol='OTHER';},
    x=>{x.dataset.sourceAsOf='2001-01-01';},
    x=>{x.capture.claimedCapturedAt='2000-01-01T10:00:00.000Z';},
    x=>{x.capture.claimedCapturedAt='2099-01-01T10:00:00.000Z';},
    x=>{x.capture.snapshotReferenceId='MISSING';},
    x=>{x.references[0].claimedPublishedAt='2099-01-01T00:00:00.000Z';},
    x=>{x.references[0].sha256='not-a-hash';},
    x=>{x.references.push(structuredClone(x.references[0]));},
    x=>{x.capture.method='BROKER_ACCOUNT';},
    x=>{x.apiKey='real-or-fake-password';},
    x=>{x.scope='LIVE';}
  ]){
    const bad=structuredClone(m);mutation(bad);
    assert.throws(()=>audit(data,bad),/refused/);
  }
  const badDate=new Date(data.sourceAsOf+'T00:00:00.000Z');
  badDate.setUTCDate(badDate.getUTCDate()-1);
  assert.throws(()=>audit(data,m,badDate.toISOString().slice(0,10)),/refused/);
});

test('action and rights references require exact types, local chronology and no credential payload',()=>{
  const data=invented(),m=pack(data);
  for(const mutation of [
    x=>{x.rights={status:'TERMS_REFERENCE_DECLARED',referenceId:'OFFLINE-ARCHIVE-001'};},
    x=>{x.rights={status:'NOT_VERIFIED',referenceId:'OFFLINE-ARCHIVE-001'};},
    x=>{x.corporateActions={status:'REFERENCES_DECLARED',records:[]};},
    x=>{x.corporateActions={status:'NO_EVENTS_DECLARED',records:[{}]};},
    x=>{x.corporateActions={status:'NOT_ASSESSED',records:[{}]};},
    x=>{x.references[0].kind='BROKER_ORDER';},
    x=>{x.references[0].providerSecret='injected';},
    x=>{x.capture.claimedCapturedAt='not-a-date';},
    x=>{x.references[0].claimedPublishedAt='2023-99-99T00:00:00.000Z';}
  ]){
    const bad=structuredClone(m);mutation(bad);
    assert.throws(()=>audit(data,bad),/refused/);
  }
  const a=structuredClone(m);
  a.references.push(ref('OFFLINE-ACTION-003','CORPORATE_ACTION_NOTICE',
    data.bars[80].date,'REFERENCE ONLY'));
  a.corporateActions={status:'REFERENCES_DECLARED',records:[{
    eventId:'FAKE-EVENT-003',eventDate:'2020-01-01',kind:'MERGER',
    referenceId:'OFFLINE-ACTION-003',
    claimedAvailableAt:data.bars[80].date+'T11:00:00.000Z'
  }]};
  assert.throws(()=>audit(data,a),/refused/);
});

test('duplicate corporate-action event IDs fail closed and post-capture references require review',()=>{
  const data=invented(),m=pack(data);
  const first=data.bars[70].date,second=data.bars[75].date;
  m.references.push(ref('OFFLINE-ACTION-004','CORPORATE_ACTION_NOTICE',first,'NOTICE ONE'));
  m.references.push(ref('OFFLINE-ACTION-005','CORPORATE_ACTION_NOTICE',second,'NOTICE TWO'));
  m.corporateActions={status:'REFERENCES_DECLARED',records:[
    {eventId:'FAKE-DUPLICATE',eventDate:first,kind:'SPLIT',
      referenceId:'OFFLINE-ACTION-004',claimedAvailableAt:first+'T10:00:00.000Z'},
    {eventId:'FAKE-DUPLICATE',eventDate:second,kind:'DIVIDEND',
      referenceId:'OFFLINE-ACTION-005',claimedAvailableAt:second+'T10:00:00.000Z'}
  ]};
  assert.throws(()=>audit(data,m),/duplicate corporate action/);
  m.corporateActions.records[1].eventId='FAKE-SECOND';
  const r=audit(data,m);
  assert.equal(r.references.corporateActionRecords,2);
  assert.equal(r.verification.pointInTimeAvailabilityIndependentlyVerified,false);

  const after=structuredClone(m);
  const end=new Date(data.sourceAsOf+'T12:00:00.000Z');
  end.setUTCHours(end.getUTCHours()+2);
  // The review date is deliberately later than capture, so the source
  // reference can be declared as published afterward but is not PIT proof.
  after.references[1].claimedPublishedAt=end.toISOString();
  const later=new Date(data.sourceAsOf+'T00:00:00.000Z');
  later.setUTCDate(later.getUTCDate()+1);
  const result=audit(data,after,later.toISOString().slice(0,10));
  assert.ok(result.reviewReasons.includes('SOURCE_REFERENCE_PUBLISHED_AFTER_DECLARED_CAPTURE'));
  assert.equal(result.verification.productionGate,'NO_GO');
});

test('Phase 12 demonstrator extends the existing read-only three-level packet',async()=>{
  const report=await runEvidenceCli(['--demo']);
  const e=report.levels.research.custodyEvidence;
  assert.equal(e.status,'REVIEW_REQUIRED');
  assert.equal(e.dataset.observedBars,190);
  assert.equal(e.references.archiveSnapshotCount,1);
  assert.equal(e.references.corporateActionStatus,'NOT_ASSESSED');
  assert.equal(e.verification.pointInTimeAvailabilityIndependentlyVerified,false);
  assert.equal(e.verification.independentSourceAuthenticityVerified,false);
  assert.equal(report.levels.research.status,'PARTIAL_DESCRIPTIVE_CHECKS_ONLY');
  assert.equal(report.levels.operations.status,'NOT_VERIFIED');
  assert.equal(report.overall.productionGate,'NO_GO');
  const md=await runEvidenceCli(['--demo','--markdown']);
  assert.match(md,/Custody-reference evidence: REVIEW_REQUIRED/);
  assert.match(md,/NO_GO/);
});

test('local manifest CLI reads explicit files without modifying either and stays non-promotable',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-custody-fixture-'));
  try{
    const data=invented();
    const raw=Buffer.from(JSON.stringify(data,null,2)+'\n');
    const m=pack(data,raw);
    const manifest=Buffer.from(JSON.stringify(m,null,2)+'\n');
    const marketFile=join(dir,'permitted-history.json'),manifestFile=join(dir,'untrusted-manifest.json');
    await writeFile(marketFile,raw);await writeFile(manifestFile,manifest);
    const args=['--as-of',data.sourceAsOf,marketFile,'--manifest',manifestFile];
    assert.deepEqual(parseEvidenceArgs(args),{
      mode:'LOCAL_FILE',asOf:data.sourceAsOf,path:marketFile,
      manifestPath:manifestFile,markdown:false
    });
    const report=await runEvidenceCli(args);
    const evidence=report.levels.research.custodyEvidence;
    assert.equal(evidence.manifestSha256,hash(manifest));
    assert.equal(evidence.dataset.inputSha256,hash(raw));
    assert.equal(evidence.status,'REVIEW_REQUIRED');
    assert.equal(evidence.verification.termsOfUseIndependentlyReviewed,false);
    assert.equal(report.overall.productionGate,'NO_GO');
    const md=await runEvidenceCli([...args,'--markdown']);
    assert.match(md,/Custody-reference evidence: REVIEW_REQUIRED/);
    assert.deepEqual(await readFile(marketFile),raw);
    assert.deepEqual(await readFile(manifestFile),manifest);
    for(const invalid of [
      [...args,'--live'],
      [...args,'--manifest',manifestFile],
      ['--as-of',data.sourceAsOf,marketFile,'--manifest','--broker'],
      ['--as-of',data.sourceAsOf,marketFile,'--markdown','--manifest',manifestFile]
    ])assert.throws(()=>parseEvidenceArgs(invalid),/Usage/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('bad source kind, broker fields and non-JSON manifest cannot become evidence',()=>{
  const data=invented(),m=pack(data);
  assert.throws(()=>auditStarNetOfflineCustody({
    marketBytes:Buffer.from(JSON.stringify(data)),
    manifestBytes:Buffer.from(JSON.stringify(m)),asOf:data.sourceAsOf,
    sourceKind:'REAL_BROKER'
  }),/refused/);
  assert.throws(()=>auditStarNetOfflineCustody({
    marketBytes:Buffer.from(JSON.stringify(data)),
    manifestBytes:Buffer.from('{'),asOf:data.sourceAsOf,
    sourceKind:'USER_SUPPLIED_UNVERIFIED_JSON'
  }),/refused/);
  assert.throws(()=>auditStarNetOfflineCustody({
    marketBytes:Buffer.from(JSON.stringify(data)),
    manifestBytes:Buffer.from(JSON.stringify(m)),asOf:data.sourceAsOf,
    sourceKind:'ENGINEERED_OFFLINE_FIXTURE'
  }),/refused/);
});
