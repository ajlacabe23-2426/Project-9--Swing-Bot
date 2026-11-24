import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openFictionalExecutionJournal} from '../src/starnet-fictional-execution-journal.mjs';
import {auditFictionalRiskJournalReport} from '../src/starnet-fictional-reconciliation-audit.mjs';
import {validateFictionalExecutionMessage} from '../src/starnet-fictional-message-emulator.mjs';

const M='MISSING';
const policy=()=>({
  schema:'project9-fictional-risk-policy-v1',
  scope:'FICTIONAL_OFFLINE',startingCashTicks:10000,
  maxOrderNotionalTicks:9000,
  initialHoldings:[
    {rail:'LISTED_EQUITY',instrumentId:'SIM-EQUITY-ONE',units:5},
    {rail:'TOKENIZED_SECURITY',instrumentId:'SIM-TOKEN-ONE',units:2}
  ]
});
const descriptor=(token=false)=>({
  schema:'project9-market-rail-descriptor-v1',scope:'FICTIONAL_OFFLINE',
  rail:token?'TOKENIZED_SECURITY':'LISTED_EQUITY',
  instrumentId:token?'SIM-TOKEN-ONE':'SIM-EQUITY-ONE',
  referenceInstrument:token?'SIM-EQUITY-ONE':null,
  declaredEvidence:token?{
    issuerAndLegalForm:M,underlyingRights:M,custodyOrBacking:M,
    networkAndGovernance:M,transferRestrictions:M,
    redemptionAndReconciliation:M,dataRights:M
  }:{
    listingIdentity:M,dataRights:M,exchangeCalendar:M,
    corporateActions:M,custodyAndOwnership:M
  }
});
const order=(id,side='BUY',units=8,token=false)=>({
  schema:'project9-sim-order-intent-v1',scope:'FICTIONAL_OFFLINE',
  intentId:id,railDescriptor:descriptor(token),side,
  orderType:'LIMIT',units,limitPriceTicks:1000
});
const msg=(id,intentId,sequence,kind,filledUnits=0,declaredRail='LISTED_EQUITY')=>({
  schema:'project9-fictional-execution-message-v1',
  scope:'FICTIONAL_OFFLINE',source:'ENGINEERED_LOCAL_FIXTURE',
  messageId:'SIM-MSG-'+id,intentId,declaredRail,
  sequence,kind,filledUnits
});
const event=(eventId,intentId,kind,filledUnits=0)=>({
  schema:'project9-sim-execution-event-v1',scope:'FICTIONAL_OFFLINE',
  eventId,intentId,kind,filledUnits
});
const fresh=()=>mkdtemp(join(tmpdir(),'p9-execution-lab-'));

test('fictional delayed, duplicate, wrong-rail and overfilled messages hold while valid events apply',async()=>{
  const dir=await fresh();
  let journal;
  try{
    journal=await openFictionalExecutionJournal(dir);
    await journal.initializeRiskPolicy(policy());
    await journal.submit(order('SIM-ORDER-STOCK'));
    await journal.submit(order('SIM-ORDER-TOKEN','SELL',2,true));
    await journal.submit(order('SIM-ORDER-REJECT','BUY',1));
    let r=await journal.receiveFictionalMessage(msg('EARLY','SIM-ORDER-STOCK',2,'FILL',2));
    assert.equal(r.disposition,'QUARANTINED_REQUIRES_REVIEW');
    assert.equal(r.reason,'FUTURE_SEQUENCE_HELD_NOT_AUTO_REPLAYED');
    assert.equal((await journal.report()).risk.cash.reservedTicks,9000);

    const ack=msg('ACK','SIM-ORDER-STOCK',1,'ACK');
    r=await journal.receiveFictionalMessage(ack);
    assert.equal(r.disposition,'SIMULATED_APPLIED');
    assert.equal(r.simulatedEventId,'SIM-EVENT-MSG-ACK');
    const firstBytes=await readFile(join(dir,'journal.json'));
    const retry=await journal.receiveFictionalMessage(structuredClone(ack));
    assert.equal(retry.redelivery,'EXACT_RETRY_NO_WRITE');
    assert.deepEqual(await readFile(join(dir,'journal.json')),firstBytes);
    r=await journal.receiveFictionalMessage(msg('DUP-ACK','SIM-ORDER-STOCK',1,'ACK'));
    assert.equal(r.reason,'STALE_SEQUENCE_REQUIRES_REVIEW');
    r=await journal.receiveFictionalMessage(msg('WRONG-RAIL','SIM-ORDER-STOCK',2,'FILL',2,'TOKENIZED_SECURITY'));
    assert.equal(r.reason,'FICTIONAL_RAIL_IDENTITY_MISMATCH');
    r=await journal.receiveFictionalMessage(msg('PART','SIM-ORDER-STOCK',2,'FILL',2));
    assert.equal(r.disposition,'SIMULATED_APPLIED');
    r=await journal.receiveFictionalMessage(msg('OVER','SIM-ORDER-STOCK',3,'FILL',7));
    assert.equal(r.reason,'FICTIONAL_LIFECYCLE_EVENT_REFUSED');
    assert.equal((await journal.get('SIM-ORDER-STOCK')).filledUnits,2);

    await journal.receiveFictionalMessage(msg('TOK-ACK','SIM-ORDER-TOKEN',1,'ACK',0,'TOKENIZED_SECURITY'));
    await journal.receiveFictionalMessage(msg('TOK-FILL','SIM-ORDER-TOKEN',2,'FILL',2,'TOKENIZED_SECURITY'));
    await journal.receiveFictionalMessage(msg('REJECT','SIM-ORDER-REJECT',1,'REJECT'));
    await journal.receiveFictionalMessage(msg('CANCEL','SIM-ORDER-STOCK',3,'CANCEL'));
    const report=await journal.report();
    assert.equal(report.messageCount,10);
    assert.equal(report.messages.filter(x=>x.disposition==='SIMULATED_APPLIED').length,6);
    assert.equal(report.messages.filter(x=>x.disposition==='QUARANTINED_REQUIRES_REVIEW').length,4);
    assert.equal(report.risk.cash.totalTicks,10000);
    assert.equal(report.risk.cash.reservedTicks,0);
    assert.equal(report.risk.holdings.find(x=>x.rail==='LISTED_EQUITY').totalUnits,7);
    assert.equal(report.risk.holdings.find(x=>x.rail==='TOKENIZED_SECURITY').totalUnits,0);
    assert.equal(auditFictionalRiskJournalReport(report).finding,'PASS_FICTIONAL_ARITHMETIC_ONLY');
    const before=await readFile(join(dir,'journal.json'));
    await journal.close();journal=null;
    journal=await openFictionalExecutionJournal(dir);
    assert.deepEqual(await journal.report(),report);
    assert.deepEqual(await readFile(join(dir,'journal.json')),before);
    r=await journal.receiveFictionalMessage(ack);
    assert.equal(r.redelivery,'EXACT_RETRY_NO_WRITE');
    assert.deepEqual(await readFile(join(dir,'journal.json')),before);
  }finally{
    if(journal)await journal.close().catch(()=>{});
    await rm(dir,{recursive:true,force:true});
  }
});

test('serialized competing ACK deliveries yield one event and one stale receipt',async()=>{
  const dir=await fresh();let journal;
  try{
    journal=await openFictionalExecutionJournal(dir);
    await journal.initializeRiskPolicy(policy());
    await journal.submit(order('SIM-ORDER-STOCK'));
    const same=msg('ONLY-ACK','SIM-ORDER-STOCK',1,'ACK');
    const [first,second]=await Promise.all([
      journal.receiveFictionalMessage(same),
      journal.receiveFictionalMessage({...same})
    ]);
    assert.equal(first.disposition,'SIMULATED_APPLIED');
    assert.equal(second.redelivery,'EXACT_RETRY_NO_WRITE');
    const [late1,late2]=await Promise.all([
      journal.receiveFictionalMessage(msg('LATE-ONE','SIM-ORDER-STOCK',1,'ACK')),
      journal.receiveFictionalMessage(msg('LATE-TWO','SIM-ORDER-STOCK',1,'ACK'))
    ]);
    assert.equal(late1.reason,'STALE_SEQUENCE_REQUIRES_REVIEW');
    assert.equal(late2.reason,'STALE_SEQUENCE_REQUIRES_REVIEW');
    assert.equal((await journal.report()).risk.eventCount,1);
    assert.equal((await journal.get('SIM-ORDER-STOCK')).eventCount,1);
    assert.equal((await journal.report()).messageCount,3);
    await assert.rejects(
      journal.receiveFictionalMessage({...same,kind:'REJECT'}),
      /Conflicting fictional message ID retry/);
    assert.equal((await journal.report()).messageCount,3);
  }finally{if(journal)await journal.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});

test('denied or unknown intent and conflicting direct event identity cannot mutate fictional funds',async()=>{
  const dir=await fresh();let journal;
  try{
    journal=await openFictionalExecutionJournal(dir);
    await journal.initializeRiskPolicy(policy());
    await journal.submit(order('SIM-ORDER-TOO-LARGE','BUY',10));
    const denied=await journal.receiveFictionalMessage(msg('DENIED','SIM-ORDER-TOO-LARGE',1,'ACK'));
    assert.equal(denied.reason,'UNKNOWN_OR_DENIED_FICTIONAL_ORDER');
    const unknown=await journal.receiveFictionalMessage(msg('UNKNOWN','SIM-ORDER-MISSING',1,'ACK'));
    assert.equal(unknown.reason,'UNKNOWN_OR_DENIED_FICTIONAL_ORDER');
    await journal.submit(order('SIM-ORDER-STOCK'));
    await journal.recordEvent(event('SIM-EVENT-MSG-COLLIDE','SIM-ORDER-STOCK','ACK'));
    const collision=await journal.receiveFictionalMessage(msg('COLLIDE','SIM-ORDER-STOCK',2,'FILL',1));
    assert.equal(collision.reason,'FICTIONAL_EVENT_IDENTITY_COLLISION');
    assert.equal((await journal.get('SIM-ORDER-STOCK')).filledUnits,0);
    assert.equal((await journal.report()).risk.cash.totalTicks,10000);
    assert.equal((await journal.report()).risk.cash.reservedTicks,8000);
  }finally{if(journal)await journal.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});

test('valid-looking messages with real source, credentials, signing or unknown rail fail without writes',async()=>{
  const dir=await fresh();let journal;
  try{
    journal=await openFictionalExecutionJournal(dir);
    await journal.initializeRiskPolicy(policy());
    await journal.submit(order('SIM-ORDER-STOCK'));
    const clean=msg('VALID','SIM-ORDER-STOCK',1,'ACK');
    const old=await readFile(join(dir,'journal.json'));
    const negatives=[
      {...clean,scope:'LIVE'},
      {...clean,source:'REAL_BROKER'},
      {...clean,apiKey:'secret'},
      {...clean,providerOrderId:'abc'},
      {...clean,signingKey:'secret'},
      {...clean,declaredRail:'NATIVE_BLOCKCHAIN_ASSET'},
      {...clean,messageId:'not-fictional'},
      {...clean,filledUnits:1},
      {...clean,sequence:0},
      {...clean,kind:'TRANSFER'},
      {...clean,filledUnits:NaN},
      {...clean,messageId:'SIM-MSG-TOO-MANY-GROUPS-HERE'},
      {...clean,accountId:'123'}
    ];
    for(const invalid of negatives){
      assert.throws(()=>validateFictionalExecutionMessage(invalid),/refused/);
      await assert.rejects(journal.receiveFictionalMessage(invalid),/refused/);
    }
    assert.deepEqual(await readFile(join(dir,'journal.json')),old);
    assert.equal((await journal.report()).messageCount,0);
  }finally{if(journal)await journal.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});

test('a legacy fictional journal without an immutable risk policy denies emulator receipt writes',async()=>{
  const dir=await fresh();let journal;
  try{
    journal=await openFictionalExecutionJournal(dir);
    await journal.submit(order('SIM-ORDER-LEGACY','BUY',1));
    const before=await readFile(join(dir,'journal.json'));
    await assert.rejects(journal.receiveFictionalMessage(msg('LEGACY','SIM-ORDER-LEGACY',1,'ACK')),/risk-policy-backed/);
    assert.deepEqual(await readFile(join(dir,'journal.json')),before);
    assert.equal((await journal.report()).messageCount,0);
  }finally{if(journal)await journal.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});

for(const stage of ['BEFORE_RENAME','AFTER_RENAME']){
  test('fictional delivery '+stage+' failure forces restart and exact-once event projection',async()=>{
    const dir=await fresh();let journal,armed=false;
    try{
      journal=await openFictionalExecutionJournal(dir,{
        testFaultInjector:checkpoint=>{
          if(armed&&checkpoint===stage)throw new Error('INJECTED_'+stage);
        }
      });
      await journal.initializeRiskPolicy(policy());
      await journal.submit(order('SIM-ORDER-STOCK'));
      const packet=msg('RETRY-ACK','SIM-ORDER-STOCK',1,'ACK');
      const old=await readFile(join(dir,'journal.json'));
      armed=true;
      await assert.rejects(journal.receiveFictionalMessage(packet),new RegExp('INJECTED_'+stage));
      await assert.rejects(journal.report(),/write outcome uncertain/);
      await journal.close();journal=null;
      const changed=await readFile(join(dir,'journal.json'));
      if(stage==='BEFORE_RENAME')assert.deepEqual(changed,old);
      else assert.notDeepEqual(changed,old);
      journal=await openFictionalExecutionJournal(dir);
      const first=await journal.report();
      assert.equal(first.messageCount,stage==='BEFORE_RENAME'?0:1);
      assert.equal(first.risk.eventCount,stage==='BEFORE_RENAME'?0:1);
      const response=await journal.receiveFictionalMessage(packet);
      assert.equal(response.disposition,'SIMULATED_APPLIED');
      const settled=await journal.report();
      assert.equal(settled.messageCount,1);
      assert.equal(settled.risk.eventCount,1);
      assert.equal(settled.records[0].eventCount,1);
      assert.equal(auditFictionalRiskJournalReport(settled).finding,'PASS_FICTIONAL_ARITHMETIC_ONLY');
      if(stage==='AFTER_RENAME')assert.deepEqual(await readFile(join(dir,'journal.json')),changed);
    }finally{if(journal)await journal.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
  });
}

test('recomputed hash cannot disguise a forged or reordered message outcome on journal replay',async()=>{
  const dir=await fresh();let journal;
  try{
    journal=await openFictionalExecutionJournal(dir);
    await journal.initializeRiskPolicy(policy());
    await journal.submit(order('SIM-ORDER-STOCK'));
    await journal.receiveFictionalMessage(msg('EARLY','SIM-ORDER-STOCK',2,'FILL',1));
    await journal.close();journal=null;
    const path=join(dir,'journal.json');
    const state=JSON.parse(await readFile(path,'utf8'));
    const last=state.entries.at(-1);
    assert.equal(last.kind,'MESSAGE');
    last.payload.disposition='SIMULATED_APPLIED';
    last.payload.reason='ORDERED_FICTIONAL_EVENT';
    last.payload.simulatedEventId='SIM-EVENT-MSG-EARLY';
    last.hash=createHash('sha256').update(JSON.stringify([
      last.sequence,last.kind,last.payload,last.previousHash
    ])).digest('hex');
    state.headHash=last.hash;
    await writeFile(path,JSON.stringify(state)+'\n');
    const after=await readFile(path);
    await assert.rejects(openFictionalExecutionJournal(dir),/delivery outcome mismatch/);
    assert.deepEqual(await readFile(path),after);
  }finally{if(journal)await journal.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});
