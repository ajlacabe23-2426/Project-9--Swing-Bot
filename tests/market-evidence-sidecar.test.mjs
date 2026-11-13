import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assessMarketEvidence,EVIDENCE_SCHEMA} from '../src/market-evidence-sidecar.mjs';

const hash=data=>createHash('sha256').update(data).digest('hex');
const decisionAt='2026-06-30T23:59:59.000Z';
function fixture(){
  const bars=[],cursor=new Date('2026-01-01T00:00:00.000Z');
  while(bars.length<80){
    cursor.setUTCDate(cursor.getUTCDate()+1);
    if(cursor.getUTCDay()===0||cursor.getUTCDay()===6)continue;
    const close=100+bars.length/10;
    bars.push({date:cursor.toISOString().slice(0,10),
      open:close,high:close+1,low:close-1,close,volume:10000});
  }
  const dataset={schema:'project9-market-data-v2',symbol:'TEST',currency:'USD',
    source:'Recorded test fixture',mode:'HISTORICAL',sourceAsOf:bars.at(-1).date,
    priceAdjustment:'RAW',provenance:{retrievedAt:'2026-06-01T12:00:00.000Z',
      adjustmentMethod:'RAW_UNADJUSTED',corporateActions:'NOT_VERIFIED',
      survivorship:'NOT_ASSESSED',licensing:'NOT_VERIFIED'},bars};
  const datasetBytes=JSON.stringify(dataset);
  const sidecar={schema:EVIDENCE_SCHEMA,datasetSha256:hash(datasetBytes),
    symbol:'TEST',securityId:'SECURITY-TEST-001',currency:'USD',venueMic:'XNAS',units:'SHARES',
    provider:{name:'Recorded vendor',product:'Historical daily',parserVersion:'parser-1',
      transformVersion:'transform-1',requestSha256:'a'.repeat(64),responseSha256:'b'.repeat(64)},
    timeline:{acquiredAt:'2026-06-01T12:00:00.000Z',
      availableAt:'2026-05-31T20:00:00.000Z',knownAt:'2026-06-01T12:00:00.000Z'},
    rights:[{scope:'PRIVATE_RESEARCH',documentSha256:'c'.repeat(64),
      validFrom:'2026-01-01',validThrough:'2026-12-31'}],
    reconciliation:{independentProvider:'Separate archive',reportSha256:'d'.repeat(64),discrepanciesResolved:true},
    adjustments:{basis:'Raw shares',methodology:'Recorded actions',ledgerSha256:'e'.repeat(64)},
    universe:{knownAt:'2026-05-30T12:00:00.000Z',membershipSha256:'f'.repeat(64)},
    reviewer:{name:'Human reviewer',reasonCode:'DOCUMENTED',reviewedAt:'2026-06-02T12:00:00.000Z'}};
  return {datasetBytes,sidecar};
}
const assess=(data,extra={})=>assessMarketEvidence({...fixture(),...data,decisionAt,...extra});
test('complete declarations are review pending, never automatically research or alert accepted',()=>{
  const result=assess({});
  assert.equal(result.status,'EVIDENCE_REVIEW_PENDING');
  assert.deepEqual(result.reasonCodes,[]);
  assert.equal(result.researchAccepted,false);
  assert.equal(result.alertEligible,false);
  assert.equal(result.dataAuthenticityVerified,false);
});
test('missing sidecar or fraudulent self-verification cannot promote a dataset',()=>{
  const missing=assess({sidecar:null});
  assert.equal(missing.status,'QUARANTINED');
  assert.ok(missing.reasonCodes.includes('MISSING_EVIDENCE_SIDECAR'));
  const {sidecar}=fixture();
  sidecar.status='VERIFIED';sidecar.verified=true;
  const fake=assess({sidecar});
  assert.ok(fake.reasonCodes.includes('SELF_ASSERTED_VERIFICATION_IGNORED'));
  assert.equal(fake.researchAccepted,false);
});
test('raw-byte changes and mismatched instruments quarantine evidence',()=>{
  const {datasetBytes,sidecar}=fixture();
  const changed=assess({datasetBytes:datasetBytes+' '});
  assert.ok(changed.reasonCodes.includes('RAW_DATASET_SHA_MISMATCH'));
  sidecar.venueMic='BAD';sidecar.currency='EUR';
  assert.ok(assess({sidecar}).reasonCodes.includes('INSTRUMENT_IDENTITY_INCOMPLETE'));
});
test('decision-time and acquired-after-decision checks prevent false point-in-time claims',()=>{
  const {sidecar}=fixture();
  sidecar.timeline.acquiredAt='2026-07-01T00:00:00.000Z';
  const later=assess({sidecar});
  assert.equal(later.status,'QUARANTINED');
  assert.ok(later.reasonCodes.includes('ACQUIRED_AFTER_DECISION'));
  sidecar.timeline.availableAt='2026-07-02T00:00:00.000Z';
  assert.ok(assess({sidecar}).reasonCodes.includes('EVIDENCE_NOT_KNOWN_AT_DECISION'));
  assert.throws(()=>assess({}, {decisionAt:'2026-02-30T00:00:00.000Z'}),/canonical decisionAt/);
});
test('missing/expired research rights, same-vendor reconciliation and absent actions all quarantine',()=>{
  const {sidecar}=fixture();
  sidecar.rights[0].validThrough='2026-02-01';
  sidecar.reconciliation.independentProvider='Recorded vendor';
  sidecar.adjustments.ledgerSha256='missing';
  const r=assess({sidecar});
  assert.ok(r.reasonCodes.includes('DATED_PRIVATE_RESEARCH_RIGHTS_MISSING'));
  assert.ok(r.reasonCodes.includes('INDEPENDENT_RECONCILIATION_UNPROVEN'));
  assert.ok(r.reasonCodes.includes('CORPORATE_ACTION_LEDGER_UNPROVEN'));
});
test('universe known after decision fails, synthetic source cannot clear preflight',()=>{
  const {sidecar,datasetBytes}=fixture();
  sidecar.universe.knownAt='2026-07-03T00:00:00.000Z';
  assert.ok(assess({sidecar}).reasonCodes.includes('PIT_UNIVERSE_MEMBERSHIP_UNPROVEN'));
  const obj=JSON.parse(datasetBytes);obj.source='Synthetic research fixture';
  const syntheticBytes=JSON.stringify(obj);
  sidecar.datasetSha256=hash(syntheticBytes);
  const result=assess({datasetBytes:syntheticBytes,sidecar});
  assert.equal(result.status,'QUARANTINED');
  assert.ok(result.reasonCodes.includes('SYNTHETIC_DATA'));
});

test('hashed retrieval provenance cannot be hidden by a pre-decision sidecar',()=>{
  const {datasetBytes,sidecar}=fixture();const data=JSON.parse(datasetBytes);
  data.provenance.retrievedAt='2026-07-02T12:00:00.000Z';
  const raw=JSON.stringify(data);sidecar.datasetSha256=hash(raw);
  const result=assess({datasetBytes:raw,sidecar});
  assert.equal(result.status,'QUARANTINED');
  assert.ok(result.reasonCodes.includes('DATASET_RETRIEVED_AFTER_DECISION'));
  assert.ok(result.reasonCodes.includes('DATASET_ACQUISITION_TIMESTAMP_MISMATCH'));
});
test('availability covers the last bar and precedes acquisition and knowledge',()=>{
  for(const timeline of [
    {availableAt:'2026-01-01T00:00:00.000Z'},
    {availableAt:'2026-06-02T00:00:00.000Z'},
    {knownAt:'2026-05-31T00:00:00.000Z'}
  ]){
    const {sidecar}=fixture();Object.assign(sidecar.timeline,timeline);
    const result=assess({sidecar});
    assert.equal(result.status,'QUARANTINED');
    assert.ok(result.reasonCodes.includes('EVIDENCE_TIMELINE_INCONSISTENT'));
  }
});
test('provider aliases and blank required identities fail preflight',()=>{
  for(const independentProvider of ['Recorded vendor ','RECORDED VENDOR','Recorded  vendor']){
    const {sidecar}=fixture();sidecar.reconciliation.independentProvider=independentProvider;
    assert.ok(assess({sidecar}).reasonCodes.includes('INDEPENDENT_RECONCILIATION_UNPROVEN'));
  }
  const {sidecar}=fixture();sidecar.securityId='  ';
  assert.ok(assess({sidecar}).reasonCodes.includes('INSTRUMENT_IDENTITY_INCOMPLETE'));
});
test('synthetic quarantine outranks retrospective status; promotion is always prohibited',()=>{
  for(const source of ['Synthetic fixture','Demo generated prices','Simulated prices']){
    const {datasetBytes,sidecar}=fixture();const data=JSON.parse(datasetBytes);
    data.source=source;data.provenance.retrievedAt='2026-07-01T12:00:00.000Z';
    const raw=JSON.stringify(data);sidecar.datasetSha256=hash(raw);
    sidecar.timeline.acquiredAt=data.provenance.retrievedAt;
    sidecar.timeline.knownAt=data.provenance.retrievedAt;
    const result=assess({datasetBytes:raw,sidecar});
    assert.equal(result.status,'QUARANTINED');
    assert.ok(result.reasonCodes.includes('SYNTHETIC_DATA'));
    for(const key of ['dataAuthenticityVerified','researchAccepted','alertEligible','brokerConnected','realOrdersAllowed'])
      assert.equal(result[key],false);
  }
});
test('legacy provenance with no retrieval instant is quarantined',()=>{
  const {datasetBytes,sidecar}=fixture();const data=JSON.parse(datasetBytes);
  data.schema='project9-market-data-v1';delete data.provenance;
  const raw=JSON.stringify(data);sidecar.datasetSha256=hash(raw);
  assert.ok(assess({datasetBytes:raw,sidecar}).reasonCodes.includes('DATASET_RETRIEVAL_TIMESTAMP_MISSING'));
});

test('consistent late acquisition is retrospective, but unrelated blockers stay quarantined',()=>{
  const {datasetBytes,sidecar}=fixture();const data=JSON.parse(datasetBytes);
  data.provenance.retrievedAt='2026-07-01T12:00:00.000Z';
  const raw=JSON.stringify(data);sidecar.datasetSha256=hash(raw);
  sidecar.timeline.acquiredAt=data.provenance.retrievedAt;
  sidecar.timeline.knownAt=data.provenance.retrievedAt;
  assert.equal(assess({datasetBytes:raw,sidecar}).status,'RETROSPECTIVE_UNVERIFIED_PIT');
  sidecar.rights=[];
  assert.equal(assess({datasetBytes:raw,sidecar}).status,'QUARANTINED');
});
