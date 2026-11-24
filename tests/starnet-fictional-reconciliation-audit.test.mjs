import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openFictionalExecutionJournal} from '../src/starnet-fictional-execution-journal.mjs';
import {auditFictionalRiskJournalReport} from '../src/starnet-fictional-reconciliation-audit.mjs';

const M='MISSING';
const policy=()=>({
  schema:'project9-fictional-risk-policy-v1',
  scope:'FICTIONAL_OFFLINE',
  startingCashTicks:10000,
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
const order=(id,side,units,token=false)=>({
  schema:'project9-sim-order-intent-v1',
  scope:'FICTIONAL_OFFLINE',
  intentId:id,railDescriptor:descriptor(token),
  side,orderType:'LIMIT',units,limitPriceTicks:1000
});
const event=(id,idOrder,kind,filledUnits=0)=>({
  schema:'project9-sim-execution-event-v1',
  scope:'FICTIONAL_OFFLINE',
  eventId:id,intentId:idOrder,kind,filledUnits
});
async function fixture(build){
  const dir=await mkdtemp(join(tmpdir(),'p9-execution-lab-'));
  let journal;
  try{
    journal=await openFictionalExecutionJournal(dir);
    await journal.initializeRiskPolicy(policy());
    await build(journal);
    return await journal.report();
  }finally{
    if(journal)await journal.close().catch(()=>{});
    await rm(dir,{recursive:true,force:true});
  }
}
const base=()=>fixture(async journal=>{
  await journal.submit(order('SIM-ORDER-PRIMARY','BUY',8));
  await journal.submit(order('SIM-ORDER-OVERSPEND','BUY',3));
  await journal.submit(order('SIM-ORDER-TOKENSALE','SELL',2,true));
  await journal.submit(order('SIM-ORDER-DOUBLESELL','SELL',1,true));
  await journal.recordEvent(event('SIM-EVENT-ACK','SIM-ORDER-PRIMARY','ACK'));
  await journal.recordEvent(event('SIM-EVENT-FILL','SIM-ORDER-PRIMARY','FILL',2));
  await journal.recordEvent(event('SIM-EVENT-CANCEL','SIM-ORDER-PRIMARY','CANCEL'));
  await journal.recordEvent(event('SIM-EVENT-SALEACK','SIM-ORDER-TOKENSALE','ACK'));
  await journal.recordEvent(event('SIM-EVENT-SALEFILL','SIM-ORDER-TOKENSALE','FILL',2));
});

test('independent offline reconciliation reconstructs completed cash/holdings and denied proposals',async()=>{
  const report=await base();
  const before=structuredClone(report);
  const audit=auditFictionalRiskJournalReport(report);
  assert.equal(audit.finding,'PASS_FICTIONAL_ARITHMETIC_ONLY');
  assert.equal(audit.checkedDecisions,4);
  assert.equal(audit.checkedOrders,2);
  assert.equal(audit.checkedEvents,5);
  assert.equal(audit.expectedCashTicks,10000);
  assert.equal(audit.expectedReservedTicks,0);
  assert.equal(audit.outstandingFictionalOrders,0);
  assert.equal(audit.safety.productionGate,'NO_GO');
  assert.equal(audit.safety.independentlyObservedProviderExecutions,false);
  assert.equal(audit.safety.signedBlockchainFinality,false);
  assert.deepEqual(report,before);
  assert.ok(Object.isFrozen(audit.safety));
});

test('independent offline reconciliation counts unfilled reservations separately by rail',async()=>{
  const report=await fixture(async journal=>{
    await journal.submit(order('SIM-ORDER-PRIMARY','BUY',8));
    await journal.submit(order('SIM-ORDER-SELL','SELL',4));
    await journal.submit(order('SIM-ORDER-TOKEN','SELL',2,true));
    await journal.recordEvent(event('SIM-EVENT-ACK','SIM-ORDER-PRIMARY','ACK'));
    await journal.recordEvent(event('SIM-EVENT-PARTIAL','SIM-ORDER-PRIMARY','FILL',2));
  });
  const audit=auditFictionalRiskJournalReport(report);
  assert.equal(audit.expectedCashTicks,8000);
  assert.equal(audit.expectedReservedTicks,6000);
  assert.equal(audit.outstandingFictionalOrders,3);
  assert.equal(audit.checkedHoldings,2);
  assert.equal(report.risk.holdings.find(x=>x.rail==='LISTED_EQUITY').reservedUnits,4);
  assert.equal(report.risk.holdings.find(x=>x.rail==='TOKENIZED_SECURITY').reservedUnits,2);
});

test('refuses falsified fictional cash, holdings, decisions, events or identity claims',async()=>{
  const valid=await base();
  const attacks=[
    data=>{data.risk.cash.totalTicks+=1;},
    data=>{data.risk.cash.availableTicks-=1;},
    data=>{data.risk.cash.reservedTicks=1;},
    data=>{data.risk.holdings[0].totalUnits+=1;},
    data=>{data.risk.holdings[1].reservedUnits+=1;},
    data=>{data.risk.holdings[1].availableUnits+=1;},
    data=>{data.risk.decisions[0].filledUnits=99;},
    data=>{data.risk.decisions[1].reason=null;},
    data=>{data.risk.decisions[1].status='SIMULATED_ACCEPTED';},
    data=>{data.risk.decisions[0].reservedAtProposalTicks=0;},
    data=>{data.records[0].remainingUnits+=1;},
    data=>{data.records[0].events[1].filledUnits+=1;},
    data=>{data.records[0].events[1].eventId=data.records[0].events[0].eventId;},
    data=>{data.records[0].status='SIMULATED_FILLED';},
    data=>{data.records[1].instrumentId='SIM-EQUITY-ONE';},
    data=>{data.records[0].safety.realOrdersCreated=1;},
    data=>{data.controls.brokerConnected=true;},
    data=>{data.risk.controls.automaticFill=true;},
    data=>{data.risk.policy.startingCashTicks+=1;},
    data=>{data.records.push(structuredClone(data.records[0]));},
    data=>{delete data.risk;},
    data=>{data.headHash='not-a-hash';},
    data=>{data.revision=1;}
  ];
  for(let i=0;i<attacks.length;i++){
    const tampered=structuredClone(valid);
    attacks[i](tampered);
    assert.throws(()=>auditFictionalRiskJournalReport(tampered),
      /Fictional reconciliation refused/i,'Expected refusal for attack '+i);
  }
});

test('refuses policy-free historic journal rather than inventing account balances',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-execution-lab-'));
  let journal;
  try {
    journal=await openFictionalExecutionJournal(dir);
    await journal.submit(order('SIM-ORDER-OLD','BUY',1));
    const report=await journal.report();
    assert.throws(()=>auditFictionalRiskJournalReport(report),/unguarded/);
  }finally{
    if(journal)await journal.close().catch(()=>{});
    await rm(dir,{recursive:true,force:true});
  }
});

test('does not accept unrelated arbitrary objects or fabricated confirmations',()=>{
  const invalid=[
    null,[],{},'string',
    {schema:'real-broker-order',scope:'LIVE'},
    {schema:'project9-fictional-execution-journal-v1',scope:'LIVE',records:[]}
  ];
  for(const item of invalid){
    assert.throws(()=>auditFictionalRiskJournalReport(item),/refused/);
  }
});
