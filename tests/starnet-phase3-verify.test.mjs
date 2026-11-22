import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parsePhase3Args,runStarNetPhase3,verifyAcceptance} from '../scripts/starnet-phase3-verify.mjs';

const SHA='a'.repeat(40);

test('StarNet Phase 3 CLI rejects auto-paper, scheduling, unknown and duplicate flags',()=>{
  assert.deepEqual(parsePhase3Args([]),{reportDir:null});
  assert.deepEqual(parsePhase3Args(['--report-dir','/tmp/fictional-private']),{reportDir:'/tmp/fictional-private'});
  for(const input of [
    ['--paper-auto'],['--demo'],['--schedule'],['--report-dir'],
    ['--report-dir','/tmp/first','--report-dir','/tmp/second'],['--as-of','2026-11-20']
  ]){
    assert.throws(()=>parsePhase3Args(input),/Usage:/);
  }
});

test('StarNet Phase 3 creates exactly two private, evidence-scoped outputs after offline lifecycle PASS',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-phase3-starnet-test-'));
  try{
    const output=await runStarNetPhase3({reportDir:dir,
      now:new Date('2026-11-22T18:00:00Z'),
      commitReader:async()=>SHA});
    assert.equal(output.softwareGate,'PASS');
    assert.equal(output.productionGate,'NO_GO');
    assert.equal(output.sourceCommit,SHA);
    assert.ok(output.checksPassed>=17);
    assert.equal(output.sideEffects.existingWorkstationTouched,false);
    assert.equal(output.sideEffects.realOrdersCreated,0);
    assert.equal(output.sideEffects.providerCalls,0);
    assert.equal(output.sideEffects.scheduledTasksCreated,0);
    assert.deepEqual((await readdir(dir)).sort(),[
      output.deliverables.json.split('/').at(-1),
      output.deliverables.markdown.split('/').at(-1)
    ].sort());
    const json=JSON.parse(await readFile(output.deliverables.json,'utf8'));
    const md=await readFile(output.deliverables.markdown,'utf8');
    assert.equal(json.schema,'project9-starnet-phase3-evidence-v1');
    assert.equal(json.roles.researcher.status,'PASS');
    assert.equal(json.roles.qaEngineer.status,'PASS');
    assert.equal(json.roles.riskAuditor.status,'PASS');
    assert.equal(json.roles.chiefOrchestrator.humanAcceptanceRequired,true);
    assert.deepEqual(json.isolatedAcceptance.simultaneousCreateStatuses,[200,409]);
    assert.equal(json.isolatedAcceptance.realProviderCalls,0);
    assert.equal(json.isolatedAcceptance.realOrdersCreated,0);
    assert.ok(md.includes('Real trading / broker activation: NO_GO'));
    assert.ok(md.includes('StarNet Workbench must execute this command locally'));
    assert.ok((await stat(output.deliverables.json)).size>1000);
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});

test('Phase 3 verifier rejects a manipulated or incomplete lifecycle report',()=>{
  const defaults={
    mode:'OFFLINE_ENGINEERED_SYNTHETIC_ONLY',
    fixtureSymbols:['SIM09','SIM10'],
    defaultCycleTickets:0,
    noSetupDenialStatus:409,missingReviewDenialStatus:409,forgedReviewDenialStatus:409,
    simultaneousCreateStatuses:[200,409],duplicateAfterRestartStatus:409,
    lifecycle:['OPEN_PAPER_OBSERVATION','OPEN_PAPER_OBSERVATION','TARGET_REFERENCE_TOUCHED'],
    journalRestoredIdentically:true,legacyPaperStateUnchanged:true,
    fixtureFilesUnchanged:true,realProviderCalls:0,realOrdersCreated:0,
    finalJournalSha256:'b'.repeat(64)
  };
  assert.equal(verifyAcceptance(defaults).length,15);
  for(const [field,altered] of [
    ['mode','LIVE_MARKET'],['fixtureSymbols',['AAPL']],
    ['defaultCycleTickets',1],['noSetupDenialStatus',500],
    ['simultaneousCreateStatuses',[200,200]],['journalRestoredIdentically',false],
    ['realProviderCalls',1],['realOrdersCreated',1],['finalJournalSha256','bad']
  ]){
    withField();
    function withField(){
      assert.throws(()=>verifyAcceptance({...defaults,[field]:altered}),/acceptance failed/,field);
    }
  }
  assert.throws(()=>verifyAcceptance(null),/Missing structured/);
});

test('StarNet Phase 3 does not write a report if acceptance fails or SHA is invalid',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-phase3-starnet-reject-'));
  try{
    await assert.rejects(()=>runStarNetPhase3({
      reportDir:dir,commitReader:async()=>SHA,
      acceptanceRunner:async()=>{throw new Error('Synthetic acceptance interrupted');}
    }),/Synthetic acceptance interrupted/);
    assert.deepEqual(await readdir(dir),[]);
    await assert.rejects(()=>runStarNetPhase3({
      reportDir:dir,commitReader:async()=>SHA,
      acceptanceRunner:async()=>({mode:'OFFLINE_ENGINEERED_SYNTHETIC_ONLY',realProviderCalls:1})
    }),/acceptance failed/);
    assert.deepEqual(await readdir(dir),[]);
    await assert.rejects(()=>runStarNetPhase3({
      reportDir:dir,commitReader:async()=>null,
      acceptanceRunner:async()=>{throw new Error('should not be reached');}
    }),/Cannot verify exact Git candidate SHA/);
    assert.deepEqual(await readdir(dir),[]);
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});
