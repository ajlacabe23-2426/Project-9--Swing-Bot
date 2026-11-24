/**
 * Disposable-only acceptance: quarantined fictional messages + one-way stop.
 * Zero accounts, broker connections, signing, network or real orders.
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {openFictionalExecutionJournal} from '../src/starnet-fictional-execution-journal.mjs';
import {auditFictionalRiskJournalReport} from '../src/starnet-fictional-reconciliation-audit.mjs';

const M='MISSING';
const policy=()=>({
  schema:'project9-fictional-risk-policy-v1',scope:'FICTIONAL_OFFLINE',
  startingCashTicks:10000,maxOrderNotionalTicks:9000,
  initialHoldings:[{rail:'LISTED_EQUITY',instrumentId:'SIM-EQUITY-ONE',units:5}]
});
const intent=()=>({
  schema:'project9-sim-order-intent-v1',scope:'FICTIONAL_OFFLINE',
  intentId:'SIM-ORDER-ONE',side:'BUY',orderType:'LIMIT',units:5,limitPriceTicks:1000,
  railDescriptor:{
    schema:'project9-market-rail-descriptor-v1',scope:'FICTIONAL_OFFLINE',
    rail:'LISTED_EQUITY',instrumentId:'SIM-EQUITY-ONE',
    referenceInstrument:null,declaredEvidence:{
      listingIdentity:M,dataRights:M,exchangeCalendar:M,
      corporateActions:M,custodyAndOwnership:M
    }
  }
});
const message=(id,seq,kind='ACK',filledUnits=0,rail='LISTED_EQUITY')=>({
  schema:'project9-fictional-execution-message-v1',
  scope:'FICTIONAL_OFFLINE',source:'ENGINEERED_LOCAL_FIXTURE',
  messageId:'SIM-MSG-'+id,intentId:'SIM-ORDER-ONE',
  declaredRail:rail,sequence:seq,kind,filledUnits
});
const review=(id,messageId,action)=>({
  schema:'project9-fictional-quarantine-review-v1',scope:'FICTIONAL_OFFLINE',
  reviewId:'SIM-REVIEW-'+id,messageId:'SIM-MSG-'+messageId,
  action,operator:'SIM-OPERATOR-LAB',
  reason:action==='RELEASE'?'SEQUENCE_VERIFIED_IN_LOCAL_FIXTURE':
    'UNSAFE_OR_UNNEEDED_FICTIONAL_MESSAGE'
});
const stop=()=>({
  schema:'project9-fictional-emergency-stop-v1',
  scope:'FICTIONAL_OFFLINE',stopId:'SIM-STOP-INCIDENT',
  reason:'SIMULATED_INCIDENT',operator:'SIM-OPERATOR-LAB'
});
export async function acceptFictionalOperatorControls(args){
  if(args.length!==1||args[0]!=='--demo')
    throw new TypeError('Only --demo offline fictional operator-control acceptance supported');
  const dir=await mkdtemp(join(tmpdir(),'p9-execution-lab-'));
  let journal;
  try {
    journal=await openFictionalExecutionJournal(dir);
    await journal.initializeRiskPolicy(policy());
    await journal.submit(intent());
    assert.equal((await journal.receiveFictionalMessage(
      message('FUTURE',2,'FILL',2))).disposition,'QUARANTINED_REQUIRES_REVIEW');
    await assert.rejects(
      journal.reviewFictionalMessage(review('RELEASE','FUTURE','RELEASE')),
      /ineligible/);
    assert.equal((await journal.receiveFictionalMessage(
      message('ACK',1))).disposition,'SIMULATED_APPLIED');
    const released=await journal.reviewFictionalMessage(review('RELEASE','FUTURE','RELEASE'));
    assert.equal(released.outcome,'RELEASED_TO_FICTIONAL_LEDGER');
    const mismatch=await journal.receiveFictionalMessage(
      message('WRONG',3,'FILL',1,'TOKENIZED_SECURITY'));
    assert.equal(mismatch.disposition,'QUARANTINED_REQUIRES_REVIEW');
    assert.equal((await journal.reviewFictionalMessage(
      review('DISMISS','WRONG','DISMISS'))).outcome,'DISMISSED_NO_EVENT');
    const halted=await journal.emergencyStopFictionalLab(stop());
    assert.equal(halted.state,'STOPPED_LATCHED');
    const before=await journal.report();
    assert.equal(before.reviewCount,2);
    assert.equal(before.emergencyStop.reversibleInSameJournal,false);
    assert.equal(before.risk.cash.totalTicks,8000);
    assert.equal(before.risk.cash.reservedTicks,3000);
    const audit=auditFictionalRiskJournalReport(before);
    assert.equal(audit.finding,'PASS_FICTIONAL_ARITHMETIC_ONLY');
    const bytes=await readFile(join(dir,'journal.json'));
    await journal.close();journal=null;
    journal=await openFictionalExecutionJournal(dir);
    assert.deepEqual(await journal.report(),before);
    assert.deepEqual(await journal.emergencyStopFictionalLab(stop()),halted);
    assert.deepEqual(await readFile(join(dir,'journal.json')),bytes);
    await assert.rejects(journal.receiveFictionalMessage(message('FINAL',3)),/stop latched/);
    await assert.rejects(journal.reviewFictionalMessage(
      review('NEW','WRONG','DISMISS')),/stop latched/);
    await assert.rejects(journal.submit(intent()),/stop latched/);
    return Object.freeze({
      schema:'project9-fictional-operator-controls-acceptance-v1',
      scope:'ENGINEERED_FICTIONAL_OFFLINE',
      softwareGate:'PASS',productionGate:'NO_GO',
      checks:Object.freeze({
        explicitReviewRelease:true,
        invalidReleaseRefused:true,
        unsafeQuarantineDismissal:true,
        irreversibleEmergencyStop:true,
        sameProcessCloseReopen:true,
        independentFictionalAccounting:true,
        noAutomaticCancellation:true,
        realOrdersCreated:0,chainTransactionsBroadcast:0,externalCalls:0,
        MacOperatorAcceptance:'NOT_RUN'
      }),
      reviews:before.reviewCount,
      stopState:before.emergencyStop.state,
      fictionalCashTicks:before.risk.cash.totalTicks,
      fictionalReservedTicks:before.risk.cash.reservedTicks,
      sourceAuthenticity:'ENGINEERED_FIXTURE_ONLY',
      note:'Fictional release and irreversible stop do not transfer assets or contact a broker.'
    });
  }finally{
    if(journal)await journal.close().catch(()=>{});
    await rm(dir,{recursive:true,force:true});
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try {process.stdout.write(JSON.stringify(
    await acceptFictionalOperatorControls(process.argv.slice(2)),null,2)+'\n');}
  catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
