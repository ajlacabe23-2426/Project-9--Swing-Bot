import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MARKET_RAIL, EVIDENCE_DECLARATION, reviewMarketRail, compareRailIdentities
} from '../src/starnet-market-rails.mjs';

const E = EVIDENCE_DECLARATION;
const listedEvidence = () => ({
  listingIdentity: E.DECLARED_UNVERIFIED,
  dataRights: E.MISSING,
  exchangeCalendar: E.DECLARED_UNVERIFIED,
  corporateActions: E.MISSING,
  custodyAndOwnership: E.MISSING
});
const tokenEvidence = () => ({
  issuerAndLegalForm: E.MISSING,
  underlyingRights: E.MISSING,
  custodyOrBacking: E.MISSING,
  networkAndGovernance: E.MISSING,
  transferRestrictions: E.MISSING,
  redemptionAndReconciliation: E.MISSING,
  dataRights: E.MISSING
});
const stock = () => ({
  schema: 'project9-market-rail-descriptor-v1',
  scope: 'FICTIONAL_OFFLINE',
  rail: MARKET_RAIL.LISTED_EQUITY,
  instrumentId: 'SIM-EQUITY-ONE',
  referenceInstrument: null,
  declaredEvidence: listedEvidence()
});
const token = () => ({
  ...stock(),
  rail: MARKET_RAIL.TOKENIZED_SECURITY,
  instrumentId: 'SIM-TOKEN-ONE',
  referenceInstrument: 'SIM-EQUITY-ONE',
  declaredEvidence: tokenEvidence()
});

test('fictional listed equity has an explicit incomplete declaration and no execution path', () => {
  const input = stock();
  const previous = structuredClone(input);
  const report = reviewMarketRail(input);
  assert.deepEqual(input, previous, 'review must not mutate input');
  assert.equal(report.rail, MARKET_RAIL.LISTED_EQUITY);
  assert.equal(report.reviewState, 'INCOMPLETE_DECLARATIONS');
  assert.deepEqual(report.evidence.missingFields,
    ['dataRights', 'corporateActions', 'custodyAndOwnership']);
  assert.equal(report.controls.productionGate, 'NO_GO');
  assert.equal(report.controls.realOrdersCreated, 0);
  assert.equal(report.controls.externalCalls, 0);
  assert.equal(report.controls.assetExecutionSupported, false);
  assert.ok(Object.isFrozen(report.controls));
});

test('even all documented claims do not become independently verified or actionable', () => {
  const candidate = stock();
  for (const key of Object.keys(candidate.declaredEvidence)) {
    candidate.declaredEvidence[key] = E.DECLARED_UNVERIFIED;
  }
  const report = reviewMarketRail(candidate);
  assert.equal(report.reviewState, 'DECLARED_NOT_INDEPENDENTLY_VERIFIED');
  assert.equal(report.evidence.authenticityVerified, false);
  assert.equal(report.evidence.legalRightsVerified, false);
  assert.equal(report.controls.realOrdersCreated, 0);
  assert.equal(report.controls.productionGate, 'NO_GO');
});

test('tokenized security is a distinct representation; identity comparison never grants fungibility', () => {
  const t = reviewMarketRail(token());
  assert.equal(t.rail, MARKET_RAIL.TOKENIZED_SECURITY);
  assert.equal(t.referenceInstrument, 'SIM-EQUITY-ONE');
  assert.equal(t.evidence.requiredCount, 7);
  assert.equal(t.controls.walletConnected, false);
  assert.equal(t.controls.chainTransactionsBroadcast, 0);
  const compare = compareRailIdentities(stock(), token());
  assert.equal(compare.identifiersEqual, false);
  assert.equal(compare.representationTypesEqual, false);
  assert.equal(compare.independentlyProvenEquivalent, false);
  assert.equal(compare.crossRailNettingPermitted, false);
  assert.equal(compare.automaticConversionPermitted, false);
  assert.equal(compare.liveDispatchAllowed, false);
});

test('native blockchain tokens remain explicitly out of scope', () => {
  const input = {
    ...stock(), rail: MARKET_RAIL.NATIVE_BLOCKCHAIN_ASSET,
    instrumentId: 'SIM-CHAIN-ONE', declaredEvidence: {}
  };
  const report = reviewMarketRail(input);
  assert.equal(report.reviewState, 'NOT_IN_SCOPE');
  assert.equal(report.evidence.requiredCount, 0);
  assert.equal(report.controls.assetExecutionSupported, false);
});

test('reject credentials, orders, sizing and other unexpected fields', () => {
  for (const [field, value] of [
    ['brokerApiKey', 'fictional'], ['walletPrivateKey', 'fictional'],
    ['quantity', 2], ['side', 'BUY'], ['live', true], ['destination', 'node']
  ]) {
    assert.throws(() => reviewMarketRail({ ...stock(), [field]: value }),
      /Exact, metadata-only/);
  }
  const bad = stock();
  bad.declaredEvidence.brokerAccount = 'fictional';
  assert.throws(() => reviewMarketRail(bad), /Exact evidence keys/);
});

test('reject fake scope, unknown rail, mistaken token linkage and invalid ids', () => {
  assert.throws(() => reviewMarketRail({ ...stock(), scope: 'LIVE' }), /scope/);
  assert.throws(() => reviewMarketRail({ ...stock(), rail: 'SYNTHETIC_DERIVATIVE' }), /Unknown/);
  assert.throws(() => reviewMarketRail({ ...stock(), instrumentId: 'AAPL' }), /Fictional/);
  assert.throws(() => reviewMarketRail({ ...stock(), referenceInstrument: 'SIM-TOKEN-ONE' }),
    /Only tokenized/);
  assert.throws(() => reviewMarketRail({ ...token(), referenceInstrument: 'SIM-TOKEN-ONE' }),
    /Distinct/);
  assert.throws(() => reviewMarketRail({ ...token(), referenceInstrument: null }),
    /Distinct/);
});

test('reject invalid evidence claims, missing metadata, arrays and inherited prototypes', () => {
  const bad = stock();
  bad.declaredEvidence.dataRights = 'VERIFIED';
  assert.throws(() => reviewMarketRail(bad), /Invalid evidence declaration/);
  const { declaredEvidence, ...incomplete } = stock();
  assert.throws(() => reviewMarketRail(incomplete), /Exact, metadata-only/);
  assert.throws(() => reviewMarketRail([]), /Exact, metadata-only/);
  assert.throws(() => reviewMarketRail(Object.assign(Object.create(null), stock())),
    /Exact, metadata-only/);
  assert.throws(() => reviewMarketRail({ ...stock(), declaredEvidence: [] }), /Exact evidence keys/);
});
