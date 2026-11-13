import {createHash} from 'node:crypto';
import {buildDemoDataset} from '../scripts/seed-workstation-demo.mjs';
import {analyzeDailyBreakout,BREAKOUT_STRATEGY_ID} from './daily-breakout-research.mjs';

const DEMO_LABEL='Project 9 ENGINEERED SYNTHETIC DEMO - NOT REAL MARKET DATA';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const nextDate=date=>{
  const value=new Date(date+'T00:00:00.000Z');
  value.setUTCDate(value.getUTCDate()+1);
  return value.toISOString().slice(0,10);
};
const NO_EXECUTION=Object.freeze({
  sourceAuthenticated:false,realMarketNotificationAllowed:false,
  externalNotificationsSent:0,paperTicketsCreated:0,
  brokerConnected:false,realOrdersCreated:0
});

/** Pure read-only exercise of the frozen daily rule on invented historical fixtures. */
export function inspectSyntheticAlert(dataset,{scenarioId,reviewDate=dataset?.sourceAsOf}={}){
  if(!dataset||!['SIM09','SIM10'].includes(dataset.symbol)||dataset.source!==DEMO_LABEL)
    throw new Error('Alert preview accepts only built-in engineered synthetic fixtures');
  const inputSha256=sha256(JSON.stringify(dataset));
  const rule={
    id:BREAKOUT_STRATEGY_ID,
    description:'Completed close is above 50-session SMA AND prior 20-session highest high',
    priceBasis:'Historical synthetic completed-session close; never an executable quote'
  };
  const base={scenarioId,mode:'SYNTHETIC_DEMO_ONLY',symbol:dataset.symbol,
    rule,requestedReviewDate:reviewDate,sourceAsOf:dataset.sourceAsOf,
    sourceName:dataset.source,inputSha256,
    notificationEligibility:'DENIED_UNVERIFIED_SYNTHETIC',
    reasons:['ENGINEERED_SYNTHETIC_NOT_AUTHENTICATED','REAL_NOTIFICATIONS_DISABLED'],
    ...NO_EXECUTION};
  if(typeof reviewDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate)||
     reviewDate>dataset.sourceAsOf){
    return {...base,status:'BLOCKED_INVALID_REVIEW_DATE',ruleTriggered:null,
      reasons:[...base.reasons,'REVIEW_DATE_AFTER_SOURCE_AS_OF_OR_INVALID'],
      observed:null,checks:null,eventKey:null};
  }
  const research=analyzeDailyBreakout(dataset,{asOf:reviewDate});
  const setup=research.latestSetup;
  const ruleTriggered=setup.signal==='HISTORICAL_BREAKOUT';
  return {...base,
    status:ruleTriggered?'DEMO_RULE_TRIGGERED':'DEMO_NO_RULE_TRIGGER',
    ruleTriggered,signalDate:setup.signalDate,
    observed:{
      completedClose:setup.lastCompletedClose,
      sma50:setup.average50,
      previous20High:setup.prior20DayHigh
    },
    checks:{
      closeAboveSma50:setup.checks.above50DayAverage,
      closeAbovePrevious20High:setup.checks.brokePrior20DayHigh
    },
    eventKey:[BREAKOUT_STRATEGY_ID,dataset.symbol,setup.signalDate,inputSha256].join(':')
  };
}

export function buildSyntheticAlertPreview(){
  const rising=buildDemoDataset('SIM09');
  const falling=buildDemoDataset('SIM10');
  const scenarios=[
    inspectSyntheticAlert(rising,{scenarioId:'trigger-example'}),
    inspectSyntheticAlert(falling,{scenarioId:'no-trigger-example'}),
    inspectSyntheticAlert(rising,{scenarioId:'outdated-review-blocked',reviewDate:nextDate(rising.sourceAsOf)})
  ];
  return {
    schema:'project9-synthetic-alert-preview-v1',
    context:'HISTORICAL_ENGINEERED_EXAMPLE_NOT_CURRENT_MARKET',
    authenticMarketData:false,notificationDeliveryEnabled:false,
    noStateMutation:true,realOrdersCreated:0,paperTicketsCreated:0,
    counts:{
      triggeredExamples:scenarios.filter(s=>s.ruleTriggered===true).length,
      noTriggerExamples:scenarios.filter(s=>s.ruleTriggered===false).length,
      blockedExamples:scenarios.filter(s=>s.ruleTriggered===null).length,
      actualNotificationsSent:0,ordersPlaced:0
    },
    scenarios
  };
}
