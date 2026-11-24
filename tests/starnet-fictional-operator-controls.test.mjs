import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {openFictionalExecutionJournal} from '../src/starnet-fictional-execution-journal.mjs';
import {auditFictionalRiskJournalReport} from '../src/starnet-fictional-reconciliation-audit.mjs';

const M='MISSING';
const policy=()=>({
  schema:'project9-fictional-risk-policy-v1',scope:'FICTIONAL_OFFLINE',
  startingCashTicks:10000,maxOrderNotionalTicks:9000,
  initialHoldings:[{rail:'LISTED_EQUITY',instrumentId:'SIM-EQUITY-ONE',units:5}]
});
const intent=(id='SIM-ORDER-ONE',units=5)=>({
  schema:'project9-sim-order-intent-v1',scope:'FICTIONAL_OFFLINE',
  intentId:id,side:'BUY',orderType:'LIMIT',units,limitPriceTicks:1000,
  railDescriptor:{
    schema:'project9-market-rail-descriptor-v1',scope:'FICTIONAL_OFFLINE',
    rail:'LISTED_EQUITY',instrumentId:'SIM-EQUITY-ONE',referenceInstrument:null,
    declaredEvidence:{listingIdentity:M,dataRights:M,exchangeCalendar:M,
      corporateActions:M,custodyAndOwnership:M}
  }
});
const msg=(id,sequence,kind='ACK',filledUnits=0)=>({
  schema:'project9-fictional-execution-message-v1',
  scope:'FICTIONAL_OFFLINE',source:'ENGINEERED_LOCAL_FIXTURE',
  messageId:'SIM-MSG-'+id,intentId:'SIM-ORDER-ONE',
  declaredRail:'LISTED_EQUITY',sequence,kind,filledUnits
});
const review=(id,messageId,action='RELEASE')=>({
  schema:'project9-fictional-quarantine-review-v1',scope:'FICTIONAL_OFFLINE',
  reviewId:'SIM-REVIEW-'+id,messageId:'SIM-MSG-'+messageId,
  action,operator:'SIM-OPERATOR-LAB',
  reason:action==='RELEASE'?'SEQUENCE_VERIFIED_IN_LOCAL_FIXTURE':
    'UNSAFE_OR_UNNEEDED_FICTIONAL_MESSAGE'
});
const stop=(id='INCIDENT')=>({
  schema:'project9-fictional-emergency-stop-v1',scope:'FICTIONAL_OFFLINE',
  stopId:'SIM-STOP-'+id,operator:'SIM-OPERATOR-LAB',
  reason:'SIMULATED_INCIDENT'
});
const fresh=()=>mkdtemp(join(tmpdir(),'p9-execution-lab-'));

test('explicit review of a held future fixture releases exactly once, preserving original quarantine',async()=>{
  const dir=await fresh();let j;
  try{
    j=await openFictionalExecutionJournal(dir);
    await j.initializeRiskPolicy(policy());
    await j.submit(intent());
    const future=await j.receiveFictionalMessage(msg('EARLY',2,'FILL',2));
    assert.equal(future.disposition,'QUARANTINED_REQUIRES_REVIEW');
    await assert.rejects(j.reviewFictionalMessage(review('R1','EARLY')),/ineligible/);
    assert.equal((await j.report()).reviewCount,0);
    assert.equal((await j.receiveFictionalMessage(msg('ACK',1))).disposition,'SIMULATED_APPLIED');
    const released=await j.reviewFictionalMessage(review('R1','EARLY'));
    assert.equal(released.outcome,'RELEASED_TO_FICTIONAL_LEDGER');
    assert.equal(released.simulatedEventId,'SIM-EVENT-MSG-EARLY');
    assert.equal((await j.get('SIM-ORDER-ONE')).status,'SIMULATED_PARTIAL');
    assert.equal((await j.report()).risk.cash.totalTicks,8000);
    assert.equal((await j.report()).risk.cash.reservedTicks,3000);
    assert.equal((await j.report()).messages[0].disposition,'QUARANTINED_REQUIRES_REVIEW');
    assert.equal(auditFictionalRiskJournalReport(await j.report()).finding,'PASS_FICTIONAL_ARITHMETIC_ONLY');
    const before=await readFile(join(dir,'journal.json'));
    const same=await j.reviewFictionalMessage(review('R1','EARLY'));
    assert.equal(same.redelivery,'EXACT_RETRY_NO_WRITE');
    assert.deepEqual(await readFile(join(dir,'journal.json')),before);
    await assert.rejects(j.reviewFictionalMessage(review('R2','EARLY')),/already reviewed/);
    await assert.rejects(j.reviewFictionalMessage({...review('R1','EARLY'),action:'DISMISS',
      reason:'UNSAFE_OR_UNNEEDED_FICTIONAL_MESSAGE'}),/Conflicting/);
    await j.close();j=null;
    j=await openFictionalExecutionJournal(dir);
    assert.equal((await j.report()).reviewCount,1);
    assert.equal((await j.report()).risk.eventCount,2);
    assert.deepEqual(await readFile(join(dir,'journal.json')),before);
  }finally{if(j)await j.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});

test('dismissal is durable and cannot turn wrong-rail or stale fixture into a fill',async()=>{
  const dir=await fresh();let j;
  try{
    j=await openFictionalExecutionJournal(dir);
    await j.initializeRiskPolicy(policy());
    await j.submit(intent());
    const bad={...msg('WRONG',1),declaredRail:'TOKENIZED_SECURITY'};
    assert.equal((await j.receiveFictionalMessage(bad)).disposition,'QUARANTINED_REQUIRES_REVIEW');
    await assert.rejects(j.reviewFictionalMessage(review('R1','WRONG')),/only held future-sequence/);
    const dismissed=await j.reviewFictionalMessage(review('R2','WRONG','DISMISS'));
    assert.equal(dismissed.outcome,'DISMISSED_NO_EVENT');
    assert.equal((await j.report()).risk.eventCount,0);
    await j.close();j=null;j=await openFictionalExecutionJournal(dir);
    assert.equal((await j.report()).reviews[0].outcome,'DISMISSED_NO_EVENT');
    await assert.rejects(j.reviewFictionalMessage(review('R3','WRONG')),/already reviewed/);
    assert.equal((await j.report()).risk.cash.totalTicks,10000);
  }finally{if(j)await j.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});

test('emergency stop is durable, one-way and blocks all synthetic writes after recovery',async()=>{
  const dir=await fresh();let j;
  try{
    j=await openFictionalExecutionJournal(dir);
    await j.initializeRiskPolicy(policy());
    await j.submit(intent());
    await j.receiveFictionalMessage(msg('FUTURE',2,'FILL',2));
    const halted=await j.emergencyStopFictionalLab(stop());
    assert.equal(halted.state,'STOPPED_LATCHED');
    assert.equal(halted.reversibleInSameJournal,false);
    assert.equal(halted.automaticallyCancelsExistingOrders,false);
    const before=await readFile(join(dir,'journal.json'));
    const duplicate=await j.emergencyStopFictionalLab(stop());
    assert.deepEqual(duplicate,halted);
    assert.deepEqual(await readFile(join(dir,'journal.json')),before);
    await assert.rejects(j.emergencyStopFictionalLab(stop('OTHER')),/already latched/);
    await assert.rejects(j.submit(intent('SIM-ORDER-TWO')),/stop latched/);
    await assert.rejects(j.recordEvent({schema:'project9-sim-execution-event-v1',
      scope:'FICTIONAL_OFFLINE',eventId:'SIM-EVENT-ACK',intentId:'SIM-ORDER-ONE',
      kind:'ACK',filledUnits:0}),/stop latched/);
    await assert.rejects(j.receiveFictionalMessage(msg('ACK',1)),/stop latched/);
    await assert.rejects(j.reviewFictionalMessage(review('R1','FUTURE','DISMISS')),/stop latched/);
    assert.equal((await j.report()).risk.cash.reservedTicks,5000);
    await j.close();j=null;j=await openFictionalExecutionJournal(dir);
    assert.equal((await j.report()).emergencyStop.state,'STOPPED_LATCHED');
    assert.equal((await j.report()).reviewCount,0);
    assert.deepEqual(await readFile(join(dir,'journal.json')),before);
    await assert.rejects(j.receiveFictionalMessage(msg('ACK',1)),/stop latched/);
    assert.equal(auditFictionalRiskJournalReport(await j.report()).finding,'PASS_FICTIONAL_ARITHMETIC_ONLY');
  }finally{if(j)await j.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});

test('only exact fictional operator identities and no real-money fields permitted',async()=>{
  const dir=await fresh();let j;
  try{
    j=await openFictionalExecutionJournal(dir);
    await j.initializeRiskPolicy(policy());
    await j.submit(intent());
    await j.receiveFictionalMessage(msg('FUTURE',2,'FILL',1));
    const original=await readFile(join(dir,'journal.json'));
    for(const payload of [
      {...review('R1','FUTURE'),operator:'REAL_BROKER'},
      {...review('R1','FUTURE'),apiKey:'secret'},
      {...review('R1','FUTURE'),scope:'LIVE'},
      {...review('R1','FUTURE'),reason:'OVERRIDE_MARKET_RULES'},
      {...review('R1','FUTURE'),messageId:'ACCOUNT-123'}
    ])await assert.rejects(j.reviewFictionalMessage(payload),/refused/);
    for(const payload of [
      {...stop(),operator:'REAL_USER'},
      {...stop(),scope:'LIVE'},
      {...stop(),brokerAccount:'XYZ'},
      {...stop(),reason:'RESUME'}
    ])await assert.rejects(j.emergencyStopFictionalLab(payload),/refused/);
    assert.deepEqual(await readFile(join(dir,'journal.json')),original);
  }finally{if(j)await j.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});

for(const phase of ['BEFORE_RENAME','AFTER_RENAME']){
  test('review '+phase+' write fault leaves exact zero or one release; recovery never duplicates',async()=>{
    const dir=await fresh();let j,armed=false;
    try{
      j=await openFictionalExecutionJournal(dir,{
        testFaultInjector:p=>{if(armed&&p===phase)throw Error('FIXTURE_FAULT_'+phase);}
      });
      await j.initializeRiskPolicy(policy());
      await j.submit(intent());
      await j.receiveFictionalMessage(msg('FUTURE',2,'FILL',2));
      await j.receiveFictionalMessage(msg('ACK',1));
      armed=true;
      await assert.rejects(j.reviewFictionalMessage(review('R1','FUTURE')),
        new RegExp('FIXTURE_FAULT_'+phase));
      await assert.rejects(j.report(),/outcome uncertain/);
      await j.close();j=null;
      j=await openFictionalExecutionJournal(dir);
      assert.equal((await j.report()).reviewCount,phase==='AFTER_RENAME'?1:0);
      const first=await readFile(join(dir,'journal.json'));
      await j.reviewFictionalMessage(review('R1','FUTURE'));
      assert.equal((await j.report()).risk.eventCount,2);
      assert.equal((await j.report()).reviewCount,1);
      if(phase==='AFTER_RENAME')assert.deepEqual(await readFile(join(dir,'journal.json')),first);
    }finally{if(j)await j.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
  });
}

test('forged reviewed outcome with recomputed local hash fails replay instead of fabricating a fill',async()=>{
  const dir=await fresh();let j;
  try{
    j=await openFictionalExecutionJournal(dir);
    await j.initializeRiskPolicy(policy());
    await j.submit(intent());
    await j.receiveFictionalMessage(msg('FUTURE',2,'FILL',2));
    await j.receiveFictionalMessage(msg('ACK',1));
    await j.reviewFictionalMessage(review('R1','FUTURE'));
    await j.close();j=null;
    const path=join(dir,'journal.json');
    const state=JSON.parse(await readFile(path,'utf8'));
    const entry=state.entries.at(-1);
    assert.equal(entry.kind,'REVIEW');
    entry.payload.outcome='DISMISSED_NO_EVENT';
    entry.hash=createHash('sha256').update(JSON.stringify([
      entry.sequence,entry.kind,entry.payload,entry.previousHash
    ])).digest('hex');
    state.headHash=entry.hash;
    await writeFile(path,JSON.stringify(state)+'\n');
    await assert.rejects(openFictionalExecutionJournal(dir),/review outcome disagrees/);
  }finally{if(j)await j.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});

test('real process SIGKILL leaves an inspectable stale lock and durable irreversible simulation stop',async()=>{
  const dir=await fresh();let child,j;
  try{
    const url=new URL('../src/starnet-fictional-execution-journal.mjs',import.meta.url).href;
    const script=[
      "import {openFictionalExecutionJournal} from '"+url+"';",
      "const j=await openFictionalExecutionJournal(process.argv[1]);",
      "await j.initializeRiskPolicy("+JSON.stringify(policy())+");",
      "await j.submit("+JSON.stringify(intent())+");",
      "await j.emergencyStopFictionalLab("+JSON.stringify(stop())+");",
      "process.stdout.write('READY\\n');",
      "setInterval(()=>{},1000);"
    ].join('\n');
    child=spawn(process.execPath,['--input-type=module','-e',script,dir],
      {stdio:['ignore','pipe','pipe'],env:{...process.env}});
    const ready=await Promise.race([
      once(child.stdout,'data').then(([x])=>x.toString()),
      new Promise((_,rej)=>setTimeout(()=>rej(Error('Child readiness timed out')),7000))
    ]);
    assert.match(ready,/READY/);
    child.kill('SIGKILL');
    await once(child,'exit');
    await assert.rejects(openFictionalExecutionJournal(dir),/EEXIST/);
    // Only test fixture, with child demonstrably terminated. No silent
    // lock stealing; the test owner deliberately clears its own stale lock.
    await rm(join(dir,'.writer.lock'));
    j=await openFictionalExecutionJournal(dir);
    assert.equal((await j.report()).emergencyStop.state,'STOPPED_LATCHED');
    assert.equal((await j.report()).risk.cash.reservedTicks,5000);
    await assert.rejects(j.submit(intent('SIM-ORDER-RETRY')),/stop latched/);
  }finally{
    if(child&&child.exitCode===null&&child.signalCode===null){
      child.kill('SIGKILL');await once(child,'exit').catch(()=>{});
    }
    if(j)await j.close().catch(()=>{});
    await rm(dir,{recursive:true,force:true});
  }
});
