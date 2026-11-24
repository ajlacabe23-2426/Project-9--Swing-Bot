/**
 * Explicit fictional cash/holdings acceptance. No real account, wallet,
 * external market data or funds. Only --demo is supported.
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
  scope:'FICTIONAL_OFFLINE',startingCashTicks:10000,
  initialHoldings:[
    {rail:'LISTED_EQUITY',instrumentId:'SIM-EQUITY-ONE',units:5},
    {rail:'TOKENIZED_SECURITY',instrumentId:'SIM-TOKEN-ONE',units:2}
  ],maxOrderNotionalTicks:9000
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
  schema:'project9-sim-order-intent-v1',scope:'FICTIONAL_OFFLINE',
  intentId:id,railDescriptor:descriptor(token),
  side,orderType:'LIMIT',units,limitPriceTicks:1000
});
const event=(id,intentId,kind,filledUnits=0)=>({
  schema:'project9-sim-execution-event-v1',scope:'FICTIONAL_OFFLINE',
  eventId:id,intentId,kind,filledUnits
});

export async function acceptFictionalRiskAccounting(args){
  if(args.length!==1||args[0]!=='--demo')
    throw new TypeError('Usage: npm run accept:fictional-risk -- --demo (offline only)');
  const dir=await mkdtemp(join(tmpdir(),'p9-execution-lab-'));
  let journal;
  try{
    journal=await openFictionalExecutionJournal(dir);
    await journal.initializeRiskPolicy(policy());
    const accept=await journal.submit(order('SIM-ORDER-PRIMARY','BUY',8));
    assert.equal(accept.decision,'APPROVED');
    const denied=await journal.submit(order('SIM-ORDER-OVERSPEND','BUY',3));
    assert.equal(denied.reason,'INSUFFICIENT_AVAILABLE_CASH');
    const acceptedSell=await journal.submit(order('SIM-ORDER-TOKENSALE','SELL',2,true));
    assert.equal(acceptedSell.decision,'APPROVED');
    const deniedSell=await journal.submit(order('SIM-ORDER-DOUBLESELL','SELL',1,true));
    assert.equal(deniedSell.reason,'INSUFFICIENT_AVAILABLE_HOLDINGS');
    await journal.recordEvent(event('SIM-EVENT-ACK','SIM-ORDER-PRIMARY','ACK'));
    await journal.recordEvent(event('SIM-EVENT-FILL','SIM-ORDER-PRIMARY','FILL',2));
    await journal.recordEvent(event('SIM-EVENT-CANCEL','SIM-ORDER-PRIMARY','CANCEL'));
    await journal.recordEvent(event('SIM-EVENT-SALEACK','SIM-ORDER-TOKENSALE','ACK'));
    await journal.recordEvent(event('SIM-EVENT-SALEFILL','SIM-ORDER-TOKENSALE','FILL',2));
    const first=await journal.report();
    assert.equal(first.risk.cash.totalTicks,10000);
    assert.equal(first.risk.cash.reservedTicks,0);
    assert.equal(first.risk.cash.availableTicks,10000);
    assert.equal(first.risk.holdings.find(h=>h.rail==='TOKENIZED_SECURITY').totalUnits,0);
    assert.equal(first.risk.holdings.find(h=>h.rail==='LISTED_EQUITY').totalUnits,7);
    assert.equal(first.risk.decisions.length,4);
    assert.equal(first.risk.controls.productionGate,'NO_GO');
    const persistedBytes=await readFile(join(dir,'journal.json'));
    await journal.close();journal=null;
    journal=await openFictionalExecutionJournal(dir);
    const replay=await journal.report();
    assert.deepEqual(replay,first);
    const independentAudit=auditFictionalRiskJournalReport(replay);
    assert.equal(independentAudit.finding,'PASS_FICTIONAL_ARITHMETIC_ONLY');
    assert.equal(independentAudit.checkedDecisions,4);
    assert.equal(independentAudit.checkedEvents,5);
    assert.equal(independentAudit.expectedCashTicks,10000);
    assert.equal(independentAudit.safety.realOrdersCreated,0);
    await journal.submit(order('SIM-ORDER-OVERSPEND','BUY',3)); // exact denied retry
    await journal.recordEvent(event('SIM-EVENT-ACK','SIM-ORDER-PRIMARY','ACK'));
    assert.deepEqual(await readFile(join(dir,'journal.json')),persistedBytes);
    return Object.freeze({
      schema:'project9-fictional-risk-acceptance-v1',
      scope:'ENGINEERED_FICTIONAL_OFFLINE',
      softwareGate:'PASS',productionGate:'NO_GO',
      checks:Object.freeze({
        cashReservation:true,holdingsReservation:true,overspendDenied:true,
        doubleSellDenied:true,partialFillAccounting:true,
        independentlyRecomputedFictionalBalances:true,
        cancellationRelease:true,sameProcessReopen:true,
        duplicateRetriesByteIdentical:true,externalCalls:0,
        realOrdersCreated:0,blockchainBroadcasts:0,
        localMacOperatorAcceptance:'NOT_RUN'
      }),
      journalRevision:first.revision,
      reconciliation:Object.freeze({finding:independentAudit.finding,
        checkedEvents:independentAudit.checkedEvents,
        outstandingFictionalOrders:independentAudit.outstandingFictionalOrders,
        authenticExecutionsVerified:false}),
      finalCashTicks:replay.risk.cash.totalTicks,
      decisionCount:replay.risk.orderCount,
      note:'These are invented exercise units and ticks, not brokerage assets or on-chain holdings.'
    });
  }finally{
    if(journal)await journal.close().catch(()=>{});
    await rm(dir,{recursive:true,force:true});
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{process.stdout.write(JSON.stringify(
    await acceptFictionalRiskAccounting(process.argv.slice(2)),null,2)+'\n');}
  catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
