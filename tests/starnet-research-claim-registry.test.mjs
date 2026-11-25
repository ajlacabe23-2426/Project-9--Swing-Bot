import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  buildStarNetResearchReproducibility
} from '../src/starnet-offline-reproducibility.mjs';
import {
  buildStarNetResearchClaimRegistry,newStarNetResearchReviewLedger,
  replayStarNetResearchReviewLedger,appendStarNetResearchReviewNote,
  buildStarNetResearchClaimReviewReport,renderStarNetClaimReviewMarkdown
} from '../src/starnet-research-claim-registry.mjs';
import {loadStarNetOfflineResearchInputs} from '../scripts/starnet-reproduce-research.mjs';
import {runStarNetClaimReviewCli,parseStarNetClaimCliArgs} from '../scripts/starnet-review-claims.mjs';

const CLI=fileURLToPath(new URL('../scripts/starnet-review-claims.mjs',import.meta.url));
const shell=args=>spawnSync(process.execPath,[CLI,...args],{
  encoding:'utf8',timeout:30_000,maxBuffer:3_000_000
});
const source=async()=>{
  const inputs=await loadStarNetOfflineResearchInputs(['--demo']);
  const reproductionRecord=buildStarNetResearchReproducibility(inputs);
  const registry=buildStarNetResearchClaimRegistry({reproductionRecord,originalInputs:inputs});
  return {inputs,reproductionRecord,registry};
};
const note=(noteId,claimId,action='DISPUTE_CLAIM',reasonCode='METHODOLOGY_REVIEW_NEEDED')=>({
  noteId,claimId,action,reviewerLabel:'LOCAL-REVIEWER-UNVERIFIED',reasonCode
});

test('nine claims derive from original Phase 14 bytes and remain explicitly scoped',async()=>{
  const {registry,reproductionRecord}=await source();
  assert.equal(registry.schema,'project9-offline-research-claim-registry-v1');
  assert.equal(registry.sourceReproductionBundleSha256,reproductionRecord.bundleSha256);
  assert.equal(registry.sourceResultSha256,reproductionRecord.resultIdentity.resultSha256);
  assert.equal(registry.sourceInputSha256,reproductionRecord.inputs.historicalDataSha256);
  assert.equal(registry.sourceMethodologySha256,reproductionRecord.methodology.localSourceCodeSha256);
  assert.equal(registry.claims.length,9);
  assert.equal(registry.supportedLocalCalculationClaims,3);
  assert.equal(registry.missingOrLimitedEvidenceClaims,6);
  assert.equal(registry.reviewerAuthentication,'NOT_PERFORMED');
  assert.equal(registry.independentExternalReview,'NOT_PERFORMED');
  assert.equal(registry.productionGate,'NO_GO');
  assert.equal(registry.realOrdersCreated,0);
  assert.equal(registry.blockchainTransactionsBroadcast,0);
  assert.equal(registry.externalCalls,0);
  assert.equal(registry.claims[0].status,'SUPPORTED_LOCAL_CALCULATION_ONLY');
  assert.equal(registry.claims[1].observed.count,190);
  assert.deepEqual(registry.claims[2].observed.completedBars,[70,35,36]);
  const holdout=registry.claims.find(c=>c.kind==='HOLDOUT_SAMPLE_ADVISORY');
  assert.equal(holdout.status,'INSUFFICIENT_DESCRIPTIVE_OBSERVATIONS');
  assert.equal(holdout.observed.observations,1);
  assert.equal(holdout.observed.descriptiveReferenceFloor,20);
  assert.equal(registry.claims.find(c=>c.kind==='SOURCE_AUTHENTICITY').status,'NOT_VERIFIED');
  assert.equal(registry.claims.find(c=>c.kind==='PREDICTIVE_EFFICACY').status,'NOT_ESTABLISHED');
  assert.equal(registry.claims.find(c=>c.kind==='INDEPENDENT_EXTERNAL_REVIEW').status,'NOT_PERFORMED');
  for(const claim of registry.claims){
    assert.equal(claim.evidence.originalInputSha256,registry.sourceInputSha256);
    assert.equal(claim.evidence.originalMethodologySha256,registry.sourceMethodologySha256);
    assert.equal(claim.evidence.reproductionBundleSha256,registry.sourceReproductionBundleSha256);
    assert.equal(claim.independentlyAuthenticated,false);
    assert.equal(claim.productionGate,'NO_GO');
    assert.ok(claim.requiredEvidence.length>0);
  }
});

test('reviewer notes form an append-only local hash chain and never promote claim evidence',async()=>{
  const {registry}=await source();
  const initial=newStarNetResearchReviewLedger(registry);
  assert.equal(initial.entries.length,0);
  const ack=note('SIM-NOTE-001','SIM-CLAIM-BAR-COUNT',
    'ACKNOWLEDGE_LOCAL_CALCULATION','LOCAL_CALCULATION_RECHECKED');
  const first=appendStarNetResearchReviewNote(registry,initial,ack);
  const second=appendStarNetResearchReviewNote(registry,first,note(
    'SIM-NOTE-002','SIM-CLAIM-PREDICTIVE-EFFICACY',
    'REQUEST_EXTERNAL_EVIDENCE','INSUFFICIENT_EVIDENCE'));
  const third=appendStarNetResearchReviewNote(registry,second,note(
    'SIM-NOTE-003','SIM-CLAIM-SOURCE-AUTHENTICITY',
    'DISPUTE_CLAIM','SOURCE_ORIGIN_UNVERIFIED'));
  assert.equal(initial.entries.length,0);
  assert.equal(first.entries.length,1);
  assert.equal(second.entries.length,2);
  assert.equal(third.entries.length,3);
  assert.equal(third.entries[1].previousHash,third.entries[0].hash);
  assert.equal(third.entries[2].previousHash,third.entries[1].hash);
  assert.equal(third.headHash,third.entries[2].hash);
  const replay=replayStarNetResearchReviewLedger(registry,structuredClone(third));
  assert.equal(replay.noteCount,3);
  assert.equal(replay.localReviewerIdentitiesAuthenticated,false);
  assert.equal(replay.independentApprovalRecorded,false);
  const report=buildStarNetResearchClaimReviewReport(registry,third);
  assert.equal(report.localNoteCount,3);
  assert.equal(report.independentlyAuthenticatedExternalReview,false);
  assert.equal(report.marketDataAuthenticityEstablished,false);
  assert.equal(report.predictiveEfficacyEstablished,false);
  assert.equal(report.productionGate,'NO_GO');
  assert.equal(report.claims.find(c=>c.kind==='PREDICTIVE_EFFICACY').status,'NOT_ESTABLISHED');
  assert.equal(report.claims.find(c=>c.kind==='PREDICTIVE_EFFICACY').lastLocalReviewAction,'REQUEST_EXTERNAL_EVIDENCE');
  assert.equal(report.claims.find(c=>c.kind==='SOURCE_AUTHENTICITY').status,'NOT_VERIFIED');
  assert.equal(report.claims.find(c=>c.kind==='HISTORICAL_BAR_COUNT').status,'SUPPORTED_LOCAL_CALCULATION_ONLY');
  assert.ok(report.claims.every(c=>c.statusChangedByLocalReview===false&&
    c.independentReviewerVerified===false));
  const markdown=renderStarNetClaimReviewMarkdown(report);
  assert.match(markdown,/Phase 15 Claim Verification/);
  assert.match(markdown,/NOT_ESTABLISHED/);
  assert.match(markdown,/NO_GO/);
  assert.match(markdown,/not authenticated/);
});

test('fabricated approval and unsupported acknowledgments are refused',async()=>{
  const {registry}=await source();
  const empty=newStarNetResearchReviewLedger(registry);
  for(const bad of [
    note('SIM-NOTE-001','SIM-CLAIM-PREDICTIVE-EFFICACY','ACKNOWLEDGE_LOCAL_CALCULATION','LOCAL_CALCULATION_RECHECKED'),
    note('SIM-NOTE-001','SIM-CLAIM-SOURCE-AUTHENTICITY','ACKNOWLEDGE_LOCAL_CALCULATION','LOCAL_CALCULATION_RECHECKED'),
    note('SIM-NOTE-001','SIM-CLAIM-HOLDOUT','ACKNOWLEDGE_LOCAL_CALCULATION','LOCAL_CALCULATION_RECHECKED'),
    note('SIM-NOTE-001','SIM-CLAIM-MISSING','REQUEST_EXTERNAL_EVIDENCE','INSUFFICIENT_EVIDENCE'),
    {...note('SIM-NOTE-001','SIM-CLAIM-BAR-COUNT','ACKNOWLEDGE_LOCAL_CALCULATION','LOCAL_CALCULATION_RECHECKED'),apiKey:'secret'},
    {...note('SIM-NOTE-001','SIM-CLAIM-BAR-COUNT'),action:'APPROVE_INDEPENDENT_REVIEW'},
    {...note('SIM-NOTE-001','SIM-CLAIM-BAR-COUNT'),reviewerLabel:'AUTHENTICATED_EXTERNAL_REVIEWER'},
    {...note('SIM-NOTE-001','SIM-CLAIM-BAR-COUNT'),reasonCode:'TRADING_IS_AUTHORIZED'},
    note('REAL-NOTE','SIM-CLAIM-PREDICTIVE-EFFICACY')
  ])assert.throws(()=>appendStarNetResearchReviewNote(registry,empty,bad),/refused/);
});

test('modified histories, methodology and locally recomputed but forged Phase 14 claims fail closed',async()=>{
  const {inputs,reproductionRecord,registry}=await source();
  for(const variation of [
    {...inputs,marketBytes:Buffer.from(inputs.marketBytes.toString('utf8')+'\n')},
    {...inputs,witnessMarketBytes:Buffer.from(inputs.witnessMarketBytes.toString('utf8')+'\n')},
    {...inputs,manifestBytes:Buffer.from(inputs.manifestBytes.toString('utf8')+'\n')},
    {...inputs,methodologySha256:'f'.repeat(64)}
  ])assert.throws(()=>buildStarNetResearchClaimRegistry({
    reproductionRecord,originalInputs:variation
  }),/refused/);
  const bad=structuredClone(reproductionRecord);
  bad.resultIdentity.descriptive.historicalBars=999;
  assert.throws(()=>buildStarNetResearchClaimRegistry({
    reproductionRecord:bad,originalInputs:inputs
  }),/refused/);
  const forged=structuredClone(registry);
  forged.claims[4].status='INDEPENDENTLY_VERIFIED';
  assert.throws(()=>replayStarNetResearchReviewLedger(forged,newStarNetResearchReviewLedger(registry)),/refused/);
});

test('review ledger rejects altered hash chains, duplicate IDs and changed registry identities',async()=>{
  const {registry}=await source();
  const empty=newStarNetResearchReviewLedger(registry);
  const first=appendStarNetResearchReviewNote(registry,empty,note(
    'SIM-NOTE-001','SIM-CLAIM-PREDICTIVE-EFFICACY','REQUEST_EXTERNAL_EVIDENCE','INSUFFICIENT_EVIDENCE'));
  for(const change of [
    l=>{l.entries[0].note.action='FAKE_EXTERNAL_APPROVAL';},
    l=>{l.entries[0].sequence=3;},
    l=>{l.entries[0].previousHash='f'.repeat(64);},
    l=>{l.headHash='f'.repeat(64);},
    l=>{l.registrySha256='f'.repeat(64);},
    l=>{l.reviewIdentityVerified=true;},
    l=>{l.independentlyAuthenticatedReviewer=true;},
    l=>{l.approvalsPromoteClaimStatus=true;},
    l=>{l.productionGate='GO';},
    l=>{l.sourceOfFunds='unexpected';}
  ]){
    const l=structuredClone(first);
    change(l);
    assert.throws(()=>replayStarNetResearchReviewLedger(registry,l),/refused/);
  }
  assert.throws(()=>appendStarNetResearchReviewNote(registry,first,note(
    'SIM-NOTE-001','SIM-CLAIM-SOURCE-AUTHENTICITY')),/refused/);
  assert.equal(replayStarNetResearchReviewLedger(registry,first).noteCount,1);
});

test('CLI demo and Markdown report are repeatable and have no production or human-approval claims',async()=>{
  const json=await runStarNetClaimReviewCli(['--demo']);
  const md=await runStarNetClaimReviewCli(['--demo','--markdown']);
  assert.equal(json.schema,'project9-offline-claim-review-packet-v1');
  assert.equal(json.report.schema,'project9-offline-claim-review-report-v1');
  assert.equal(json.registry.claims.length,9);
  assert.equal(json.registry.claims.find(c=>c.kind==='HOLDOUT_SAMPLE_ADVISORY').observed.observations,1);
  assert.equal(json.reviewLedger.entries.length,0);
  assert.equal(json.report.independentlyAuthenticatedExternalReview,false);
  assert.equal(json.productionGate,'NO_GO');
  assert.match(md,/Local notes cannot promote unsupported claims/);
  assert.deepEqual(await runStarNetClaimReviewCli(['--demo']),json);
  assert.equal(await runStarNetClaimReviewCli(['--demo','--markdown']),md);
});

test('CLI produces a standalone ledger, rereads it, and reproduces the same evidence in new processes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-claim-review-'));
  try{
    const input=await runStarNetClaimReviewCli(['--demo']);
    const record=await loadStarNetOfflineResearchInputs(['--demo']).then(
      inputs=>buildStarNetResearchReproducibility(inputs));
    const recordPath=join(dir,'original-research.json'),ledgerPath=join(dir,'notes.json');
    await writeFile(recordPath,JSON.stringify(record));
    const run1=shell(['--demo','--record',recordPath]);
    const run2=shell(['--demo','--record',recordPath]);
    assert.equal(run1.status,0,run1.stderr);
    assert.equal(run2.status,0,run2.stderr);
    assert.equal(run1.stdout,run2.stdout);
    assert.equal(JSON.parse(run1.stdout).registry.registrySha256,input.registry.registrySha256);
    const notes=shell(['--demo','--record',recordPath,
      '--note','SIM-CLAIM-BAR-COUNT','ACKNOWLEDGE_LOCAL_CALCULATION',
      'LOCAL_CALCULATION_RECHECKED','--ledger-only']);
    assert.equal(notes.status,0,notes.stderr);
    await writeFile(ledgerPath,notes.stdout);
    const reread=shell(['--demo','--record',recordPath,'--reviews',ledgerPath,'--markdown']);
    assert.equal(reread.status,0,reread.stderr);
    assert.match(reread.stdout,/LOCAL_REPRODUCIBILITY/);
    assert.match(reread.stdout,/HISTORICAL_BAR_COUNT \| SUPPORTED_LOCAL_CALCULATION_ONLY \| 1/);
    assert.match(reread.stdout,/NO_GO/);
    const next=await runStarNetClaimReviewCli(['--demo','--reviews',ledgerPath,
      '--note','SIM-CLAIM-PREDICTIVE-EFFICACY','REQUEST_EXTERNAL_EVIDENCE',
      'INSUFFICIENT_EVIDENCE']);
    assert.equal(next.reviewLedger.entries.length,2);
    assert.equal(next.report.claims.find(x=>x.kind==='PREDICTIVE_EFFICACY').status,'NOT_ESTABLISHED');
    const bytes=await readFile(ledgerPath,'utf8');
    assert.equal(bytes,notes.stdout);
    await writeFile(recordPath,JSON.stringify({...record,release:{...record.release,productionGate:'GO'}}));
    const refused=shell(['--demo','--record',recordPath]);
    assert.notEqual(refused.status,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('strict CLI parsing and read-only review reject unsafe flags, missing files and incoherent options',async()=>{
  const parsed=parseStarNetClaimCliArgs(['--demo','--note','SIM-CLAIM-HOLDOUT','REQUEST_EXTERNAL_EVIDENCE','INSUFFICIENT_EVIDENCE','--markdown']);
  assert.deepEqual(parsed.note,{
    claimId:'SIM-CLAIM-HOLDOUT',action:'REQUEST_EXTERNAL_EVIDENCE',
    reasonCode:'INSUFFICIENT_EVIDENCE'
  });
  for(const args of [
    [],['--live'],['--demo','--broker'],['--demo','--markdown','--ledger-only'],
    ['--demo','--note','SIM-CLAIM-BAR-COUNT'],
    ['--demo','--reviewer','LOCAL-REVIEWER-USER'],
    ['--demo','--reviews','--live'],
    ['--demo','--record','--live'],
    ['--demo','--record','record.json','--record','second.json']
  ])await assert.rejects(runStarNetClaimReviewCli(args));
});
