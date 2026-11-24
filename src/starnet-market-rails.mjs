/**
 * StarNet research-only rail identity contract.
 * Pure classification: no network, account, position, order, settlement,
 * signing, wallet, market feed, persistence, or execution actions.
 */
export const MARKET_RAIL = Object.freeze({
  LISTED_EQUITY: 'LISTED_EQUITY',
  TOKENIZED_SECURITY: 'TOKENIZED_SECURITY',
  NATIVE_BLOCKCHAIN_ASSET: 'NATIVE_BLOCKCHAIN_ASSET'
});

export const EVIDENCE_DECLARATION = Object.freeze({
  MISSING: 'MISSING',
  DECLARED_UNVERIFIED: 'DECLARED_UNVERIFIED'
});

const EVIDENCE_FIELDS = Object.freeze({
  LISTED_EQUITY: Object.freeze([
    'listingIdentity', 'dataRights', 'exchangeCalendar',
    'corporateActions', 'custodyAndOwnership'
  ]),
  TOKENIZED_SECURITY: Object.freeze([
    'issuerAndLegalForm', 'underlyingRights', 'custodyOrBacking',
    'networkAndGovernance', 'transferRestrictions', 'redemptionAndReconciliation',
    'dataRights'
  ]),
  NATIVE_BLOCKCHAIN_ASSET: Object.freeze([])
});

const INPUT_KEYS = Object.freeze([
  'schema', 'scope', 'rail', 'instrumentId', 'referenceInstrument',
  'declaredEvidence'
]);
const hasOnlyKeys = (value, keys) =>
  Object.getPrototypeOf(value) === Object.prototype &&
  Reflect.ownKeys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
const fail = message => { throw new TypeError(message); };
const fictionalId = value =>
  typeof value === 'string' && /^SIM-[A-Z0-9]+(?:-[A-Z0-9]+){0,5}$/.test(value) &&
  value.length <= 64;

export function reviewMarketRail(input) {
  if (!input || typeof input !== 'object' || !hasOnlyKeys(input, INPUT_KEYS)) {
    fail('Exact, metadata-only rail descriptor required');
  }
  if (input.schema !== 'project9-market-rail-descriptor-v1' ||
      input.scope !== 'FICTIONAL_OFFLINE') fail('Unsupported rail contract or scope');
  if (!Object.hasOwn(EVIDENCE_FIELDS, input.rail)) fail('Unknown market rail');
  if (!fictionalId(input.instrumentId)) fail('Fictional SIM instrument identity required');
  if (!input.declaredEvidence || typeof input.declaredEvidence !== 'object') {
    fail('Evidence declaration object required');
  }

  const requirements = EVIDENCE_FIELDS[input.rail];
  if (!hasOnlyKeys(input.declaredEvidence, requirements)) {
    fail('Exact evidence keys required for this rail; no credentials or order fields');
  }
  for (const field of requirements) {
    if (!Object.values(EVIDENCE_DECLARATION).includes(input.declaredEvidence[field])) {
      fail('Invalid evidence declaration: ' + field);
    }
  }

  if (input.rail === MARKET_RAIL.TOKENIZED_SECURITY) {
    if (!fictionalId(input.referenceInstrument) ||
        input.referenceInstrument === input.instrumentId) {
      fail('Distinct fictional underlying reference required for tokenized security');
    }
  } else if (input.referenceInstrument !== null) {
    fail('Only tokenized securities may declare an underlying reference');
  }

  const missingEvidence = Object.freeze(requirements.filter(
    field => input.declaredEvidence[field] === EVIDENCE_DECLARATION.MISSING
  ));
  const unsupported = input.rail === MARKET_RAIL.NATIVE_BLOCKCHAIN_ASSET;
  const reviewState = unsupported ? 'NOT_IN_SCOPE' :
    missingEvidence.length ? 'INCOMPLETE_DECLARATIONS' : 'DECLARED_NOT_INDEPENDENTLY_VERIFIED';

  return Object.freeze({
    schema: 'project9-market-rail-review-v1',
    instrumentId: input.instrumentId,
    rail: input.rail,
    referenceInstrument: input.referenceInstrument,
    reviewState,
    evidence: Object.freeze({
      declaredCount: requirements.length - missingEvidence.length,
      requiredCount: requirements.length,
      missingFields: missingEvidence,
      authenticityVerified: false,
      legalRightsVerified: false,
      underlyingEquivalenceVerified: false
    }),
    controls: Object.freeze({
      purpose: 'RESEARCH_CLASSIFICATION_ONLY',
      assetExecutionSupported: false,
      paperOrderCreated: false,
      brokerConnected: false,
      walletConnected: false,
      chainConnected: false,
      externalCalls: 0,
      realOrdersCreated: 0,
      chainTransactionsBroadcast: 0,
      productionGate: 'NO_GO'
    })
  });
}

/**
 * A matching reference label does not establish that a token has the same
 * legal rights, custody, fungibility, corporate actions, or ownership as a
 * conventionally listed share.
 */
export function compareRailIdentities(first, second) {
  const a = reviewMarketRail(first), b = reviewMarketRail(second);
  return Object.freeze({
    schema: 'project9-rail-identity-comparison-v1',
    identifiersEqual: a.instrumentId === b.instrumentId,
    representationTypesEqual: a.rail === b.rail,
    independentlyProvenEquivalent: false,
    crossRailNettingPermitted: false,
    automaticConversionPermitted: false,
    liveDispatchAllowed: false,
    productionGate: 'NO_GO'
  });
}
