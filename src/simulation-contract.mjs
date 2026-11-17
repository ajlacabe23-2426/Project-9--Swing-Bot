// Metadata-only contract for disconnected, fictional educational exercises.
// It neither computes financial results nor reads or writes data or networks.
export const ACCOUNTING_MODE = Object.freeze({
  OBSERVATION_REFERENCE: 'OBSERVATION_REFERENCE',
  FILLED_SIMULATION: 'FILLED_SIMULATION',
  RETROSPECTIVE_UNIT_REFERENCE: 'RETROSPECTIVE_UNIT_REFERENCE'
});
const sources = new Set(['SIM-01', 'SIM09', 'SIM10']);
const policies = Object.freeze({
  OBSERVATION_REFERENCE: Object.freeze({
    precision: 'REFERENCE_DISPLAY_ONLY',
    costs: 'NOT_APPLICABLE',
    capitalBasis: 'NO_LEDGER'
  }),
  FILLED_SIMULATION: Object.freeze({
    precision: 'VIRTUAL_LEDGER_DEFERRED',
    costs: 'VIRTUAL_COST_POLICY_DEFERRED',
    capitalBasis: 'FICTIONAL_LEDGER'
  })
});
const keys = Object.freeze(['version', 'mode', 'scope', 'sourceId',
  'prefixDigest', 'exerciseVersion', 'asOf', 'cursor', 'currency',
  'precision', 'costs', 'capitalBasis', 'visibility']);
const fail = message => { throw new TypeError(message); };
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validateSimulationContract(record) {
  if (!record || Object.getPrototypeOf(record) !== Object.prototype ||
      Reflect.ownKeys(record).length !== keys.length ||
      keys.some(key => !Object.hasOwn(record,key))) fail('Exact contract metadata required');
  if (record.version !== 1 || record.scope !== 'FICTIONAL_OFFLINE') fail('Unsupported contract or scope');
  if (typeof record.mode !== 'string' || !Object.hasOwn(policies,record.mode)) fail('Unsupported accounting mode');
  if (!sources.has(record.sourceId)) fail('Unrecognized fictional source');
  if (typeof record.prefixDigest !== 'string' || !/^[a-f0-9]{64}$/.test(record.prefixDigest)) fail('Invalid prefix identity');
  if (typeof record.exerciseVersion !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(record.exerciseVersion)) fail('Invalid exercise version');
  if (!validDate(record.asOf) || !Number.isSafeInteger(record.cursor) || record.cursor < 0) fail('Invalid as-of or cursor');
  if (record.currency !== 'USD' || record.visibility !== 'COMPLETED_PREFIX_ONLY') fail('Unsupported currency or visibility');
  for (const [key, value] of Object.entries(policies[record.mode])) {
    if (record[key] !== value) fail('Accounting policy mismatch: ' + key);
  }
  return Object.freeze(Object.fromEntries(keys.map(key => [key, record[key]])));
}
// Prevent mixing incompatible metadata; no amounts or aggregation are implemented.
export function assertSameAccountingDomain(records) {
  if (!Array.isArray(records) || !records.length) fail('Nonempty contract list required');
  const checked = Array.from(records,validateSimulationContract);
  const first = checked[0];
  for (const record of checked) {
    if (keys.some(key => record[key] !== first[key])) fail('Incompatible accounting domains or evidence');
  }
  return first;
}
