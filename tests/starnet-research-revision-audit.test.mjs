import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {engineered} from '../scripts/starnet-three-level-evidence.mjs';
import {auditStarNetResearchRevision} from '../src/starnet-research-revision-audit.mjs';
import {runRevisionAuditCli} from '../scripts/starnet-revision-audit.mjs';

const original=()=>JSON.parse(engineered().bytes.toString('utf8'));
const bytes=v=>Buffer.from(JSON.stringify(v));
const report=(a,b,asOf=a.sourceAsOf)=>auditStarNetResearchRevision({
  baselineBytes:bytes(a),candidateBytes:bytes(b),asOf,
  sourceKind:'ENGINEERED_OFFLINE_FIXTURE'
});
const futureWeekday=last=>{
  let date=new Date(last+'T00:00:00.000Z');
  do{date.setUTCDate(date.getUTCDate()+1);}
  while([0,6].includes(date.getUTCDay()));
  return date.toISOString().slice(0,10);
};

test('same exact source bytes keep research descriptive, not independently validated',()=>{
  const a=original(),r=report(a,structuredClone(a));
  assert.equal(r.status,'IDENTICAL_BYTES_NOT_AUTHENTICATED');
  assert.equal(r.strictSameInputResearchReproduction,true);
  assert.equal(r.validSameFrozenHoldoutComparison,true);
  assert.equal(r.auditCounts.revisedDates,0);
  assert.equal(r.boundariesChanged,false);
  assert.equal(r.safety.productionGate,'NO_GO');
  assert.equal(r.independentPredictionEstablished,false);
  assert.equal(r.externalVendorAuthenticityVerified,false);
});

test('historical price edits are identified without silently improving a score',()=>{
  const a=original(),b=structuredClone(a),i=90;
  b.bars[i].close=Number((b.bars[i].close*1.015).toFixed(6));
  b.bars[i].high=Math.max(b.bars[i].high,b.bars[i].close);
  const prior=JSON.stringify(a),candidate=JSON.stringify(b);
  const r=report(a,b);
  assert.equal(r.status,'RESEARCH_COMPARISON_BLOCKED_BY_INPUT_REVISION');
  assert.equal(r.auditCounts.revisedDates,1);
  assert.ok(r.auditCounts.revisedFields>=1);
  assert.equal(r.validSameFrozenHoldoutComparison,false);
  assert.ok(r.sampledDifferences.some(d=>d.date===a.bars[i].date&&d.field==='close'));
  assert.equal(JSON.stringify(a),prior);
  assert.equal(JSON.stringify(b),candidate);
});

test('even volume-only historical edits invalidate same-input research comparability',()=>{
  const a=original(),b=structuredClone(a);
  b.bars[91].volume+=11;
  const r=report(a,b);
  assert.equal(r.auditCounts.revisedDates,1);
  assert.equal(r.auditCounts.revisedFields,1);
  assert.equal(r.validSameFrozenHoldoutComparison,false);
});

test('append-only input reveals moving chronological holdout definition',()=>{
  const a=original(),b=structuredClone(a);
  const next=futureWeekday(a.bars.at(-1).date);
  b.bars.push({...a.bars.at(-1),date:next});
  b.sourceAsOf=next;
  b.provenance.retrievedAt=next+'T00:00:00.000Z';
  const r=report(a,b,next);
  assert.equal(r.auditCounts.addedDates,1);
  assert.equal(r.auditCounts.removedDates,0);
  assert.equal(r.auditCounts.revisedDates,0);
  assert.equal(r.boundariesChanged,true);
  assert.equal(r.validSameFrozenHoldoutComparison,false);
  assert.equal(r.partitions.at(-1).partitionBoundariesChanged,true);
  assert.equal(r.safety.productionGate,'NO_GO');
});

test('missing original dates cannot be passed off as harmless input advancement',()=>{
  const a=original(),b=structuredClone(a);
  b.bars.splice(92,1);
  const r=report(a,b);
  assert.equal(r.auditCounts.removedDates,1);
  assert.equal(r.validSameFrozenHoldoutComparison,false);
});

test('metadata declarations never authenticate a source',()=>{
  const a=original(),b=structuredClone(a);
  b.source='ANOTHER SELF-DECLARED LOCAL PROVIDER';
  b.provenance.corporateActions='INDEPENDENTLY_REVIEWED';
  b.provenance.licensing='COMMERCIAL_REDISTRIBUTION_VERIFIED';
  const r=report(a,b);
  assert.equal(r.status,'METADATA_REVISED_REVIEW_REQUIRED');
  assert.equal(r.metadataChanged,true);
  assert.equal(r.externalVendorAuthenticityVerified,false);
  assert.equal(r.dataRightsVerified,false);
});

test('wrong instrument, future observation, malformed bytes and claimed live class fail closed',()=>{
  const a=original(),b=structuredClone(a);
  b.symbol='OTHER';
  assert.throws(()=>report(a,b),/different symbol/);
  b.symbol=a.symbol;
  assert.throws(()=>report(a,b,a.bars.at(-2).date),/after research cutoff/);
  const fixture=engineered();
  assert.throws(()=>auditStarNetResearchRevision({
    baselineBytes:fixture.bytes,candidateBytes:Buffer.from('not json'),
    asOf:fixture.asOf,sourceKind:'ENGINEERED_OFFLINE_FIXTURE'
  }),/invalid JSON/);
  assert.throws(()=>auditStarNetResearchRevision({
    baselineBytes:fixture.bytes,candidateBytes:fixture.bytes,
    asOf:fixture.asOf,sourceKind:'LIVE_BROKER'
  }),/refused/);
});

test('CLI writes nothing and fingerprints the actual exact local source bytes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'starnet-revision-'));
  try{
    const a=original(),b=structuredClone(a);
    b.bars[99].volume+=33;
    const baseline=bytes(a),candidate=bytes(b),first=join(dir,'before.json'),
      second=join(dir,'after.json');
    await writeFile(first,baseline);await writeFile(second,candidate);
    const result=await runRevisionAuditCli(['--as-of',a.sourceAsOf,first,second]);
    assert.equal(result.status,'RESEARCH_COMPARISON_BLOCKED_BY_INPUT_REVISION');
    assert.equal(result.baselineSha256,createHash('sha256').update(baseline).digest('hex'));
    assert.deepEqual(await readFile(first),baseline);
    assert.deepEqual(await readFile(second),candidate);
    await assert.rejects(runRevisionAuditCli(['--demo','--live']),/Usage/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
