/**
 * StarNet proof of an execution-oriented order state machine ONLY.
 * No IO, credentials, market access, account state, or live transaction path.
 */
import {pathToFileURL} from 'node:url';
import {MARKET_RAIL, EVIDENCE_DECLARATION} from '../src/starnet-market-rails.mjs';
import {createSimulatedExecutionPort} from '../src/starnet-simulated-execution-port.mjs';

const M=EVIDENCE_DECLARATION.MISSING;
function sampleDescriptor(rail) {
  return {
    schema:'project9-market-rail-descriptor-v1',
    scope:'FICTIONAL_OFFLINE',
    rail,
    instrumentId:rail === MARKET_RAIL.LISTED_EQUITY ? 'SIM-EQUITY-ONE' : 'SIM-TOKEN-ONE',
    referenceInstrument:rail === MARKET_RAIL.TOKENIZED_SECURITY ? 'SIM-EQUITY-ONE' : null,
    declaredEvidence:rail === MARKET_RAIL.LISTED_EQUITY ? {
      listingIdentity:M, dataRights:M, exchangeCalendar:M,
      corporateActions:M, custodyAndOwnership:M
    } : {
      issuerAndLegalForm:M, underlyingRights:M, custodyOrBacking:M,
      networkAndGovernance:M, transferRestrictions:M,
      redemptionAndReconciliation:M, dataRights:M
    }
  };
}
function intent(id,rail) {
  return {
    schema:'project9-sim-order-intent-v1',scope:'FICTIONAL_OFFLINE',
    intentId:id,railDescriptor:sampleDescriptor(rail),
    side:'BUY',orderType:'LIMIT',units:5,limitPriceTicks:1000
  };
}
function event(id,intentId,kind,filledUnits=0) {
  return {
    schema:'project9-sim-execution-event-v1',scope:'FICTIONAL_OFFLINE',
    eventId:id,intentId,kind,filledUnits
  };
}
export function makeFictionalExecutionDemo() {
  const port=createSimulatedExecutionPort();
  const stockId='SIM-ORDER-STOCK';
  const tokenId='SIM-ORDER-TOKEN';
  port.submit(intent(stockId,MARKET_RAIL.LISTED_EQUITY));
  port.submit(intent(tokenId,MARKET_RAIL.TOKENIZED_SECURITY));
  port.recordEvent(event('SIM-EVENT-STOCKACK',stockId,'ACK'));
  port.recordEvent(event('SIM-EVENT-STOCKPART',stockId,'FILL',2));
  port.recordEvent(event('SIM-EVENT-STOCKFINAL',stockId,'FILL',3));
  port.recordEvent(event('SIM-EVENT-STOCKRECON',stockId,'RECONCILE'));
  port.recordEvent(event('SIM-EVENT-TOKENACK',tokenId,'ACK'));
  port.recordEvent(event('SIM-EVENT-TOKENPART',tokenId,'FILL',1));
  port.recordEvent(event('SIM-EVENT-TOKENCANCEL',tokenId,'CANCEL'));
  return {
    schema:'project9-starnet-fictional-execution-demo-v1',
    scope:'ENGINEERED_FICTIONAL_OFFLINE',
    stock:port.get(stockId),
    token:port.get(tokenId),
    note:'Completion and reconciliation labels are in-memory fictional events, not actual order fills, settlement or verified ownership',
    productionGate:'NO_GO'
  };
}
export function runExecutionDemo(argv) {
  if(argv.length!==1 || argv[0]!=='--demo') {
    throw new TypeError('Usage: npm run research:execution -- --demo (fictional/offline only)');
  }
  return makeFictionalExecutionDemo();
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(JSON.stringify(runExecutionDemo(process.argv.slice(2)),null,2)+'\n');
  } catch(error) {
    process.stderr.write(error.message+'\n');
    process.exitCode=1;
  }
}
