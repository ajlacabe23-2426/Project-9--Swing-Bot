/**
 * Phase 16 — bounded offline research-methodology watch report.
 *
 * Labels are retrospective, pre-signal context DESCRIPTORS built only from
 * ten completed closes preceding each fictional signal. They are not market
 * regimes, forecasts, strategy parameters or retrospective optimizations.
 *
 * No file I/O, provider connections, execution, accounts or orders.
 */
import {createHash} from 'node:crypto';
import {normalizeMarketDataset,isStrictISODate,summarizeMarketDataQuality} from './market-intelligence.mjs';
import {auditChronologicalResearch,RESEARCH_STRESS_CASES} from './chronological-research-audit.mjs';
import {modeledReturns} from './research-return-contract.mjs';

const refused=why=>{throw new TypeError('StarNet methodology watch refused: '+why);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const SOURCE_CLASSES=new Set(['ENGINEERED_OFFLINE_FIXTURE','USER_SUPPLIED_UNVERIFIED_JSON']);
const PERIODS=['DEVELOPMENT_REFERENCE','CHRONOLOGICAL_VALIDATION','CHRONOLOGICAL_HOLDOUT'];
const COST_ZERO=RESEARCH_STRESS_CASES[0];
const COST_STRESS=RESEARCH_STRESS_CASES.at(-1);
const referenceFloor=20; // descriptive warning cue only; NOT statistical power.
const boundedRound=value=>Number(value.toFixed(6));
const present=(value,expected)=>value===null&&expected===null||
  Number.isFinite(value)&&Number.isFinite(expected)&&Math.abs(value-expected)<=1e-9;

function priorContext(bars,signalIndex){
  // Every referenced index is strictly *before* the signal close.
  if(!Number.isInteger(signalIndex)||signalIndex<11||signalIndex>=bars.length)
    refused('signal cannot receive a strictly prior 10-return context');
  const first=bars[signalIndex-11].close,last=bars[signalIndex-1].close;
  let absoluteMoves=0;
  for(let j=signalIndex-10;j<signalIndex;j++)
    absoluteMoves+=Math.abs(bars[j].close/bars[j-1].close-1)*100;
  const trendPct=(last/first-1)*100;
  const averageAbsoluteDailyMovePct=absoluteMoves/10;
  return {
    trend:trendPct>2?'PRIOR_RISING':trendPct< -2?'PRIOR_FALLING':'PRIOR_MIXED',
    noise:averageAbsoluteDailyMovePct>1.5?'PRIOR_HIGH_NOISE':'PRIOR_LOW_NOISE',
    priorTenCloseChangePct:boundedRound(trendPct),
    priorTenMeanAbsoluteMovePct:boundedRound(averageAbsoluteDailyMovePct),
    latestInputBarIndex:signalIndex-1,
    excludesSignalBarAndAllLaterBars:true
  };
}
export function classifyStarNetPriorContext(bars,signalIndex){
  return Object.freeze(priorContext(bars,signalIndex));
}
function verifyCostRecomputation(windows,bars,stress,phaseName){
  const returns=windows.map(w=>modeledReturns(bars[w.entryIndex].open,
    bars[w.exitIndex].close,{
      feeBps:stress.feeBpsEachSide,
      slippageBps:stress.adverseSlippageBpsEachSide
    }).cashOutlayReturnPct);
  return returns.length?returns.reduce((sum,x)=>sum+x/returns.length,0):null;
}
function watchFlag(code,lesson){
  return Object.freeze({code,learningNote:lesson,status:'REVIEW_OR_LIMITATION'});
}
function summarizePhase(phase,bars){
  const strategy=phase.strategy;
  const contexts={PRIOR_RISING:0,PRIOR_FALLING:0,PRIOR_MIXED:0,
    PRIOR_HIGH_NOISE:0,PRIOR_LOW_NOISE:0};
  let priorTrendDates=[];
  let lastSignal=-1;
  for(const w of strategy.windows){
    if(!Number.isSafeInteger(w.signalIndex)||w.signalIndex<phase.startIndex||
      w.entryIndex!==w.signalIndex+1||w.exitIndex!==w.signalIndex+5||
      w.exitIndex>phase.endIndex||w.signalIndex<lastSignal||
      bars[w.signalIndex]?.date!==w.signalDate||
      bars[w.entryIndex]?.date!==w.entryDate||
      bars[w.exitIndex]?.date!==w.exitDate)
      refused('future-leaking or malformed research observation');
    lastSignal=w.exitIndex;
    const ctx=priorContext(bars,w.signalIndex);
    contexts[ctx.trend]++;contexts[ctx.noise]++;
    priorTrendDates.push({
      signalDate:w.signalDate,trend:ctx.trend,noise:ctx.noise,
      latestContextDate:bars[ctx.latestInputBarIndex].date
    });
  }
  const count=strategy.closedHypotheticalObservations;
  if(count!==strategy.windows.length||phase.control.closedHypotheticalObservations!==
    phase.control.windows.length||strategy.costSensitivity.length!==RESEARCH_STRESS_CASES.length||
    phase.control.costSensitivity.length!==RESEARCH_STRESS_CASES.length)
    refused('strategy/control sample counts or frozen cost grid changed');
  for(const [group,label] of [[phase.strategy,'strategy'],[phase.control,'control']]){
    group.costSensitivity.forEach((entry,index)=>{
      const configured=RESEARCH_STRESS_CASES[index];
      if(entry.id!==configured.id||
         entry.feeBpsEachSide!==configured.feeBpsEachSide||
         entry.adverseSlippageBpsEachSide!==configured.adverseSlippageBpsEachSide||
         entry.count!==group.closedHypotheticalObservations||
         !present(entry.meanCashOutlayReturnPct,
           verifyCostRecomputation(group.windows,bars,configured,phase.phase+' '+label)))
        refused(phase.phase+' '+label+' computed cost outcomes are inconsistent');
    });
  }
  const zero=strategy.costSensitivity[0].meanCashOutlayReturnPct;
  const stressed=strategy.costSensitivity.at(-1).meanCashOutlayReturnPct;
  if(count&&!(stressed<zero))refused('higher hypothetical costs did not worsen outcome');
  return Object.freeze({
    phase:phase.phase,completedBars:phase.completedBars,
    firstDate:phase.startDate,lastDate:phase.endDate,
    strategyWindows:count,periodicControlWindows:phase.control.closedHypotheticalObservations,
    descriptiveFloor:referenceFloor,descriptiveFloorMet:count>=referenceFloor,
    priorSignalContextCounts:Object.freeze(contexts),
    contextRows:Object.freeze(priorTrendDates),
    hypotheticalCostSensitivity:Object.freeze({
      zeroCostMeanPct:zero,highestCostMeanPct:stressed,
      worseningPercentagePoints:count?boundedRound(zero-stressed):null,
      signChangedAfterHypotheticalCosts:count>0&&zero>0&&stressed<=0,
      modeledCostsAreNotExecutableBidAskQuotes:true
    }),
    statisticalIndependenceVerified:false,
    contextGroupEffectEstablished:false,
    scannerVersusControlIsNotMatchedExperiment:true
  });
}
export function buildStarNetMethodologyWatch({
  marketBytes,asOf,sourceKind
}={}){
  if(!SOURCE_CLASSES.has(sourceKind)||!isStrictISODate(asOf)||
    !Buffer.isBuffer(marketBytes)||marketBytes.length<1||marketBytes.length>2_500_000)
    refused('valid read-only historical input bytes, cutoff and source type required');
  let raw;
  try{raw=JSON.parse(marketBytes.toString('utf8'));}
  catch{refused('historical input bytes are not valid JSON');}
  const data=normalizeMarketDataset(raw);
  if(data.bars.at(-1).date>asOf||data.sourceAsOf>asOf)
    refused('data contains bars or source metadata after the review cutoff');
  const audit=auditChronologicalResearch(raw,{asOf:data.bars.at(-1).date});
  if(audit.study!=='DESCRIPTIVE_RESEARCH_ONLY_NO_TUNING'||
    audit.safety?.productionGate!=='NO_GO'||
    audit.safety.independentOutOfSampleEfficacyEstablished!==false||
    audit.safety.modelsFitted!==false||
    audit.safety.benchmarkMatchedToStrategySignals!==false||
    audit.phases?.length!==3||
    audit.phases.some((p,i)=>p.phase!==PERIODS[i]))
    refused('underlying research was not the frozen descriptive exercise');
  const phases=audit.phases.map(p=>summarizePhase(p,data.bars));
  const holdout=phases[2],total=phases.reduce((a,p)=>a+p.strategyWindows,0);
  const quality=summarizeMarketDataQuality(data);
  const flags=[];
  if(holdout.strategyWindows<referenceFloor)
    flags.push(watchFlag('THIN_HOLDOUT_SAMPLE',
      'A small number of hypothetical outcomes cannot establish predictive reliability; the 20-window marker is not a statistical-power calculation.'));
  if(total<referenceFloor)
    flags.push(watchFlag('FEW_TOTAL_STRATEGY_OBSERVATIONS',
      'Small samples exaggerate the apparent importance of one unusual hypothetical outcome.'));
  flags.push(watchFlag('SOURCE_AUTHENTICITY_NOT_VERIFIED',
    'Local file labels, hashes and declared provenance do not prove authentic exchange history or historical availability.'));
  flags.push(watchFlag('CONTEXT_GROUPS_ARE_DESCRIPTIVE_ONLY',
    'Context uses only the ten closes BEFORE each signal, but tiny retrospective groups do not establish how a strategy behaves across genuine market regimes.'));
  flags.push(watchFlag('COSTS_AND_LIQUIDITY_ARE_HYPOTHETICAL',
    'Adverse slippage and fees are fixed scenarios; actual bid-ask depth, liquidity and achievable fills were not observed.'));
  flags.push(watchFlag('CONTROL_NOT_SIGNAL_MATCHED',
    'The periodic reference uses different exposures; do not interpret a mean comparison as an apples-to-apples strategy advantage.'));
  flags.push(watchFlag('DEPENDENCE_AND_MULTIPLE_TESTING_UNASSESSED',
    'Adjacent market observations may be correlated and repeated experimentation can create hindsight-selected results.'));
  if(quality.zeroVolumeBars)
    flags.push(watchFlag('ZERO_VOLUME_SOURCE_REVIEW',
      'A zero-volume bar may reflect a data issue or unusual session; inspect original source evidence before interpreting it.'));
  if(quality.largeCalendarGaps)
    flags.push(watchFlag('CALENDAR_GAP_SOURCE_REVIEW',
      'Unexpected calendar gaps may affect observation windows; no verified exchange calendar was supplied.'));
  if(quality.closeMovesOver20Pct)
    flags.push(watchFlag('LARGE_CLOSE_CHANGE_ACTION_REVIEW',
      'Large price changes can reflect legitimate events or adjustments; issuer action evidence is not independently verified.'));
  if(phases.some(p=>p.hypotheticalCostSensitivity.signChangedAfterHypotheticalCosts))
    flags.push(watchFlag('COST_STRESS_SIGN_CHANGE',
      'Even the sign of a hypothetical average changed under preset assumptions; this cannot establish actual market performance.'));
  return Object.freeze({
    schema:'project9-offline-methodology-learning-v1',
    status:'DESCRIPTIVE_EDUCATION_ONLY',
    inputByteSha256:sha(marketBytes),asOf,sourceKind,
    instrument:data.symbol,
    sampleReferenceFloor:referenceFloor,
    signalContextRule:'10_PRE_SIGNAL_COMPLETED_CLOSE_RETURNS_ONLY',
    preSignalTrendThresholdPct:2,
    preSignalNoiseThresholdPct:1.5,
    thresholdChoicesAreEducationalNotValidated:true,
    study:Object.freeze({
      postWarmupCompletedBars:audit.postWarmupCompletedBars,
      fixedHoldingSessions:audit.fixedHoldingCompletedSessions,
      strategyId:audit.strategy,
      strategyWindowsTotal:total,
      holdoutWindows:holdout.strategyWindows,
      marketConditionRobustnessEstablished:false,
      statisticalSignificanceEstablished:false,
      independentPredictionEstablished:false
    }),
    phases:Object.freeze(phases),
    dataQuality:Object.freeze({
      zeroVolumeBars:quality.zeroVolumeBars,
      largeCalendarGaps:quality.largeCalendarGaps,
      closeMovesOver20Pct:quality.closeMovesOver20Pct,
      authenticHistoricalDataVerified:false,
      corporateActionsIndependentlyVerified:false
    }),
    learningFlags:Object.freeze(flags),
    safety:Object.freeze({
      everyContextUsesPriorBarsOnly:true,
      noSignalRefittingOrOptimization:true,
      returnModelIsOneFictionalNotionalUnit:true,
      notPortfolioReturn:true,
      noBrokerOrWalletConnections:true,
      externalCalls:0,realOrdersCreated:0,blockchainBroadcasts:0,
      productionGate:'NO_GO'
    })
  });
}
export function renderStarNetMethodologyLearningMarkdown(report){
  if(report?.schema!=='project9-offline-methodology-learning-v1'||
    report.status!=='DESCRIPTIVE_EDUCATION_ONLY'||
    report.safety?.productionGate!=='NO_GO'||
    report.safety.realOrdersCreated!==0||report.study?.independentPredictionEstablished!==false)
    refused('unsafe or unrelated learning report');
  return [
    '# StarNet Phase 16 — What to Watch For',
    '',
    '**Offline educational research only. Production NO_GO.**',
    '',
    'The fixed strategy has '+report.study.strategyWindowsTotal+
      ' hypothetical observations, including '+report.study.holdoutWindows+
      ' in the descriptive holdout. The 20-window reference floor is a review cue, NOT a significance test.',
    '',
    '| Period | Strategy windows | Periodic control | 50 bps stress worsens mean (percentage points) |',
    '|---|---:|---:|---:|',
    ...report.phases.map(p=>'| '+p.phase+' | '+p.strategyWindows+' | '+
      p.periodicControlWindows+' | '+
      (p.hypotheticalCostSensitivity.worseningPercentagePoints===null?'N/A':p.hypotheticalCostSensitivity.worseningPercentagePoints)+' |'),
    '',
    '## Learning checklist — investigate before drawing conclusions',
    '',
    ...report.learningFlags.map(x=>'- **'+x.code+'**: '+x.learningNote),
    '',
    '## How to interpret the context counts',
    '',
    'The prior-trend labels use only completed closes BEFORE each signal. They are educational descriptions, not certified market regimes or predictions. Fewer observations in any group means weaker grounds for generalization.',
    '',
    '| Period | Prior rising | Prior falling | Prior mixed | Prior high noise |',
    '|---|---:|---:|---:|---:|',
    ...report.phases.map(p=>{
      const c=p.priorSignalContextCounts;
      return '| '+p.phase+' | '+c.PRIOR_RISING+' | '+c.PRIOR_FALLING+
        ' | '+c.PRIOR_MIXED+' | '+c.PRIOR_HIGH_NOISE+' |';
    }),
    '',
    '## What this cannot prove',
    '',
    'No independent market-source provenance, point-in-time data access, statistical predictive validity, matched portfolio benchmark, executable fills, legal data rights or authenticated external review is established.',
    '',
    '**Do not use this demonstration to authorize trades or financial transfers.**'
  ].join('\n')+'\n';
}
