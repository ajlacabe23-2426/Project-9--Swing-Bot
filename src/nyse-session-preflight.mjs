/**
 * Bounded official 2026–2028 NYSE equity core-session reference.
 * This is a preliminary calendar cross-check, NOT verification of data
 * finality, exchange emergency closures, venue eligibility, or publication.
 * Source: https://www.nyse.com/trade/hours-calendars (2026–2028 table).
 * No network, provider, brokerage, signals, portfolio or file writes.
 */
import {normalizeMarketDataset,isStrictISODate} from './market-intelligence.mjs';

const HOLIDAYS=new Map(Object.entries({
  2026:['01-01','01-19','02-16','04-03','05-25','06-19','07-03','09-07','11-26','12-25'],
  2027:['01-01','01-18','02-15','03-26','05-31','06-18','07-05','09-06','11-25','12-24'],
  2028:['01-17','02-21','04-14','05-29','06-19','07-04','09-04','11-23','12-25']
}).map(([year,dates])=>[year,new Set(dates.map(x=>year+'-'+x))]));
const EARLY=new Set([
  '2026-11-27','2026-12-24',
  '2027-11-26',
  '2028-07-03','2028-11-24'
]);
const eastern=new Intl.DateTimeFormat('en-US',{
  timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});
const fmtTime=instant=>{
  const p=Object.fromEntries(eastern.formatToParts(new Date(instant))
    .filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {date:p.year+'-'+p.month+'-'+p.day,clock:Number(p.hour)*60+Number(p.minute)};
};
const knownDate=d=>isStrictISODate(d)&&HOLIDAYS.has(d.slice(0,4));
const earlier=d=>{
  const v=new Date(d+'T00:00:00.000Z');v.setUTCDate(v.getUTCDate()-1);
  return v.toISOString().slice(0,10);
};
const isInstant=x=>typeof x==='string'&&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)&&
  Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;

/** Core equities only. Known holidays/early closes, not an exhaustive venue feed. */
export function referenceNYSEEquitySession(date){
  if(!isStrictISODate(date))throw new TypeError('Strict YYYY-MM-DD session date required');
  if(!knownDate(date))return {date,kind:'OUTSIDE_REFERENCE_YEARS',closeEastern:null,officialVerified:false};
  const dow=new Date(date+'T00:00:00.000Z').getUTCDay();
  if(dow===0||dow===6)return {date,kind:'WEEKEND_CLOSED',closeEastern:null,officialVerified:true};
  if(HOLIDAYS.get(date.slice(0,4)).has(date))
    return {date,kind:'HOLIDAY_CLOSED',closeEastern:null,officialVerified:true};
  const early=EARLY.has(date);
  return {date,kind:early?'PUBLISHED_EARLY_CLOSE':'TENTATIVE_CORE_SESSION',
    closeEastern:early?'13:00':'16:00',officialVerified:early};
}

/**
 * Finds the last scheduled core close no later than the explicit timestamp.
 * Ordinary weekdays are provisional because unscheduled outages/halts exist.
 */
export function lastScheduledCoreClose(asOfUtc){
  if(!isInstant(asOfUtc))throw new TypeError('Explicit canonical UTC timestamp required');
  const et=fmtTime(asOfUtc);
  if(!knownDate(et.date))return {status:'OUTSIDE_REFERENCE_YEARS',asOfEasternDate:et.date,session:null};
  let d=et.date;
  for(let i=0;i<16;i++,d=earlier(d)){
    const s=referenceNYSEEquitySession(d);
    if(s.kind==='OUTSIDE_REFERENCE_YEARS')break;
    if(s.closeEastern===null)continue;
    const close=Number(s.closeEastern.slice(0,2))*60+Number(s.closeEastern.slice(3));
    if(d===et.date&&et.clock<close)continue;
    return {status:'CALENDAR_CANDIDATE_ONLY',asOfEasternDate:et.date,
      session:s,providerFinalityVerified:false,adHocClosuresIndependentlyVerified:false};
  }
  return {status:'REVIEW_REQUIRED_NO_SCHEDULED_CLOSE_FOUND',asOfEasternDate:et.date,session:null};
}

/**
 * No signal/return calculations. Only screen the EXISTING canonical local
 * market JSON against known market sessions and the time of review.
 */
export function reviewNYSEHistoricalSessions(input,{asOfUtc}={}){
  if(!isInstant(asOfUtc))throw new TypeError('Explicit canonical UTC timestamp required');
  const data=normalizeMarketDataset(input);
  const clock=fmtTime(asOfUtc);
  const expected=lastScheduledCoreClose(asOfUtc);
  const reviewReasons=[];
  const samples=[];
  let closedSessionBars=0,uncoveredYearBars=0;
  for(const bar of data.bars){
    const s=referenceNYSEEquitySession(bar.date);
    if(s.kind==='OUTSIDE_REFERENCE_YEARS'){uncoveredYearBars++;continue;}
    if(s.closeEastern===null){
      closedSessionBars++;
      if(samples.length<12)samples.push({date:bar.date,kind:s.kind});
    }
  }
  if(closedSessionBars)reviewReasons.push('BARS_ON_PUBLISHED_CLOSED_SESSIONS');
  if(uncoveredYearBars)reviewReasons.push('PARTIAL_CALENDAR_YEAR_COVERAGE');
  const last=data.bars.at(-1).date;
  if(last>clock.date)reviewReasons.push('SOURCE_BAR_AFTER_EASTERN_REVIEW_DATE');
  const today=referenceNYSEEquitySession(clock.date);
  if(last===clock.date&&today.closeEastern!==null){
    const closing=Number(today.closeEastern.slice(0,2))*60+
      Number(today.closeEastern.slice(3));
    if(clock.clock<closing)reviewReasons.push('LATEST_BAR_PRECEDES_SCHEDULED_CORE_CLOSE');
  }
  if(expected.session&&last<expected.session.date)
    reviewReasons.push('LATEST_SCHEDULED_CORE_SESSION_ABSENT_FROM_SOURCE');
  if(expected.status==='OUTSIDE_REFERENCE_YEARS')
    reviewReasons.push('CALENDAR_REVIEW_YEAR_UNSUPPORTED');
  if(data.provenance.retrievedAt&&
     data.provenance.retrievedAt>asOfUtc)
    reviewReasons.push('SOURCE_RETRIEVED_AFTER_REVIEW_INSTANT');
  return {
    schema:'project9-nyse-session-preflight-v1',
    study:'READ_ONLY_HISTORICAL_SOURCE_SCREEN',
    asOfUtc,easternReviewDate:clock.date,
    historicalLastBar:last,historicalBarCount:data.bars.length,
    calendarReferenceYears:[2026,2027,2028],
    referenceUrl:'https://www.nyse.com/trade/hours-calendars',
    lastScheduledCoreClose:expected.session?.date??null,
    lastScheduledCoreCloseEastern:expected.session?.closeEastern??null,
    lastScheduledCoreCloseStatus:expected.status,
    closedSessionBars,uncoveredYearBars,closedSessionSamples:samples,
    reviewReasons,
    status:reviewReasons.length?'REVIEW_REQUIRED':'CALENDAR_PLAUSIBLE_NOT_VERIFIED',
    sourceRightsIndependentlyVerified:false,
    providerDataFinalityIndependentlyVerified:false,
    corporateActionsVerified:false,pointInTimeAvailabilityVerified:false,
    scheduledCoreCloseDoesNotEstablishPublishedBarFinality:true,
    historicalPricesAuthenticated:false,ordersCreated:0,
    productionGate:'NO_GO'
  };
}
