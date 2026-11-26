import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  referenceNYSEEquitySession,lastScheduledCoreClose,reviewNYSEHistoricalSessions
} from '../src/nyse-session-preflight.mjs';
import {runSessionReviewCli} from '../scripts/review-nyse-sessions.mjs';

const next=(date)=>{
  const x=new Date(date+'T00:00:00.000Z');
  x.setUTCDate(x.getUTCDate()+1);
  return x.toISOString().slice(0,10);
};
function fakeHistory(){
  let date='2026-05-01';
  const bars=[];
  while(date<='2026-11-25'){
    const s=referenceNYSEEquitySession(date);
    if(s.closeEastern!==null){
      bars.push({date,open:100,high:101,low:99,close:100,volume:500000});
    }
    date=next(date);
  }
  return {schema:'project9-market-data-v2',symbol:'SIM09',currency:'USD',
    source:'ENGINEERED CLASSROOM BARS NOT A MARKET FEED',mode:'HISTORICAL',
    sourceAsOf:'2026-11-25',priceAdjustment:'RAW',
    provenance:{retrievedAt:'2026-11-26T09:00:00.000Z',
      adjustmentMethod:'RAW_UNADJUSTED',corporateActions:'NOT_VERIFIED',
      survivorship:'NOT_ASSESSED',licensing:'NOT_VERIFIED'},bars};
}

test('published 2026–2028 sessions distinguish holidays and early closes',()=>{
  assert.equal(referenceNYSEEquitySession('2026-11-26').kind,'HOLIDAY_CLOSED');
  assert.equal(referenceNYSEEquitySession('2026-11-27').closeEastern,'13:00');
  assert.equal(referenceNYSEEquitySession('2026-12-24').closeEastern,'13:00');
  assert.equal(referenceNYSEEquitySession('2027-11-26').closeEastern,'13:00');
  assert.equal(referenceNYSEEquitySession('2028-07-03').closeEastern,'13:00');
  assert.equal(referenceNYSEEquitySession('2028-11-24').closeEastern,'13:00');
  assert.equal(referenceNYSEEquitySession('2028-01-01').kind,'WEEKEND_CLOSED');
  assert.equal(referenceNYSEEquitySession('2026-07-03').kind,'HOLIDAY_CLOSED');
  assert.equal(referenceNYSEEquitySession('2026-11-28').kind,'WEEKEND_CLOSED');
  assert.equal(referenceNYSEEquitySession('2025-11-27').kind,'OUTSIDE_REFERENCE_YEARS');
});

test('Thanksgiving Thursday expects Wednesday final core close, not nonexistent Thursday bar',()=>{
  const expected=lastScheduledCoreClose('2026-11-26T16:00:00.000Z');
  assert.equal(expected.session.date,'2026-11-25');
  assert.equal(expected.session.closeEastern,'16:00');
  const report=reviewNYSEHistoricalSessions(fakeHistory(),{
    asOfUtc:'2026-11-26T16:00:00.000Z'
  });
  assert.equal(report.lastScheduledCoreClose,'2026-11-25');
  assert.ok(!report.reviewReasons.includes('LATEST_SCHEDULED_CORE_SESSION_ABSENT_FROM_SOURCE'));
  assert.equal(report.closedSessionBars,0);
  assert.equal(report.status,'CALENDAR_PLAUSIBLE_NOT_VERIFIED');
  assert.equal(report.providerDataFinalityIndependentlyVerified,false);
  assert.equal(report.productionGate,'NO_GO');
});

test('Friday early close requires 13:00 Eastern, not normal 16:00',()=>{
  const before=lastScheduledCoreClose('2026-11-27T17:59:00.000Z');
  const after=lastScheduledCoreClose('2026-11-27T18:00:00.000Z');
  assert.equal(before.session.date,'2026-11-25');
  assert.equal(after.session.date,'2026-11-27');
  assert.equal(after.session.closeEastern,'13:00');
  const old=reviewNYSEHistoricalSessions(fakeHistory(),{asOfUtc:'2026-11-27T18:01:00.000Z'});
  assert.ok(old.reviewReasons.includes('LATEST_SCHEDULED_CORE_SESSION_ABSENT_FROM_SOURCE'));
});

test('bar for an unfinished shortened session is flagged, even when it appears structurally valid',()=>{
  const dataset=fakeHistory();
  dataset.bars.push({date:'2026-11-27',open:100,high:101,low:99,close:100,volume:300000});
  dataset.sourceAsOf='2026-11-27';
  dataset.provenance.retrievedAt='2026-11-27T16:00:00.000Z';
  const report=reviewNYSEHistoricalSessions(dataset,{asOfUtc:'2026-11-27T17:20:00.000Z'});
  assert.ok(report.reviewReasons.includes('LATEST_BAR_PRECEDES_SCHEDULED_CORE_CLOSE'));
  assert.equal(report.status,'REVIEW_REQUIRED');
  assert.equal(report.ordersCreated,0);
});

test('published holiday bar, earlier missing session and unsupported years never become verified',()=>{
  const dataset=fakeHistory();
  dataset.bars.push({date:'2026-11-26',open:100,high:101,low:99,close:100,volume:20});
  dataset.sourceAsOf='2026-11-26';
  const report=reviewNYSEHistoricalSessions(dataset,{asOfUtc:'2026-11-26T20:00:00.000Z'});
  assert.equal(report.closedSessionBars,1);
  assert.ok(report.reviewReasons.includes('BARS_ON_PUBLISHED_CLOSED_SESSIONS'));
  assert.equal(report.closedSessionSamples[0].date,'2026-11-26');
  assert.equal(report.status,'REVIEW_REQUIRED');
  const unsupported=reviewNYSEHistoricalSessions(fakeHistory(),{
    asOfUtc:'2029-11-26T20:00:00.000Z'
  });
  assert.ok(unsupported.reviewReasons.includes('CALENDAR_REVIEW_YEAR_UNSUPPORTED'));
});

test('bad date, future retrieval and future source bar are rejected or flagged',()=>{
  const d=fakeHistory();
  assert.throws(()=>referenceNYSEEquitySession('2026-02-30'),/Strict/);
  assert.throws(()=>reviewNYSEHistoricalSessions(d,{asOfUtc:'2026-11-26'}),/canonical/);
  d.provenance.retrievedAt='2026-11-26T19:00:00.000Z';
  const r=reviewNYSEHistoricalSessions(d,{asOfUtc:'2026-11-26T16:00:00.000Z'});
  assert.ok(r.reviewReasons.includes('SOURCE_RETRIEVED_AFTER_REVIEW_INSTANT'));
  assert.equal(r.pointInTimeAvailabilityVerified,false);
});

test('bounded CLI reads local exact files and refuses unsafe flags',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'starnet-session-'));
  try{
    const p=join(dir,'history.json'),snapshot=Buffer.from(JSON.stringify(fakeHistory()));
    await writeFile(p,snapshot);
    const output=await runSessionReviewCli(['--as-of-utc','2026-11-26T16:00:00.000Z',p]);
    assert.equal(output.lastScheduledCoreClose,'2026-11-25');
    assert.equal(output.productionGate,'NO_GO');
    assert.deepEqual(await readFile(p),snapshot);
    await assert.rejects(runSessionReviewCli(['--live']),/Usage/);
    await assert.rejects(runSessionReviewCli(['--as-of-utc','2026-11-26T16:00:00.000Z',p,'--broker']),/Usage/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
