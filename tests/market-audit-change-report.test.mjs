import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {compareMarketAuditReports} from '../src/market-audit-change-report.mjs';
import {compareMarketAuditFiles} from '../scripts/compare-market-audits.mjs';

const row=(symbol,hash='a',date='2026-11-16',reasons=['LEGACY_V1_PROVENANCE'])=>({
  symbol,fileSha256:hash.repeat(64),latestCompletedBar:date,sourceAsOf:date,
  ageCalendarDays:1,researchReadiness:reasons.length?'REVIEW_REQUIRED':'STRUCTURALLY_CLEAN_UNVERIFIED',
  reviewReasons:reasons,
  dataAuthenticityIndependentlyVerified:false,realOrdersAllowed:false,
});
const report=(datasets,overrides={})=>({
  schema:'project9-offline-market-readiness-audit-v1',reviewDate:'2026-11-17',
  researchOnly:true,brokerageConnected:false,executionAllowed:false,
  datasetCount:datasets.length,reviewRequiredCount:datasets.filter(x=>x.researchReadiness==='REVIEW_REQUIRED').length,
  datasets,...overrides,
});

test('comparison reports stable and changed file identity without market claims',()=>{
  const old=report([row('ALPHA'),row('BETA')]);
  const cur=report([row('ALPHA','b','2026-11-16',[]),row('GAMMA')]);
  const d=compareMarketAuditReports(old,cur);
  assert.deepEqual(d.added,['GAMMA']);
  assert.deepEqual(d.removed,['BETA']);
  assert.deepEqual(d.updated.map(x=>x.symbol),['ALPHA']);
  assert.equal(d.updated[0].inputBytesChanged,true);
  assert.deepEqual(d.updated[0].noLongerFlaggedReasons,['LEGACY_V1_PROVENANCE']);
  assert.equal(d.executionAllowed,false);
  assert.equal(d.vendorAuthenticityVerified,false);
  assert.equal(d.attentionRequired,true);
});

test('no-change reports remain unchanged and do not suggest action',()=>{
  const r=report([row('ALPHA')]);
  const d=compareMarketAuditReports(r,r);
  assert.deepEqual(d.unchanged,['ALPHA']);
  assert.equal(d.attentionRequired,false);
  assert.deepEqual(d.updated,[]);
});

test('fail closed on inconsistent counters, bar dates, hashes, and order',()=>{
  const good=report([row('ALPHA')]);
  assert.throws(()=>compareMarketAuditReports(good,{...good,reviewDate:'2026-11-15'}),/invalid|duplicated|precede|after/);
  assert.throws(()=>compareMarketAuditReports(good,report([row('ALPHA','BAD')])),/invalid/);
  assert.throws(()=>compareMarketAuditReports(good,report([row('ALPHA'),row('ALPHA')])),/duplicated/);
  assert.throws(()=>compareMarketAuditReports(good,report([row('ALPHA')],{datasetCount:10})),/valid/);
  assert.throws(()=>compareMarketAuditReports(good,report([row('ALPHA')],{executionAllowed:true})),/non-executable/);
  assert.throws(()=>compareMarketAuditReports(good,report([row('ALPHA')],{brokerageConnected:true})),/non-executable/);
});

test('read-only CLI helper compares two local report files',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-audit-diff-'));
  try{
    const first=join(dir,'before.json'),second=join(dir,'after.json'),r=report([row('ALPHA')]);
    await writeFile(first,JSON.stringify(r));
    await writeFile(second,JSON.stringify(r));
    const result=await compareMarketAuditFiles(first,second);
    assert.deepEqual(result.unchanged,['ALPHA']);
  }finally{await rm(dir,{recursive:true,force:true});}
});
