import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditSourceObservation,DEFAULT_REVIEW_RECENCY_MS
} from '../src/starnet-market-observation-gate.mjs';

const base=()=>{
  return {
    symbol:'SIM09',provider:'FICTIONAL ENGINEERED DATA',
    feedScope:'SIP_CONSOLIDATED',dataMode:'REALTIME_CLAIMED',
    marketTimestamp:'2026-11-25T14:30:00.000Z',
    receivedAt:'2026-11-25T14:30:01.000Z'
  };
};
const reviewAt='2026-11-25T14:30:03.000Z';

test('recent claimed consolidated timestamps are only unverified research metadata',()=>{
  const result=auditSourceObservation(base(),{reviewAt});
  assert.equal(result.status,'RECENT_BY_SELF_DECLARED_TIMESTAMPS_ONLY');
  assert.equal(result.elapsedSinceObservationMs,3000);
  assert.equal(result.observedTransportAndProviderLagMs,1000);
  assert.equal(result.providerAuthenticityVerified,false);
  assert.equal(result.consolidatedNBBOIndependentlyVerified,false);
  assert.equal(result.executableBidAskVerified,false);
  assert.equal(result.actualTradingSupported,false);
  assert.equal(result.productionGate,'NO_GO');
  assert.equal(result.ordersCreated,0);
});

test('recent IEX-only observation is not treated as consolidated US-wide quote',()=>{
  const result=auditSourceObservation({...base(),feedScope:'IEX_SINGLE_VENUE'},{reviewAt});
  assert.ok(result.reasons.includes('NOT_A_DECLARED_CONSOLIDATED_US_EQUITY_FEED'));
  assert.equal(result.status,'RESEARCH_REVIEW_REQUIRED');
  assert.equal(result.actualTradingSupported,false);
});

test('Cboe indicative and undeclared coverage do not gain SIP status',()=>{
  for(const feedScope of ['CBOE_INDICATIVE','UNDECLARED','OTHER_SINGLE_VENUE']){
    const result=auditSourceObservation({...base(),feedScope},{reviewAt});
    assert.equal(result.status,'RESEARCH_REVIEW_REQUIRED');
    assert.ok(result.reasons.includes('NOT_A_DECLARED_CONSOLIDATED_US_EQUITY_FEED'));
  }
});

test('delayed observation is explicitly flagged even if its timestamps look recent',()=>{
  const result=auditSourceObservation({...base(),dataMode:'DELAYED'},{reviewAt});
  assert.ok(result.reasons.includes('DECLARED_DELAYED_FEED'));
  assert.equal(result.status,'RESEARCH_REVIEW_REQUIRED');
  assert.equal(result.actualTradingSupported,false);
});

test('15-minute-old data is recognized as stale, not treated as live',()=>{
  const result=auditSourceObservation({
    ...base(),marketTimestamp:'2026-11-25T14:15:00.000Z',
    receivedAt:'2026-11-25T14:30:00.000Z'
  },{reviewAt});
  assert.ok(result.reasons.includes('OBSERVATION_OLDER_THAN_RESEARCH_RECENCY_THRESHOLD'));
  assert.ok(result.elapsedSinceObservationMs>DEFAULT_REVIEW_RECENCY_MS);
  assert.equal(result.productionGate,'NO_GO');
});

test('historical data cannot silently become a recent executable quote',()=>{
  const result=auditSourceObservation({...base(),dataMode:'HISTORICAL'},{reviewAt});
  assert.ok(result.reasons.includes('HISTORICAL_NOT_A_LIVE_OBSERVATION'));
  assert.equal(result.executableBidAskVerified,false);
});

test('future, reversed, malformed and unbounded observations are rejected',()=>{
  assert.throws(()=>auditSourceObservation({...base(),
    marketTimestamp:'2026-11-25T14:30:03.000Z',
    receivedAt:'2026-11-25T14:30:02.000Z'
  },{reviewAt}),/Future or contradictory/);
  assert.throws(()=>auditSourceObservation({...base(),
    receivedAt:'2026-11-25T14:30:05.000Z'
  },{reviewAt}),/Future or contradictory/);
  assert.throws(()=>auditSourceObservation(base(),{reviewAt:'2026-11-25'}),/canonical/);
  assert.throws(()=>auditSourceObservation({...base(),feedScope:'FULL_MARKET'}, {reviewAt}),/coverage/);
  assert.throws(()=>auditSourceObservation({...base(),provider:'a'}, {reviewAt}),/provider/);
  assert.throws(()=>auditSourceObservation({...base(),extraSecret:'DO_NOT_ACCEPT'}, {reviewAt}),/fields/);
  assert.throws(()=>auditSourceObservation(base(),{reviewAt,recencyThresholdMs:1}),/threshold/);
  assert.throws(()=>auditSourceObservation(base(),{reviewAt,recencyThresholdMs:600000}),/threshold/);
});
