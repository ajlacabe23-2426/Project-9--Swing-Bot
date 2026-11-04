import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {MARKET_DATA_SCHEMA} from '../src/market-intelligence.mjs';
import {auditMarketDatasetBatch} from '../src/market-readiness-audit.mjs';
import {auditLocalMarketFiles} from '../scripts/audit-watchlist-data.mjs';

function dataset(symbol='ALPHA'){
  const bars=[];
  const day=new Date('2026-01-01T00:00:00.000Z');
  while(bars.length<80){
    day.setUTCDate(day.getUTCDate()+1);
    if([0,6].includes(day.getUTCDay()))continue;
    const price=100+bars.length*0.1;
    bars.push({date:day.toISOString().slice(0,10),open:price,high:price+1,low:price-1,close:price+0.1,volume:100000});
  }
  return {
    schema:MARKET_DATA_SCHEMA,symbol,currency:'USD',source:'Synthetic test records',
    mode:'HISTORICAL',sourceAsOf:bars.at(-1).date,
    priceAdjustment:'RAW',bars
  };
}
const entry=data=>({filename:data.symbol+'.json',sha256:'a'.repeat(64),data});

test('audit reports reproducible file identity, review flags and paper-only limits',()=>{
  const data=dataset();
  const report=auditMarketDatasetBatch([entry(data)],{reviewDate:data.sourceAsOf});
  assert.equal(report.schema,'project9-offline-market-readiness-audit-v1');
  assert.equal(report.reviewRequiredCount,1);
  assert.equal(report.datasets[0].quality.status,'STRUCTURALLY_CLEAN_UNVERIFIED');
  assert.equal(report.datasets[0].researchReadiness,'REVIEW_REQUIRED');
  assert.ok(report.datasets[0].reviewReasons.includes('LEGACY_V1_PROVENANCE'));
  assert.equal(report.datasets[0].ageCalendarDays,0);
  assert.equal(report.executionAllowed,false);
  assert.equal(report.datasets[0].realOrdersAllowed,false);
});

test('staleness is review-only and date-safe, with no future observations allowed',()=>{
  const data=dataset(),future=new Date(data.sourceAsOf+'T00:00:00Z');
  future.setUTCDate(future.getUTCDate()+8);
  const reviewDate=future.toISOString().slice(0,10);
  const report=auditMarketDatasetBatch([entry(data)],{reviewDate});
  assert.equal(report.datasets[0].ageCalendarDays,8);
  assert.ok(report.datasets[0].reviewReasons.includes('LAST_COMPLETED_BAR_OVER_FIVE_CALENDAR_DAYS_OLD'));
  assert.throws(()=>auditMarketDatasetBatch([entry(data)],{reviewDate:'2025-12-31'}),/after review date/);
  assert.throws(()=>auditMarketDatasetBatch([entry(data)],{reviewDate:'2026-02-30'}),/valid/);
});

test('duplicate symbols and malformed file identities fail closed',()=>{
  const data=dataset();
  assert.throws(()=>auditMarketDatasetBatch([entry(data),entry(data)],{reviewDate:data.sourceAsOf}),/Duplicate instrument/);
  assert.throws(()=>auditMarketDatasetBatch([{...entry(data),sha256:'FAKE'}],{reviewDate:data.sourceAsOf}),/SHA-256/);
});

test('read-only CLI helper hashes the exact local file bytes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-data-audit-'));
  try{
    const data=dataset(),file=join(dir,'research.json'),contents=JSON.stringify(data);
    await writeFile(file,contents);
    const report=await auditLocalMarketFiles([file],data.sourceAsOf);
    assert.equal(report.datasetCount,1);
    assert.equal(report.datasets[0].filename,'research.json');
    assert.equal(report.datasets[0].fileSha256,createHash('sha256').update(contents).digest('hex'));
  }finally{await rm(dir,{recursive:true,force:true});}
});
