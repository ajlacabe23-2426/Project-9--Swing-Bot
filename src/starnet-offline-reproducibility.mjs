/**
 * Reproducible, read-only StarNet research artifact identity.
 *
 * A bundle identifies exact input bytes, the locally hashed methodology
 * implementation, and recomputed descriptive observations. A replay must
 * bring the same original files and same code. There is intentionally no
 * licensed historical-data redistribution in the bundle itself.
 *
 * Local reproducibility != an independent market source or predictive proof.
 */
import {createHash} from 'node:crypto';
import {normalizeMarketDataset,isStrictISODate} from './market-intelligence.mjs';
import {auditChronologicalResearch,RESEARCH_STRESS_CASES} from './chronological-research-audit.mjs';
import {auditStarNetOfflineResearchQuality} from './starnet-offline-research-quality.mjs';
import {compareLocalHistoricalSources} from './starnet-historical-source-comparison.mjs';
import {auditStarNetOfflineCustody} from './starnet-offline-custody-evidence.mjs';

const fail=reason=>{throw new TypeError('Offline research reproducibility refused: '+reason);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const SHA=/^[a-f0-9]{64}$/;
const KINDS=['ENGINEERED_OFFLINE_FIXTURE','USER_SUPPLIED_UNVERIFIED_JSON'];
const MAX_BYTES=2_500_000;
const hashField=bytes=>{
  if(bytes===null)return null;
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>MAX_BYTES)
    fail('input must be explicit nonempty local bytes, max 2.5 MB');
  return hash(bytes);
};
const stable=(input)=>JSON.stringify(input);
const allowed=(k)=>KINDS.includes(k);
const samplePhase=phase=>({
  phase:phase.phase,startDate:phase.startDate,endDate:phase.endDate,
  completedBars:phase.completedBars,
  strategyClosedWindows:phase.strategy.closedHypotheticalObservations,
  periodicClosedWindows:phase.control.closedHypotheticalObservations,
  strategyCostStress:phase.strategy.costSensitivity.map(x=>({
    id:x.id,count:x.count,meanReturnPct:x.meanCashOutlayReturnPct,
    worstReturnPct:x.worstCashOutlayReturnPct,positiveRatePct:x.positiveOutcomeRatePct
  })),
  controlCostStress:phase.control.costSensitivity.map(x=>({
    id:x.id,count:x.count,meanReturnPct:x.meanCashOutlayReturnPct,
    worstReturnPct:x.worstCashOutlayReturnPct,positiveRatePct:x.positiveOutcomeRatePct
  }))
});

/** Generate an untrusted local manifest for reproducibility, not authenticity. */
export function buildStarNetResearchReproducibility({
  marketBytes,witnessMarketBytes=null,manifestBytes=null,asOf,sourceKind,
  methodologySha256
}={}){
  if(!allowed(sourceKind)||!isStrictISODate(asOf)||!SHA.test(methodologySha256))
    fail('valid offline source class, review cutoff and local code SHA-256 required');
  const primarySha=hashField(marketBytes);
  hashField(witnessMarketBytes);hashField(manifestBytes);
  let raw;
  try{raw=JSON.parse(marketBytes.toString('utf8'));}
  catch{fail('market input must be valid JSON');}
  const normalized=normalizeMarketDataset(raw);
  if(normalized.bars.at(-1).date>asOf||normalized.sourceAsOf>asOf)
    fail('after-cutoff observations or declared source metadata');
  const comparison=witnessMarketBytes===null?{
    status:'NOT_ASSESSED',sourceIndependenceAuthenticated:false,
    historicalAuthenticityIndependentlyVerified:false,productionGate:'NO_GO'
  }:compareLocalHistoricalSources({primaryBytes:marketBytes,witnessBytes:witnessMarketBytes,asOf});
  const custody=manifestBytes===null?{
    status:'NOT_PROVIDED',verification:{
      independentSourceAuthenticityVerified:false,
      pointInTimeAvailabilityIndependentlyVerified:false,
      corporateActionTruthVerified:false,termsOfUseIndependentlyReviewed:false,
      productionGate:'NO_GO'
    }
  }:auditStarNetOfflineCustody({marketBytes,manifestBytes,asOf,sourceKind});

  // Independent module-level recomputation from input; no caller PASS or
  // precomputed research results accepted.
  const chronological=auditChronologicalResearch(raw,{asOf:normalized.bars.at(-1).date});
  const quality=auditStarNetOfflineResearchQuality({
    dataset:raw,asOf,sourceKind,comparison,custody
  });
  if(chronological.safety?.productionGate!=='NO_GO'||
     quality.verification?.productionGate!=='NO_GO'||
     quality.verification.strategyEfficacyEstablished!==false)
    fail('research-only safety boundaries were not preserved');
  const derived={
    historicalBars:normalized.bars.length,
    firstDate:normalized.bars[0].date,
    lastDate:normalized.bars.at(-1).date,
    symbol:normalized.symbol,currency:normalized.currency,
    frozenStrategyId:chronological.strategy,
    warmupBars:chronological.warmupBarsBeforeFirstSignal,
    partitionMethod:'50/25/25_POST_WARMUP_NO_SHUFFLE',
    hypotheticalHoldingSessions:5,
    costScenarioIds:RESEARCH_STRESS_CASES.map(x=>x.id),
    chronologicalPhases:chronological.phases.map(samplePhase),
    crossSourceStatus:comparison.status,custodyStatus:custody.status,
    researchQualityStatus:quality.status,
    descriptiveReviewReasons:quality.reviewReasons,
    holdoutStatisticalPowerEstablished:false,
    priceAuthenticityEstablished:false,
    predictiveOutOfSampleEfficacyEstablished:false
  };
  const body={
    schema:'project9-offline-research-reproducibility-v1',
    scope:'UNTRUSTED_LOCAL_RESEARCH_ONLY',
    asOf,sourceKind,
    inputs:{
      historicalDataSha256:primarySha,
      historicalDataBytes:marketBytes.length,
      witnessSha256:hashField(witnessMarketBytes),
      witnessBytes:witnessMarketBytes?.length??null,
      custodyManifestSha256:hashField(manifestBytes),
      custodyManifestBytes:manifestBytes?.length??null,
      originalInputFilesMustBeRetained:true,
      originalInputsEmbedded:false,
      noClaimOfLicensedRedistribution:true
    },
    methodology:{
      localSourceCodeSha256:methodologySha256,
      codeHashOrigin:'LOCAL_FILE_BYTES_NOT_SIGNED',
      frozenStudy:'DESCRIPTIVE_RESEARCH_ONLY_NO_TUNING',
      externalCodeSignatureVerified:false
    },
    resultIdentity:{
      resultSha256:hash(Buffer.from(stable(derived),'utf8')),
      descriptive:derived
    },
    evidenceGaps:{
      independentHistoricalSourceAuthenticity:'NOT_VERIFIED',
      pointInTimeMarketDataAvailability:'NOT_VERIFIED',
      corporateActionsAndSurvivorship:'NOT_VERIFIED',
      independentStatisticalPowerOrPrediction:'NOT_VERIFIED',
      actualMarketLiquidityOrFills:'NOT_VERIFIED',
      legalRightsToRedistribute:'NOT_VERIFIED',
      MacHardwareAndStorageRecovery:'NOT_RUN',
      independentThirdPartyReproduction:'NOT_PERFORMED'
    },
    release:{
      softwareReproduction:'LOCAL_INPUT_AND_CODE_FINGERPRINT_ONLY',
      externalCalls:0,realOrdersCreated:0,
      blockchainTransactionsBroadcast:0,
      liveTradingEnabled:false,productionGate:'NO_GO'
    }
  };
  return Object.freeze({
    ...body,
    bundleSha256:hash(Buffer.from(stable(body),'utf8'))
  });
}

/**
 * Re-evaluate a recorded bundle against actual supplied local input bytes.
 * Refuses stale/missing source files, a different code checkout, and forged
 * or accidentally edited summaries even when an attacker recomputed a
 * non-secret local checksum. A fully forged alternative history could still
 * be internally self-consistent: there is no external trust anchor.
 */
export function verifyStarNetResearchReproducibility(record,inputs={}){
  if(!record||typeof record!=='object'||Array.isArray(record)||
     record.schema!=='project9-offline-research-reproducibility-v1'||
     record.scope!=='UNTRUSTED_LOCAL_RESEARCH_ONLY'||
     record.release?.productionGate!=='NO_GO'||
     record.release.realOrdersCreated!==0||
     record.methodology?.externalCodeSignatureVerified!==false||
     !SHA.test(record.bundleSha256))
    fail('invalid or unsafe recorded research bundle');
  const {bundleSha256,...payload}=record;
  if(hash(Buffer.from(stable(payload),'utf8'))!==bundleSha256)
    fail('record body changed since its local SHA-256 was computed');
  const regenerated=buildStarNetResearchReproducibility({
    ...inputs,asOf:record.asOf,sourceKind:record.sourceKind,
    methodologySha256:inputs.methodologySha256
  });
  if(stable(regenerated)!==stable(record))
    fail('record does not match re-computed dataset, methodology or research evidence');
  return Object.freeze({
    schema:'project9-offline-research-reproduction-verification-v1',
    finding:'EXACT_LOCAL_REPRODUCTION',
    bundleSha256,
    resultSha256:record.resultIdentity.resultSha256,
    originalInputFilesRechecked:true,
    methodologyBytesRechecked:true,
    codeAndInputConsistencyOnly:true,
    independentMarketAuthenticityVerified:false,
    independentStatisticalValidityVerified:false,
    productionGate:'NO_GO'
  });
}
