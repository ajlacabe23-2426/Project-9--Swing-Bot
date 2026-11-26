/**
 * Source-neutral quote/observation metadata audit for StarNet research.
 *
 * No provider connection, historical price transformation, price access,
 * signal, account or brokerage/order capability. "Recent" means only that
 * supplied timestamps are near one another; provenance is unauthenticated.
 */
const SCOPES=new Set([
  'IEX_SINGLE_VENUE',
  'SIP_CONSOLIDATED',
  'CBOE_INDICATIVE',
  'OTHER_SINGLE_VENUE',
  'UNDECLARED'
]);
const MODES=new Set(['HISTORICAL','DELAYED','REALTIME_CLAIMED']);
const canonical=x=>typeof x==='string'&&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)&&
  Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const safeText=x=>typeof x==='string'&&x.trim().length>=2&&
  x.trim().length<=100&&!/[\r\n<>]/.test(x);

export const DEFAULT_REVIEW_RECENCY_MS=60_000;

/**
 * Given entirely user-supplied metadata, distinguish chronological recency
 * from provider entitlement, market-wide coverage, session validity and
 * executable pricing. Never returns approval for any order or broker action.
 *
 * A received timestamp is controlled by whoever provided the record.
 * No JWT/auth/venue/sequence verification is performed here.
 */
export function auditSourceObservation(input,{reviewAt,recencyThresholdMs=DEFAULT_REVIEW_RECENCY_MS}={}){
  if(!input||typeof input!=='object'||Array.isArray(input))
    throw new TypeError('A source observation metadata object is required');
  const allowed=['symbol','provider','feedScope','dataMode','marketTimestamp','receivedAt'];
  if(Object.keys(input).some(key=>!allowed.includes(key))||
      allowed.some(key=>!Object.hasOwn(input,key)))
    throw new TypeError('Unexpected or missing source observation metadata fields');
  if(typeof input.symbol!=='string'||!/^[A-Z0-9.\-]{1,15}$/.test(input.symbol))
    throw new TypeError('Canonical uppercase instrument symbol required');
  if(!safeText(input.provider))throw new TypeError('Source provider identity required');
  if(!SCOPES.has(input.feedScope))throw new TypeError('Known source coverage label required');
  if(!MODES.has(input.dataMode))throw new TypeError('Known source data-mode label required');
  if(![input.marketTimestamp,input.receivedAt,reviewAt].every(canonical))
    throw new TypeError('Canonical UTC market, received and review timestamps required');
  if(!Number.isSafeInteger(recencyThresholdMs)||recencyThresholdMs<1000||
     recencyThresholdMs>300000)
    throw new TypeError('Bounded research-recency threshold required');

  const marketMs=Date.parse(input.marketTimestamp);
  const receivedMs=Date.parse(input.receivedAt);
  const reviewMs=Date.parse(reviewAt);
  if(marketMs>receivedMs||receivedMs>reviewMs)
    throw new TypeError('Future or contradictory observation timeline');

  const ageMs=reviewMs-marketMs;
  const receivedLagMs=receivedMs-marketMs;
  const reasons=[];
  if(input.dataMode==='DELAYED')reasons.push('DECLARED_DELAYED_FEED');
  if(input.dataMode==='HISTORICAL')reasons.push('HISTORICAL_NOT_A_LIVE_OBSERVATION');
  if(ageMs>recencyThresholdMs)reasons.push('OBSERVATION_OLDER_THAN_RESEARCH_RECENCY_THRESHOLD');
  if(input.feedScope==='UNDECLARED')reasons.push('COVERAGE_NOT_DECLARED');
  if(input.feedScope!=='SIP_CONSOLIDATED')
    reasons.push('NOT_A_DECLARED_CONSOLIDATED_US_EQUITY_FEED');

  return {
    schema:'project9-market-observation-provenance-audit-v1',
    symbol:input.symbol,
    source:input.provider.trim(),
    declaredMode:input.dataMode,
    declaredFeedScope:input.feedScope,
    marketTimestamp:input.marketTimestamp,
    receivedAt:input.receivedAt,
    reviewAt,
    elapsedSinceObservationMs:ageMs,
    observedTransportAndProviderLagMs:receivedLagMs,
    recencyThresholdMs,
    chronologicalTimestampChecksPassed:true,
    status:reasons.length?'RESEARCH_REVIEW_REQUIRED':'RECENT_BY_SELF_DECLARED_TIMESTAMPS_ONLY',
    reasons,
    // Absolutely no provider/server attestation, market-session proof,
    // cross-venue consolidation or executable prices are established here.
    marketDataRightsVerified:false,
    providerAuthenticityVerified:false,
    exchangeSessionVerified:false,
    timestampIndependentlyVerified:false,
    consolidatedNBBOIndependentlyVerified:false,
    executableBidAskVerified:false,
    alertsEligible:false,
    actualTradingSupported:false,
    brokerageConnected:false,
    ordersCreated:0,
    productionGate:'NO_GO',
    interpretation:'Timestamp proximity does not authenticate source, entitlement, completeness, market-wide coverage or executable price.'
  };
}
