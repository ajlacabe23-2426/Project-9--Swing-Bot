/**
 * Self-contained executable acceptance on throwaway engineered fixtures only.
 * No user workstation files, brokerage accounts, network, wallets or chains.
 */
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {openFictionalExecutionJournal} from '../src/starnet-fictional-execution-journal.mjs';

const M='MISSING';
function descriptor(token) {
  return {
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
  };
}
const intent=(id,token)=>({
  schema:'project9-sim-order-intent-v1',scope:'FICTIONAL_OFFLINE',
  intentId:id,railDescriptor:descriptor(token),
  side:'BUY',orderType:'LIMIT',units:5,limitPriceTicks:900
});
const event=(id,order,kind,units=0)=>({
  schema:'project9-sim-execution-event-v1',scope:'FICTIONAL_OFFLINE',
  eventId:id,intentId:order,kind,filledUnits:units
});
export async function acceptFictionalExecutionJournal(argv) {
  if(argv.length!==1 || argv[0]!=='--demo') {
    throw new Error('Usage: npm run accept:fictional-execution -- --demo (offline temporary lab only)');
  }
  const directory=await mkdtemp(join(tmpdir(),'p9-execution-lab-'));
  let journal;
  try {
    journal=await openFictionalExecutionJournal(directory);
    const stock=intent('SIM-ORDER-STOCK',false);
    const token=intent('SIM-ORDER-TOKEN',true);
    await journal.submit(stock);
    await journal.submit(token);
    await journal.recordEvent(event('SIM-EVENT-STOCKACK',stock.intentId,'ACK'));
    await journal.recordEvent(event('SIM-EVENT-STOCKPART',stock.intentId,'FILL',2));
    await journal.recordEvent(event('SIM-EVENT-STOCKFINAL',stock.intentId,'FILL',3));
    await journal.recordEvent(event('SIM-EVENT-STOCKRECON',stock.intentId,'RECONCILE'));
    await journal.recordEvent(event('SIM-EVENT-TOKENACK',token.intentId,'ACK'));
    await journal.recordEvent(event('SIM-EVENT-TOKENCANCEL',token.intentId,'CANCEL'));
    const initial=await journal.report();
    assert.equal(initial.revision,8);
    const raw=await readFile(join(directory,'journal.json'));
    await journal.close();journal=null;
    journal=await openFictionalExecutionJournal(directory);
    const recovered=await journal.report();
    assert.deepEqual(recovered,initial);
    await journal.submit(stock); // exact duplicate must not append
    await journal.recordEvent(event('SIM-EVENT-STOCKACK',stock.intentId,'ACK'));
    assert.deepEqual(await readFile(join(directory,'journal.json')),raw);
    assert.equal((await journal.report()).revision,8);
    assert.equal(recovered.records[0].status,'SIMULATED_RECONCILED');
    assert.equal(recovered.records[1].status,'SIMULATED_CANCELLED');
    for(const record of recovered.records) {
      assert.equal(record.safety.realOrdersCreated,0);
      assert.equal(record.safety.chainTransactionsBroadcast,0);
      assert.equal(record.safety.externalCalls,0);
    }
    return Object.freeze({
      schema:'project9-fictional-execution-acceptance-v1',
      scope:'ENGINEERED_FICTIONAL_OFFLINE',
      softwareGate:'PASS',
      productionGate:'NO_GO',
      checks:Object.freeze({
        sameProcessCloseReopen:true,
        hashChainReplayed:true,
        retryIdentitiesPreserved:true,
        referenceRailSegregation:true,
        actualOrdersCreated:0,
        blockchainBroadcasts:0,
        externalCalls:0
      }),
      recoveredRevision:recovered.revision,
      resultingStates:recovered.records.map(record=>({
        rail:record.rail,status:record.status,
        filledUnits:record.filledUnits,remainingUnits:record.remainingUnits
      })),
      note:'Simulation labels are fabricated; not brokerage fills or chain settlement.'
    });
  }finally{
    if(journal)await journal.close().catch(()=>{});
    await rm(directory,{recursive:true,force:true});
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(JSON.stringify(
    await acceptFictionalExecutionJournal(process.argv.slice(2)),null,2)+'\n'); }
  catch(error) { process.stderr.write(error.message+'\n');process.exitCode=1; }
}
