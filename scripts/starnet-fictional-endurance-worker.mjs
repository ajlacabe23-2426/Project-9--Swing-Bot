/**
 * STRICTLY DISPOSABLE, OFFLINE child-process fixture worker.
 * Invoked only by the automated fictional endurance acceptance runner.
 * No accounts, real quotes, trading routes, wallets, RPCs or network calls.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFictionalExecutionJournal} from '../src/starnet-fictional-execution-journal.mjs';
import {auditFictionalRiskJournalReport} from '../src/starnet-fictional-reconciliation-audit.mjs';

const missing='MISSING';
const policy=()=>({
  schema:'project9-fictional-risk-policy-v1',scope:'FICTIONAL_OFFLINE',
  startingCashTicks:100_000,maxOrderNotionalTicks:9000,
  initialHoldings:[
    {rail:'LISTED_EQUITY',instrumentId:'SIM-EQUITY-ONE',units:30},
    {rail:'TOKENIZED_SECURITY',instrumentId:'SIM-TOKEN-ONE',units:6}
  ]
});
const rail=token=>({
  schema:'project9-market-rail-descriptor-v1',scope:'FICTIONAL_OFFLINE',
  rail:token?'TOKENIZED_SECURITY':'LISTED_EQUITY',
  instrumentId:token?'SIM-TOKEN-ONE':'SIM-EQUITY-ONE',
  referenceInstrument:token?'SIM-EQUITY-ONE':null,
  declaredEvidence:token?{
    issuerAndLegalForm:missing,underlyingRights:missing,custodyOrBacking:missing,
    networkAndGovernance:missing,transferRestrictions:missing,
    redemptionAndReconciliation:missing,dataRights:missing
  }:{
    listingIdentity:missing,dataRights:missing,exchangeCalendar:missing,
    corporateActions:missing,custodyAndOwnership:missing
  }
});
const intent=(id,side,units,token=false)=>({
  schema:'project9-sim-order-intent-v1',scope:'FICTIONAL_OFFLINE',
  intentId:'SIM-ORDER-'+id,railDescriptor:rail(token),
  side,orderType:'LIMIT',units,limitPriceTicks:1000
});
const message=(id,order,sequence,kind,filledUnits=0,token=false)=>({
  schema:'project9-fictional-execution-message-v1',
  scope:'FICTIONAL_OFFLINE',source:'ENGINEERED_LOCAL_FIXTURE',
  messageId:'SIM-MSG-'+id,intentId:'SIM-ORDER-'+order,
  declaredRail:token?'TOKENIZED_SECURITY':'LISTED_EQUITY',
  sequence,kind,filledUnits
});
const review=()=>({
  schema:'project9-fictional-quarantine-review-v1',scope:'FICTIONAL_OFFLINE',
  reviewId:'SIM-REVIEW-EARLY',messageId:'SIM-MSG-EARLY',
  action:'RELEASE',reason:'SEQUENCE_VERIFIED_IN_LOCAL_FIXTURE',
  operator:'SIM-OPERATOR-LAB'
});
const stop=()=>({
  schema:'project9-fictional-emergency-stop-v1',scope:'FICTIONAL_OFFLINE',
  stopId:'SIM-STOP-ENDURANCE',reason:'SIMULATED_INCIDENT',
  operator:'SIM-OPERATOR-LAB'
});
const idx=(prefix,i)=>prefix+String(i).padStart(2,'0');

async function init(j){
  await j.initializeRiskPolicy(policy());
  for(let i=1;i<=12;i++){
    assert.equal((await j.submit(intent(idx('B',i),'BUY',8))).decision,'APPROVED');
  }
  for(let i=1;i<=6;i++){
    assert.equal((await j.submit(intent(idx('E',i),'SELL',4))).decision,'APPROVED');
  }
  for(let i=1;i<=3;i++){
    assert.equal((await j.submit(intent(idx('T',i),'SELL',2,true))).decision,'APPROVED');
  }
  const rejected=[
    [intent('D01','BUY',6),'INSUFFICIENT_AVAILABLE_CASH'],
    [intent('D02','BUY',10),'ORDER_NOTIONAL_CAP'],
    [intent('D03','SELL',10),'INSUFFICIENT_AVAILABLE_HOLDINGS'],
    [intent('D04','SELL',1,true),'INSUFFICIENT_AVAILABLE_HOLDINGS']
  ];
  for(const [item,reason] of rejected){
    assert.equal((await j.submit(item)).reason,reason);
  }
}
async function buys(j){
  const held=await j.receiveFictionalMessage(message('EARLY','B01',2,'FILL',2));
  assert.equal(held.reason,'FUTURE_SEQUENCE_HELD_NOT_AUTO_REPLAYED');
  const ack=message('B01ACK','B01',1,'ACK');
  assert.equal((await j.receiveFictionalMessage(ack)).disposition,'SIMULATED_APPLIED');
  assert.equal((await j.receiveFictionalMessage(ack)).redelivery,'EXACT_RETRY_NO_WRITE');
  assert.equal((await j.reviewFictionalMessage(review())).outcome,'RELEASED_TO_FICTIONAL_LEDGER');
  await j.receiveFictionalMessage(message('B01CANCEL','B01',3,'CANCEL'));
  for(let i=2;i<=6;i++){
    const id=idx('B',i);
    await j.receiveFictionalMessage(message(id+'ACK',id,1,'ACK'));
    await j.receiveFictionalMessage(message(id+'FILL',id,2,'FILL',2));
    await j.receiveFictionalMessage(message(id+'CANCEL',id,3,'CANCEL'));
  }
  for(let i=7;i<=12;i++){
    const id=idx('B',i);
    await j.receiveFictionalMessage(message(id+'ACK',id,1,'ACK'));
    await j.receiveFictionalMessage(message(id+'CANCEL',id,2,'CANCEL'));
  }
}
async function sellsAndStop(j){
  for(let i=1;i<=6;i++){
    const id=idx('E',i);
    assert.equal((await j.receiveFictionalMessage(message(id+'ACK',id,1,'ACK'))).disposition,'SIMULATED_APPLIED');
    assert.equal((await j.receiveFictionalMessage(message(id+'FILL',id,2,'FILL',4))).disposition,'SIMULATED_APPLIED');
  }
  for(let i=1;i<=3;i++){
    const id=idx('T',i);
    assert.equal((await j.receiveFictionalMessage(message(id+'ACK',id,1,'ACK',0,true))).disposition,'SIMULATED_APPLIED');
    assert.equal((await j.receiveFictionalMessage(message(id+'FILL',id,2,'FILL',2,true))).disposition,'SIMULATED_APPLIED');
  }
  assert.equal((await j.emergencyStopFictionalLab(stop())).state,'STOPPED_LATCHED');
}

export async function performFictionalEnduranceStage(stage,directory) {
  if(!['init','buys','sells-stop','verify','hold-lock'].includes(stage)||
     typeof directory!=='string')throw new TypeError('Fictional fixture stage only');
  const j=await openFictionalExecutionJournal(directory);
  if(stage==='hold-lock'){
    const report=await j.report();
    assert.equal(report.reviewCount,1);
    assert.equal(report.emergencyStop.state,'RUNNING');
    process.stdout.write('READY\n');
    await new Promise(()=>{}); // deliberately stay alive until owner SIGKILL
    return;
  }
  try{
    if(stage==='init')await init(j);
    if(stage==='buys')await buys(j);
    if(stage==='sells-stop')await sellsAndStop(j);
    const report=await j.report();
    const audit=auditFictionalRiskJournalReport(report);
    assert.equal(audit.finding,'PASS_FICTIONAL_ARITHMETIC_ONLY');
    assert.equal(report.controls.productionGate,'NO_GO');
    const raw=await readFile(join(directory,'journal.json'));
    const checksum=createHash('sha256').update(raw).digest('hex');
    const snapshot={
      stage,revision:report.revision,headHash:report.headHash,
      diskChecksum:checksum,fictionalCashTicks:report.risk.cash.totalTicks,
      reservedTicks:report.risk.cash.reservedTicks,
      decisions:report.risk.orderCount,events:report.risk.eventCount,
      messages:report.messageCount,reviews:report.reviewCount,
      stop:report.emergencyStop.state,
      equityUnits:report.risk.holdings.find(x=>x.rail==='LISTED_EQUITY').totalUnits,
      tokenUnits:report.risk.holdings.find(x=>x.rail==='TOKENIZED_SECURITY').totalUnits,
      productionGate:report.controls.productionGate,
      externalCalls:report.risk.controls.externalCalls,
      realOrdersCreated:report.risk.controls.realOrdersCreated
    };
    if(stage==='init'){
      assert.equal(snapshot.revision,26);
      assert.equal(snapshot.decisions,25);
      assert.equal(snapshot.fictionalCashTicks,100000);
      assert.equal(snapshot.reservedTicks,96000);
      assert.equal(snapshot.events,0);
    }
    if(stage==='buys'){
      assert.equal(snapshot.revision,57);
      assert.equal(snapshot.events,30);
      assert.equal(snapshot.messages,30);
      assert.equal(snapshot.reviews,1);
      assert.equal(snapshot.fictionalCashTicks,88000);
      assert.equal(snapshot.reservedTicks,0);
      assert.equal(snapshot.equityUnits,42);
    }
    if(stage==='sells-stop'){
      assert.equal(snapshot.revision,76);
      assert.equal(snapshot.events,48);
      assert.equal(snapshot.messages,48);
      assert.equal(snapshot.reviews,1);
      assert.equal(snapshot.fictionalCashTicks,118000);
      assert.equal(snapshot.equityUnits,18);
      assert.equal(snapshot.tokenUnits,0);
      assert.equal(snapshot.stop,'STOPPED_LATCHED');
      await assert.rejects(j.submit(intent('EXTRA','BUY',1)),/stop latched/);
    }
    return Object.freeze(snapshot);
  } finally {await j.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2);
  if(args.length!==4||args[0]!=='--stage'||args[2]!=='--lab'){
    process.stderr.write('Strict fictional fixture worker requires --stage NAME --lab PRIVATE_DIR\n');
    process.exitCode=1;
  }else{
    try {
      const data=await performFictionalEnduranceStage(args[1],args[3]);
      if(data)process.stdout.write(JSON.stringify(data)+'\n');
    }catch(error){process.stderr.write(error.stack||error.message);process.exitCode=1;}
  }
}
