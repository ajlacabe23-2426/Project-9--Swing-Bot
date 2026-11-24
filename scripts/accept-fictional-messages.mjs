/**
 * Disposable, offline fictional message-delivery acceptance fixture.
 * No external account, broker endpoint, wallet, chain, credentials,
 * real market data or signing. Only --demo is supported.
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
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
  schema:'project9-market-rail-descriptor-v1',
  scope:'FICTIONAL_OFFLINE',
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
  scope:'FICTIONAL_OFFLINE',intentId:id,
  railDescriptor:descriptor(token),side,
  orderType:'LIMIT',units,limitPriceTicks:1000
});
const message=(id,intentId,sequence,kind,filledUnits=0,token=false)=>({
  schema:'project9-fictional-execution-message-v1',
  scope:'FICTIONAL_OFFLINE',source:'ENGINEERED_LOCAL_FIXTURE',
  messageId:'SIM-MSG-'+id,intentId,
  declaredRail:token?'TOKENIZED_SECURITY':'LISTED_EQUITY',
  sequence,kind,filledUnits
});

export async function acceptFictionalMessages(args){
  if(args.length!==1||args[0]!=='--demo')
    throw new TypeError('Usage: npm run accept:fictional-messages -- --demo (disconnected research only)');
  const dir=await mkdtemp(join(tmpdir(),'p9-execution-lab-'));
  let journal;
  try{
    journal=await openFictionalExecutionJournal(dir);
    await journal.initializeRiskPolicy(policy());
    await journal.submit(order('SIM-ORDER-STOCK','BUY',5));
    await journal.submit(order('SIM-ORDER-TOKEN','SELL',2,true));
    const future=await journal.receiveFictionalMessage(message('FUTURE','SIM-ORDER-STOCK',2,'FILL',2));
    assert.equal(future.reason,'FUTURE_SEQUENCE_HELD_NOT_AUTO_REPLAYED');
    const ack=message('STOCKACK','SIM-ORDER-STOCK',1,'ACK');
    assert.equal((await journal.receiveFictionalMessage(ack)).disposition,'SIMULATED_APPLIED');
    const original=await readFile(join(dir,'journal.json'));
    const duplicate=await journal.receiveFictionalMessage(ack);
    assert.equal(duplicate.redelivery,'EXACT_RETRY_NO_WRITE');
    assert.deepEqual(await readFile(join(dir,'journal.json')),original);
    assert.equal((await journal.receiveFictionalMessage(
      message('LATE','SIM-ORDER-STOCK',1,'ACK'))).reason,'STALE_SEQUENCE_REQUIRES_REVIEW');
    assert.equal((await journal.receiveFictionalMessage(
      message('STOCKFILL','SIM-ORDER-STOCK',2,'FILL',2))).disposition,'SIMULATED_APPLIED');
    assert.equal((await journal.receiveFictionalMessage(
      message('TOKENACK','SIM-ORDER-TOKEN',1,'ACK',0,true))).disposition,'SIMULATED_APPLIED');
    assert.equal((await journal.receiveFictionalMessage(
      message('BADREJECT','SIM-ORDER-TOKEN',2,'REJECT',0,true))).reason,
      'FICTIONAL_LIFECYCLE_EVENT_REFUSED');
    assert.equal((await journal.receiveFictionalMessage(
      message('TOKENCANCEL','SIM-ORDER-TOKEN',2,'CANCEL',0,true))).disposition,'SIMULATED_APPLIED');
    assert.equal((await journal.receiveFictionalMessage(
      message('STOCKCANCEL','SIM-ORDER-STOCK',3,'CANCEL'))).disposition,'SIMULATED_APPLIED');
    const first=await journal.report();
    assert.equal(first.messageCount,8);
    assert.equal(first.risk.eventCount,5);
    assert.equal(first.risk.cash.totalTicks,8000);
    assert.equal(first.risk.cash.reservedTicks,0);
    assert.equal(first.records[0].status,'SIMULATED_CANCELLED');
    assert.equal(first.records[1].status,'SIMULATED_CANCELLED');
    const independent=auditFictionalRiskJournalReport(first);
    assert.equal(independent.finding,'PASS_FICTIONAL_ARITHMETIC_ONLY');
    const saved=await readFile(join(dir,'journal.json'));
    await journal.close();journal=null;
    journal=await openFictionalExecutionJournal(dir);
    assert.deepEqual(await journal.report(),first);
    const redelivery=await journal.receiveFictionalMessage(ack);
    assert.equal(redelivery.redelivery,'EXACT_RETRY_NO_WRITE');
    assert.deepEqual(await readFile(join(dir,'journal.json')),saved);
    return Object.freeze({
      schema:'project9-fictional-message-acceptance-v1',
      scope:'ENGINEERED_FICTIONAL_OFFLINE',
      softwareGate:'PASS',
      productionGate:'NO_GO',
      checks:Object.freeze({
        futureMessageHeld:true,
        staleMessageHeld:true,
        impossibleRejectionHeld:true,
        duplicateAcknowledgmentNoWrite:true,
        sameProcessReopen:true,
        messageIdentityPreserved:true,
        riskAndPortAtomicReceipt:true,
        independentFictionalArithmetic:true,
        realOrdersCreated:0,
        chainTransactionsBroadcast:0,
        externalCalls:0,
        MacOperatorAcceptance:'NOT_RUN'
      }),
      recordedMessages:first.messageCount,
      appliedMessages:first.messages.filter(x=>x.disposition==='SIMULATED_APPLIED').length,
      quarantinedMessages:first.messages.filter(x=>x.disposition==='QUARANTINED_REQUIRES_REVIEW').length,
      resultingFictionalCashTicks:first.risk.cash.totalTicks,
      reconciliationFinding:independent.finding,
      note:'Fabricated messages, balances and execution labels; no broker or blockchain activity.'
    });
  }finally{
    if(journal)await journal.close().catch(()=>{});
    await rm(dir,{recursive:true,force:true});
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{process.stdout.write(JSON.stringify(
    await acceptFictionalMessages(process.argv.slice(2)),null,2)+'\n');}
  catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
