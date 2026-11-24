import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFictionalRiskBook,validateFictionalRiskPolicy} from '../src/starnet-fictional-risk-book.mjs';
import {openFictionalExecutionJournal} from '../src/starnet-fictional-execution-journal.mjs';

const M='MISSING';
const policy=()=>({
  schema:'project9-fictional-risk-policy-v1',
  scope:'FICTIONAL_OFFLINE',startingCashTicks:10_000,
  maxOrderNotionalTicks:9000,
  initialHoldings:[
    {rail:'LISTED_EQUITY',instrumentId:'SIM-EQUITY-ONE',units:5},
    {rail:'TOKENIZED_SECURITY',instrumentId:'SIM-TOKEN-ONE',units:2}
  ]
});
const descriptor=token=>({
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
const order=(id,side='BUY',units=3,price=1000,token=false)=>({
  schema:'project9-sim-order-intent-v1',scope:'FICTIONAL_OFFLINE',
  intentId:id,railDescriptor:descriptor(token),side,
  orderType:'LIMIT',units,limitPriceTicks:price
});
const event=(id,intentId,kind,filledUnits=0)=>({
  schema:'project9-sim-execution-event-v1',scope:'FICTIONAL_OFFLINE',
  eventId:id,intentId,kind,filledUnits
});
const fresh=()=>mkdtemp(join(tmpdir(),'p9-execution-lab-'));

test('independent risk book reserves fictional cash, rejects overspend, and releases after cancellation',()=>{
  const book=createFictionalRiskBook(policy());
  const a=order('SIM-ORDER-A','BUY',8);
  assert.equal(book.prepare(a).decision,'APPROVED');
  assert.equal(book.snapshot().cash.availableTicks,2000);
  const denied=book.prepare(order('SIM-ORDER-B','BUY',3));
  assert.equal(denied.reason,'INSUFFICIENT_AVAILABLE_CASH');
  assert.equal(book.snapshot().cash.reservedTicks,8000);
  assert.deepEqual(book.prepare(structuredClone(a)),book.getDecision('SIM-ORDER-A'));
  assert.deepEqual(book.prepare(order('SIM-ORDER-B','BUY',3)),denied);
  assert.throws(()=>book.prepare(order('SIM-ORDER-B','BUY',4)),/Conflicting/);
  assert.equal(book.snapshot().orderCount,2);
  book.recordEvent(event('SIM-EVENT-ACK','SIM-ORDER-A','ACK'));
  book.recordEvent(event('SIM-EVENT-PART','SIM-ORDER-A','FILL',2));
  assert.deepEqual(book.snapshot().cash,{totalTicks:8000,reservedTicks:6000,availableTicks:2000});
  const cancelled=book.recordEvent(event('SIM-EVENT-CANCEL','SIM-ORDER-A','CANCEL'));
  assert.equal(cancelled.status,'SIMULATED_CANCELLED');
  assert.deepEqual(book.snapshot().cash,{totalTicks:8000,reservedTicks:0,availableTicks:8000});
  assert.equal(book.snapshot().holdings.find(x=>x.instrumentId==='SIM-EQUITY-ONE').totalUnits,7);
  assert.equal(book.snapshot().controls.realOrdersCreated,0);
});

test('holdings remain segregated by rail and sales cannot double reserve',()=>{
  const book=createFictionalRiskBook(policy());
  const x=order('SIM-ORDER-STOCKSELL','SELL',4);
  assert.equal(book.prepare(x).decision,'APPROVED');
  assert.equal(book.prepare(order('SIM-ORDER-EXCESS','SELL',2)).reason,'INSUFFICIENT_AVAILABLE_HOLDINGS');
  assert.equal(book.prepare(order('SIM-ORDER-TOKENSELL','SELL',2,1000,true)).decision,'APPROVED');
  const stock=book.snapshot().holdings.find(h=>h.rail==='LISTED_EQUITY');
  const token=book.snapshot().holdings.find(h=>h.rail==='TOKENIZED_SECURITY');
  assert.equal(stock.reservedUnits,4);
  assert.equal(token.reservedUnits,2);
  book.recordEvent(event('SIM-EVENT-ACK','SIM-ORDER-STOCKSELL','ACK'));
  book.recordEvent(event('SIM-EVENT-FILL','SIM-ORDER-STOCKSELL','FILL',2));
  assert.equal(book.snapshot().cash.totalTicks,12000);
  assert.equal(book.snapshot().holdings.find(h=>h.rail==='LISTED_EQUITY').availableUnits,1);
  book.recordEvent(event('SIM-EVENT-CANCEL','SIM-ORDER-STOCKSELL','CANCEL'));
  assert.equal(book.snapshot().holdings.find(h=>h.rail==='LISTED_EQUITY').reservedUnits,0);
  assert.equal(book.snapshot().holdings.find(h=>h.rail==='TOKENIZED_SECURITY').reservedUnits,2);
  assert.equal(book.snapshot().controls.chainTransactionsBroadcast,0);
});

test('policy and event validation fail closed; no leverage or unsupported assets',()=>{
  assert.throws(()=>validateFictionalRiskPolicy({...policy(),scope:'LIVE'}),/fictional-only/);
  assert.throws(()=>validateFictionalRiskPolicy({...policy(),startingCashTicks:NaN}),/fictional-only/);
  assert.throws(()=>validateFictionalRiskPolicy({...policy(),initialHoldings:[policy().initialHoldings[0],policy().initialHoldings[0]]}),/duplicated/);
  assert.throws(()=>validateFictionalRiskPolicy({...policy(),brokerAccount:'secret'}),/fictional-only/);
  const book=createFictionalRiskBook(policy());
  assert.equal(book.prepare(order('SIM-ORDER-CAP','BUY',10)).reason,'ORDER_NOTIONAL_CAP');
  assert.throws(()=>book.prepare({...order('SIM-ORDER-LIVE'),scope:'LIVE'}),/scope/);
  assert.throws(()=>book.prepare({...order('SIM-ORDER-SECRET'),brokerKey:'a'}),/Exact offline/);
  assert.throws(()=>book.prepare({...order('SIM-ORDER-BADTOKEN'),railDescriptor:{...descriptor(true),rail:'NATIVE_BLOCKCHAIN_ASSET'}}),/not supported|reference/);
  book.prepare(order('SIM-ORDER-OK','BUY',3));
  assert.throws(()=>book.recordEvent(event('SIM-EVENT-EARLY','SIM-ORDER-OK','FILL',1)),/transition denied/);
  book.recordEvent(event('SIM-EVENT-OK','SIM-ORDER-OK','ACK'));
  book.recordEvent(event('SIM-EVENT-FILL','SIM-ORDER-OK','FILL',1));
  assert.equal(book.recordEvent(event('SIM-EVENT-FILL','SIM-ORDER-OK','FILL',1)).filledUnits,1);
  assert.throws(()=>book.recordEvent(event('SIM-EVENT-FILL','SIM-ORDER-OK','FILL',2)),/Conflicting/);
  assert.throws(()=>book.recordEvent(event('SIM-EVENT-TOO-MUCH','SIM-ORDER-OK','FILL',3)),/Overfill/);
  assert.equal(book.snapshot().cash.totalTicks,9000);
});

test('risk policy is first immutable journal entry; denied proposals persist across restart',async()=>{
  const dir=await fresh();let journal;
  try{
    journal=await openFictionalExecutionJournal(dir);
    assert.equal((await journal.initializeRiskPolicy(policy())).cash.availableTicks,10000);
    await journal.submit(order('SIM-ORDER-FIRST','BUY',8));
    const deny=await journal.submit(order('SIM-ORDER-SECOND','BUY',3));
    assert.equal(deny.reason,'INSUFFICIENT_AVAILABLE_CASH');
    let report=await journal.report();
    assert.equal(report.revision,3);
    assert.equal(report.records.length,1);
    assert.equal(report.risk.orderCount,2);
    assert.equal(report.risk.cash.availableTicks,2000);
    const original=await readFile(join(dir,'journal.json'));
    await journal.close();
    journal=await openFictionalExecutionJournal(dir);
    report=await journal.report();
    assert.equal(report.risk.decisions.find(d=>d.intentId==='SIM-ORDER-SECOND').reason,'INSUFFICIENT_AVAILABLE_CASH');
    assert.deepEqual(await journal.submit(order('SIM-ORDER-SECOND','BUY',3)),deny);
    assert.deepEqual(await readFile(join(dir,'journal.json')),original);
    await assert.rejects(journal.initializeRiskPolicy({...policy(),startingCashTicks:20000}),/Cannot replace/);
    await journal.recordEvent(event('SIM-EVENT-ACK','SIM-ORDER-FIRST','ACK'));
    await journal.recordEvent(event('SIM-EVENT-CANCEL','SIM-ORDER-FIRST','CANCEL'));
    assert.equal((await journal.report()).risk.cash.availableTicks,10000);
    assert.equal((await journal.submit(order('SIM-ORDER-THIRD','BUY',3))).decision,'APPROVED');
  }finally{if(journal)await journal.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});

test('serialized multi-intent attempts cannot oversubscribe fictional funds',async()=>{
  const dir=await fresh();let journal;
  try{
    journal=await openFictionalExecutionJournal(dir);
    await journal.initializeRiskPolicy(policy());
    const [a,b]=await Promise.all([
      journal.submit(order('SIM-ORDER-ONE','BUY',8)),
      journal.submit(order('SIM-ORDER-TWO','BUY',8))
    ]);
    assert.equal(a.decision,'APPROVED');
    assert.equal(b.reason,'INSUFFICIENT_AVAILABLE_CASH');
    const r=await journal.report();
    assert.equal(r.risk.cash.totalTicks,10000);
    assert.equal(r.risk.cash.reservedTicks,8000);
    assert.equal(r.risk.cash.availableTicks,2000);
    await assert.rejects(journal.recordEvent(event('SIM-EVENT-NO','SIM-ORDER-TWO','ACK')),/rejected/);
    await journal.close();journal=null;
    journal=await openFictionalExecutionJournal(dir);
    assert.equal((await journal.report()).risk.decisions.length,2);
  }finally{if(journal)await journal.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});

test('journal cannot enable risk on existing unguarded history',async()=>{
  const dir=await fresh();let journal;
  try{
    journal=await openFictionalExecutionJournal(dir);
    await journal.submit(order('SIM-ORDER-OLD'));
    await assert.rejects(journal.initializeRiskPolicy(policy()),/unguarded/);
    assert.equal((await journal.report()).revision,1);
  }finally{if(journal)await journal.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});

for(const stage of ['BEFORE_RENAME','AFTER_RENAME']){
  test('fault at '+stage+' poisons writer, recovery preserves exactly one or zero fictional order',async()=>{
    const dir=await fresh();
    let journal;
    let armed=false;
    try{
      journal=await openFictionalExecutionJournal(dir,{
        testFaultInjector:checkpoint=>{
          if(armed&&checkpoint===stage)throw new Error('TEST_INJECTED_'+stage);
        }
      });
      await journal.initializeRiskPolicy(policy());
      const before=await readFile(join(dir,'journal.json'));
      armed=true;
      await assert.rejects(journal.submit(order('SIM-ORDER-INTERRUPTED','BUY',3)),
        new RegExp('TEST_INJECTED_'+stage));
      await assert.rejects(journal.report(),/outcome uncertain/);
      await journal.close();journal=null;
      const after=await readFile(join(dir,'journal.json'));
      if(stage==='BEFORE_RENAME')assert.deepEqual(after,before);
      else assert.notDeepEqual(after,before);
      journal=await openFictionalExecutionJournal(dir);
      const report=await journal.report();
      assert.equal(report.risk.orderCount,stage==='AFTER_RENAME'?1:0);
      assert.equal(report.risk.cash.reservedTicks,stage==='AFTER_RENAME'?3000:0);
      const beforeRetry=await readFile(join(dir,'journal.json'));
      await journal.submit(order('SIM-ORDER-INTERRUPTED','BUY',3));
      const afterRetry=await readFile(join(dir,'journal.json'));
      if(stage==='AFTER_RENAME')assert.deepEqual(afterRetry,beforeRetry);
      assert.equal((await journal.report()).risk.cash.reservedTicks,3000);
    }finally{if(journal)await journal.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
  });
}
