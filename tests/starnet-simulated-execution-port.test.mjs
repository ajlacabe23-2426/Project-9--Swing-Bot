import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXECUTION_STATE, createSimulatedExecutionPort
} from '../src/starnet-simulated-execution-port.mjs';
import {MARKET_RAIL, EVIDENCE_DECLARATION} from '../src/starnet-market-rails.mjs';
import {runExecutionDemo} from '../scripts/review-simulated-execution.mjs';

const M = EVIDENCE_DECLARATION.MISSING;
function descriptor(rail = MARKET_RAIL.LISTED_EQUITY) {
  const base = {
    schema: 'project9-market-rail-descriptor-v1',
    scope: 'FICTIONAL_OFFLINE',
    rail,
    instrumentId: rail === MARKET_RAIL.LISTED_EQUITY
      ? 'SIM-EQUITY-ONE' : rail === MARKET_RAIL.TOKENIZED_SECURITY
        ? 'SIM-TOKEN-ONE' : 'SIM-CHAIN-ONE',
    referenceInstrument: rail === MARKET_RAIL.TOKENIZED_SECURITY
      ? 'SIM-EQUITY-ONE' : null,
    declaredEvidence: rail === MARKET_RAIL.LISTED_EQUITY
      ? {listingIdentity:M, dataRights:M, exchangeCalendar:M,
          corporateActions:M, custodyAndOwnership:M}
      : rail === MARKET_RAIL.TOKENIZED_SECURITY
        ? {issuerAndLegalForm:M, underlyingRights:M, custodyOrBacking:M,
          networkAndGovernance:M, transferRestrictions:M,
          redemptionAndReconciliation:M, dataRights:M}
        : {}
  };
  return base;
}
const intent = (intentId='SIM-ORDER-ONE', rail=MARKET_RAIL.LISTED_EQUITY) => ({
  schema:'project9-sim-order-intent-v1', scope:'FICTIONAL_OFFLINE',
  intentId, railDescriptor:descriptor(rail),
  side:'BUY', orderType:'LIMIT', units:5, limitPriceTicks:1000
});
const event = (eventId, intentId, kind, filledUnits=0) => ({
  schema:'project9-sim-execution-event-v1', scope:'FICTIONAL_OFFLINE',
  eventId, intentId, kind, filledUnits
});

test('two partial fictional fills, terminal fill and reconciliation preserve exact units', () => {
  const port=createSimulatedExecutionPort();
  const input=intent();
  const copied=structuredClone(input);
  let r=port.submit(input);
  assert.deepEqual(input,copied);
  assert.equal(r.status,EXECUTION_STATE.PREPARED);
  assert.equal(r.remainingUnits,5);
  assert.equal(r.safety.realOrdersCreated,0);
  assert.equal(r.safety.chainTransactionsBroadcast,0);
  assert.equal(r.safety.productionGate,'NO_GO');
  r=port.recordEvent(event('SIM-EVENT-ACK','SIM-ORDER-ONE','ACK'));
  assert.equal(r.status,EXECUTION_STATE.SIMULATED_ACCEPTED);
  r=port.recordEvent(event('SIM-EVENT-PARTONE','SIM-ORDER-ONE','FILL',2));
  assert.equal(r.status,EXECUTION_STATE.SIMULATED_PARTIAL);
  assert.equal(r.filledUnits,2);
  assert.equal(r.remainingUnits,3);
  assert.throws(()=>port.recordEvent(event('SIM-EVENT-OVER','SIM-ORDER-ONE','FILL',4)),/Overfill/);
  assert.equal(port.get('SIM-ORDER-ONE').filledUnits,2);
  r=port.recordEvent(event('SIM-EVENT-PARTTWO','SIM-ORDER-ONE','FILL',3));
  assert.equal(r.status,EXECUTION_STATE.SIMULATED_FILLED);
  assert.equal(r.remainingUnits,0);
  assert.throws(()=>port.recordEvent(event('SIM-EVENT-LATE','SIM-ORDER-ONE','FILL',1)),/transition denied/);
  r=port.recordEvent(event('SIM-EVENT-RECON','SIM-ORDER-ONE','RECONCILE'));
  assert.equal(r.status,EXECUTION_STATE.SIMULATED_RECONCILED);
  assert.equal(r.eventCount,4);
  assert.equal(r.safety.independentExecutionOrSettlementConfirmed,false);
  assert.ok(Object.isFrozen(r.events[0]));
  assert.ok(Object.isFrozen(r.safety));
});

test('retries are idempotent, but same id with different body is refused', () => {
  const port=createSimulatedExecutionPort();
  const original=intent();
  const first=port.submit(original);
  assert.deepEqual(port.submit(structuredClone(original)),first);
  assert.throws(()=>port.submit({...original,units:7}),/Conflicting retry/);
  port.recordEvent(event('SIM-EVENT-ACK','SIM-ORDER-ONE','ACK'));
  const one=event('SIM-EVENT-FILL','SIM-ORDER-ONE','FILL',2);
  assert.equal(port.recordEvent(one).filledUnits,2);
  assert.equal(port.recordEvent({...one}).filledUnits,2);
  assert.equal(port.get('SIM-ORDER-ONE').eventCount,2);
  assert.throws(()=>port.recordEvent({...one,filledUnits:3}),/Conflicting event/);
  port.submit(intent('SIM-ORDER-TWO'));
  assert.throws(()=>port.recordEvent({...one,intentId:'SIM-ORDER-TWO'}),/cross-order/);
  assert.equal(port.get('SIM-ORDER-TWO').filledUnits,0);
});

test('partial cancellation preserves fictional partial observations, rejects future fills', () => {
  const port=createSimulatedExecutionPort();
  port.submit(intent());
  port.recordEvent(event('SIM-EVENT-ACK','SIM-ORDER-ONE','ACK'));
  port.recordEvent(event('SIM-EVENT-FILL','SIM-ORDER-ONE','FILL',1));
  const r=port.recordEvent(event('SIM-EVENT-CANCEL','SIM-ORDER-ONE','CANCEL'));
  assert.equal(r.status,EXECUTION_STATE.SIMULATED_CANCELLED);
  assert.equal(r.filledUnits,1);
  assert.equal(r.remainingUnits,4);
  assert.throws(()=>port.recordEvent(event('SIM-EVENT-LATE','SIM-ORDER-ONE','FILL',1)),/transition denied/);
  assert.equal(port.recordEvent(event('SIM-EVENT-RECON','SIM-ORDER-ONE','RECONCILE')).status,
    EXECUTION_STATE.SIMULATED_RECONCILED);
});

test('reject path can be reconciled, ACK and FILL transitions cannot skip stages', () => {
  const port=createSimulatedExecutionPort();
  port.submit(intent());
  assert.throws(()=>port.recordEvent(event('SIM-EVENT-EARLY','SIM-ORDER-ONE','FILL',1)),/transition denied/);
  assert.throws(()=>port.recordEvent(event('SIM-EVENT-EARLYRECON','SIM-ORDER-ONE','RECONCILE')),/transition denied/);
  assert.equal(port.recordEvent(event('SIM-EVENT-REJECT','SIM-ORDER-ONE','REJECT')).status,
    EXECUTION_STATE.SIMULATED_REJECTED);
  assert.throws(()=>port.recordEvent(event('SIM-EVENT-ACK','SIM-ORDER-ONE','ACK')),/transition denied/);
  assert.equal(port.recordEvent(event('SIM-EVENT-RECON','SIM-ORDER-ONE','RECONCILE')).status,
    EXECUTION_STATE.SIMULATED_RECONCILED);
});

test('separate listed equity and tokenized security share state machine but never share orders', () => {
  const port=createSimulatedExecutionPort();
  const stock=port.submit(intent('SIM-ORDER-STOCK',MARKET_RAIL.LISTED_EQUITY));
  const token=port.submit(intent('SIM-ORDER-TOKEN',MARKET_RAIL.TOKENIZED_SECURITY));
  assert.equal(stock.rail,MARKET_RAIL.LISTED_EQUITY);
  assert.equal(token.rail,MARKET_RAIL.TOKENIZED_SECURITY);
  assert.equal(stock.instrumentId,'SIM-EQUITY-ONE');
  assert.equal(token.instrumentId,'SIM-TOKEN-ONE');
  assert.equal(token.referenceInstrument,'SIM-EQUITY-ONE');
  port.recordEvent(event('SIM-EVENT-STOCKACK','SIM-ORDER-STOCK','ACK'));
  assert.equal(port.get('SIM-ORDER-TOKEN').status,EXECUTION_STATE.PREPARED);
  assert.equal(port.list().length,2);
  assert.equal(port.get('SIM-ORDER-OTHER'),null);
  assert.ok(Object.isFrozen(port.list()));
});

test('out of scope rails, real orders, credentials, invalid units and malformed events fail closed', () => {
  const port=createSimulatedExecutionPort();
  assert.throws(()=>port.submit(intent('SIM-ORDER-CHAIN',MARKET_RAIL.NATIVE_BLOCKCHAIN_ASSET)),/not supported/);
  assert.throws(()=>port.submit({...intent(),scope:'LIVE'}),/scope/);
  assert.throws(()=>port.submit({...intent(),intentId:'AAPL'}),/identity/);
  assert.throws(()=>port.submit({...intent(),orderType:'MARKET'}),/LIMIT/);
  assert.throws(()=>port.submit({...intent(),units:0}),/integer from 1/);
  assert.throws(()=>port.submit({...intent(),units:1.5}),/integer from 1/);
  assert.throws(()=>port.submit({...intent(),apiKey:'secret'}),/Exact offline/);
  assert.throws(()=>port.submit({...intent(),accountId:'sensitive'}),/Exact offline/);
  assert.throws(()=>port.submit({...intent(),signingKey:'secret'}),/Exact offline/);
  assert.throws(()=>port.submit({...intent(),limitPriceTicks:Infinity}),/price ticks/);
  port.submit(intent());
  assert.throws(()=>port.recordEvent(event('SIM-EVENT-NOORDER','SIM-ORDER-MISSING','ACK')),/Unknown/);
  assert.throws(()=>port.recordEvent({...event('SIM-EVENT-ACK','SIM-ORDER-ONE','ACK'),scope:'LIVE'}),/scope/);
  assert.throws(()=>port.recordEvent({...event('SIM-EVENT-ACK','SIM-ORDER-ONE','ACK'),transactionHash:'abc'}),/Exact offline/);
  assert.throws(()=>port.recordEvent(event('SIM-EVENT-ACK','SIM-ORDER-ONE','ACK',1)),/zero units/);
  assert.throws(()=>port.recordEvent(event('SIM-EVENT-FILL','SIM-ORDER-ONE','FILL',0)),/positive/);
  assert.throws(()=>port.recordEvent(event('SIM-EVENT-UNKNOWN','SIM-ORDER-ONE','SETTLE')),/Unknown event kind/);
  assert.equal(port.get('SIM-ORDER-ONE').eventCount,0);
});

test('strict demonstration command never accepts live flags, retains NO_GO', () => {
  const r=runExecutionDemo(['--demo']);
  assert.equal(r.schema,'project9-starnet-fictional-execution-demo-v1');
  assert.equal(r.productionGate,'NO_GO');
  assert.equal(r.stock.status,EXECUTION_STATE.SIMULATED_RECONCILED);
  assert.equal(r.token.status,EXECUTION_STATE.SIMULATED_CANCELLED);
  assert.equal(r.stock.safety.realOrdersCreated,0);
  assert.equal(r.token.safety.chainTransactionsBroadcast,0);
  for(const bad of [[], ['--live'], ['--demo','--paper-auto'], ['--demo','--broker']]) {
    assert.throws(()=>runExecutionDemo(bad),/Usage:/);
  }
});
