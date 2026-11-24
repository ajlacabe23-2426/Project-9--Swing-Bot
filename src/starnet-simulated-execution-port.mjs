/**
 * StarNet disconnected, fictional order-lifecycle port.
 *
 * Deliberately has no broker, wallet, blockchain, signing, HTTP,
 * account credentials, scheduling, filesystem, automatic fill producer,
 * or durable storage. This is NOT live order execution, settlement,
 * authenticated account reconciliation, or a cash/position risk engine.
 */
import {reviewMarketRail, MARKET_RAIL} from './starnet-market-rails.mjs';

export const EXECUTION_STATE = Object.freeze({
  PREPARED: 'PREPARED',
  SIMULATED_ACCEPTED: 'SIMULATED_ACCEPTED',
  SIMULATED_PARTIAL: 'SIMULATED_PARTIAL',
  SIMULATED_FILLED: 'SIMULATED_FILLED',
  SIMULATED_CANCELLED: 'SIMULATED_CANCELLED',
  SIMULATED_REJECTED: 'SIMULATED_REJECTED',
  SIMULATED_RECONCILED: 'SIMULATED_RECONCILED'
});
export const EXECUTION_EVENT = Object.freeze({
  ACK: 'ACK', FILL: 'FILL', CANCEL: 'CANCEL',
  REJECT: 'REJECT', RECONCILE: 'RECONCILE'
});

const ORDER_KEYS = Object.freeze([
  'schema', 'scope', 'intentId', 'railDescriptor',
  'side', 'orderType', 'units', 'limitPriceTicks'
]);
const EVENT_KEYS = Object.freeze([
  'schema', 'scope', 'eventId', 'intentId', 'kind', 'filledUnits'
]);
const fail = message => { throw new TypeError(message); };
const plainExact = (object, keys) =>
  object !== null && typeof object === 'object' &&
  Object.getPrototypeOf(object) === Object.prototype &&
  Reflect.ownKeys(object).length === keys.length &&
  keys.every(key => Object.hasOwn(object, key));
const fictional = (value, prefix) =>
  typeof value === 'string' &&
  new RegExp('^SIM-' + prefix + '-[A-Z0-9]+(?:-[A-Z0-9]+){0,4}$').test(value) &&
  value.length <= 64;

function normalizedIntent(input) {
  if (!plainExact(input, ORDER_KEYS)) fail('Exact offline order-intent fields required');
  if (input.schema !== 'project9-sim-order-intent-v1' ||
      input.scope !== 'FICTIONAL_OFFLINE' ||
      !fictional(input.intentId, 'ORDER')) fail('Invalid fictional order scope or identity');
  const rail = reviewMarketRail(input.railDescriptor);
  if (rail.rail === MARKET_RAIL.NATIVE_BLOCKCHAIN_ASSET ||
      rail.reviewState === 'NOT_IN_SCOPE') fail('Native blockchain asset execution not supported');
  if (!['BUY', 'SELL'].includes(input.side)) fail('BUY or SELL side required');
  if (input.orderType !== 'LIMIT') fail('Only fictional LIMIT intents supported');
  if (!Number.isSafeInteger(input.units) || input.units < 1 || input.units > 100)
    fail('Fictional units must be an integer from 1 to 100');
  if (!Number.isSafeInteger(input.limitPriceTicks) ||
      input.limitPriceTicks < 1 || input.limitPriceTicks > 1_000_000_000)
    fail('Fictional price ticks must be a bounded positive integer');

  const evidence = Object.entries(input.railDescriptor.declaredEvidence)
    .sort(([a], [b]) => a.localeCompare(b));
  const stablePayload = JSON.stringify([
    input.schema, input.scope, input.intentId, rail.rail, rail.instrumentId,
    rail.referenceInstrument, evidence, input.side, input.orderType,
    input.units, input.limitPriceTicks
  ]);
  return {rail, stablePayload, intentId: input.intentId, side: input.side,
    units: input.units, limitPriceTicks: input.limitPriceTicks};
}

function normalizedEvent(input) {
  if (!plainExact(input, EVENT_KEYS)) fail('Exact offline execution-event fields required');
  if (input.schema !== 'project9-sim-execution-event-v1' ||
      input.scope !== 'FICTIONAL_OFFLINE' ||
      !fictional(input.eventId, 'EVENT') || !fictional(input.intentId, 'ORDER'))
    fail('Invalid fictional execution event or scope');
  if (!Object.values(EXECUTION_EVENT).includes(input.kind)) fail('Unknown event kind');
  if (!Number.isSafeInteger(input.filledUnits) ||
      (input.kind === 'FILL' && input.filledUnits < 1) ||
      (input.kind !== 'FILL' && input.filledUnits !== 0))
    fail('Fills must have positive integer units; other events require zero units');
  if (input.filledUnits > 100) fail('Fictional fill units exceed hard cap');
  return Object.freeze({
    eventId: input.eventId, intentId: input.intentId,
    kind: input.kind, filledUnits: input.filledUnits
  });
}

function snapshot(record) {
  return Object.freeze({
    schema: 'project9-sim-execution-record-v1',
    scope: 'FICTIONAL_OFFLINE',
    intentId: record.intentId,
    rail: record.rail.rail,
    instrumentId: record.rail.instrumentId,
    referenceInstrument: record.rail.referenceInstrument,
    side: record.side,
    orderType: 'LIMIT',
    units: record.units,
    limitPriceTicks: record.limitPriceTicks,
    filledUnits: record.filledUnits,
    remainingUnits: record.units - record.filledUnits,
    status: record.status,
    eventCount: record.events.length,
    events: Object.freeze(record.events.map(e => Object.freeze({...e}))),
    safety: Object.freeze({
      accounting: 'FICTIONAL_EVENT_UNITS_ONLY_NO_CASH_OR_POSITIONS',
      independentExecutionOrSettlementConfirmed: false,
      brokerConnected: false, chainConnected: false, walletConnected: false,
      externalCalls: 0, realOrdersCreated: 0, chainTransactionsBroadcast: 0,
      productionGate: 'NO_GO'
    })
  });
}

/**
 * In-memory simulation port. Single-instance/order exercise only.
 * No claim of cross-process idempotency or crash recovery.
 */
export function createSimulatedExecutionPort() {
  const orders = new Map();
  const events = new Map();
  const MAX_ORDERS = 100;
  const MAX_EVENTS = 1000;
  function submit(intent) {
    const normalized = normalizedIntent(intent);
    const existing = orders.get(normalized.intentId);
    if (existing) {
      if (existing.stablePayload !== normalized.stablePayload) {
        fail('Conflicting retry for fictional intent identity');
      }
      return snapshot(existing);
    }
    if (orders.size >= MAX_ORDERS) fail('Fictional order count exceeded');
    const record = {...normalized, status: EXECUTION_STATE.PREPARED,
      filledUnits: 0, events: []};
    orders.set(normalized.intentId, record);
    return snapshot(record);
  }

  function recordEvent(input) {
    const event = normalizedEvent(input);
    const existingEvent = events.get(event.eventId);
    if (existingEvent) {
      if (JSON.stringify(existingEvent) !== JSON.stringify(event)) {
        fail('Conflicting event identity or cross-order event replay');
      }
      return snapshot(orders.get(event.intentId));
    }
    const record = orders.get(event.intentId);
    if (!record) fail('Unknown fictional order; prepare before event');
    if (events.size >= MAX_EVENTS) fail('Fictional event count exceeded');

    const status = record.status;
    let next;
    switch (event.kind) {
      case EXECUTION_EVENT.ACK:
        if (status !== EXECUTION_STATE.PREPARED) fail('ACK transition denied');
        next = EXECUTION_STATE.SIMULATED_ACCEPTED;
        break;
      case EXECUTION_EVENT.FILL:
        if (![EXECUTION_STATE.SIMULATED_ACCEPTED,
              EXECUTION_STATE.SIMULATED_PARTIAL].includes(status))
          fail('FILL transition denied');
        if (event.filledUnits > record.units - record.filledUnits)
          fail('Overfill denied');
        next = event.filledUnits === record.units - record.filledUnits
          ? EXECUTION_STATE.SIMULATED_FILLED : EXECUTION_STATE.SIMULATED_PARTIAL;
        break;
      case EXECUTION_EVENT.CANCEL:
        if (![EXECUTION_STATE.PREPARED, EXECUTION_STATE.SIMULATED_ACCEPTED,
              EXECUTION_STATE.SIMULATED_PARTIAL].includes(status))
          fail('CANCEL transition denied');
        next = EXECUTION_STATE.SIMULATED_CANCELLED;
        break;
      case EXECUTION_EVENT.REJECT:
        if (status !== EXECUTION_STATE.PREPARED) fail('REJECT transition denied');
        next = EXECUTION_STATE.SIMULATED_REJECTED;
        break;
      case EXECUTION_EVENT.RECONCILE:
        if (![EXECUTION_STATE.SIMULATED_FILLED, EXECUTION_STATE.SIMULATED_CANCELLED,
              EXECUTION_STATE.SIMULATED_REJECTED].includes(status))
          fail('RECONCILE transition denied');
        next = EXECUTION_STATE.SIMULATED_RECONCILED;
        break;
      default:
        fail('Unsupported event');
    }

    // Only commit accepted transitions. No partial state writes on denial.
    if (event.kind === EXECUTION_EVENT.FILL) record.filledUnits += event.filledUnits;
    record.status = next;
    record.events.push(event);
    events.set(event.eventId, event);
    return snapshot(record);
  }

  function get(intentId) {
    if (!fictional(intentId, 'ORDER')) fail('Invalid fictional order identity');
    const record = orders.get(intentId);
    return record ? snapshot(record) : null;
  }
  function list() { return Object.freeze(Array.from(orders.values(), snapshot)); }

  return Object.freeze({submit, recordEvent, get, list});
}
