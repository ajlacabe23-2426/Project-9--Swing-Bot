import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {makeClockFixture,replayClockFixture,saveClockEvidence} from '../src/fictional-clock-replay.mjs';

test('continuous fictional replay crosses leap day and midnight without losing observations',()=>{
  const fixture=makeClockFixture(),r=replayClockFixture(fixture);
  assert.equal(r.received,72);assert.equal(r.missing,0);
  assert.equal(r.quality,'COMPLETE');
  assert.ok(r.observations.some(x=>x.at==='2024-02-29T00:00:00.000Z'));
  assert.deepEqual(r,replayClockFixture(makeClockFixture()));
  assert.equal(r.marketDataUsed,false);assert.equal(r.transactionsEnabled,false);
});

test('missing, duplicate and reversed fictional observations remain explicit',()=>{
  const gap=replayClockFixture(makeClockFixture('gap'));
  assert.equal(gap.missing,2);assert.equal(gap.received,70);
  const duplicate=replayClockFixture(makeClockFixture('duplicate'));
  assert.equal(duplicate.duplicates,1);assert.equal(duplicate.received,73);
  const reversed=replayClockFixture(makeClockFixture('reversed'));
  assert.equal(reversed.reversed,1);assert.equal(reversed.missing,0);assert.equal(reversed.provisionalGaps,1);
  for(const r of [gap,duplicate,reversed])assert.equal(r.quality,'REVIEW_REQUIRED');
});

test('arbitrary observations and altered fixtures are rejected',()=>{
  assert.throws(()=>makeClockFixture('unknown'),/Unknown/);
  const altered=makeClockFixture();altered.rows[0].reading++;
  assert.throws(()=>replayClockFixture(altered),/exact built-in/);
  assert.throws(()=>replayClockFixture({scenario:'complete',rows:[]}),/exact built-in/);
});

test('concurrent evidence saves are deterministic, idempotent and survive reopening',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fictional-clock-'));
  try{
    const results=await Promise.all(Array.from({length:8},()=>saveClockEvidence(dir,'gap')));
    assert.ok(results.every(x=>x.id===results[0].id));
    assert.deepEqual(await readdir(dir),[results[0].id+'.json']);
    assert.deepEqual(JSON.parse(await readFile(results[0].file,'utf8')),results[0].report);
    const reopened=await saveClockEvidence(dir,'gap');
    assert.equal(reopened.id,results[0].id);
    const other=await saveClockEvidence(dir,'complete');
    assert.notEqual(other.id,reopened.id);
    assert.equal((await readdir(dir)).length,2);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('corrupted immutable evidence is never overwritten',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fictional-clock-'));
  try{
    const r=await saveClockEvidence(dir,'complete');
    await writeFile(r.file,'corrupt');
    await assert.rejects(saveClockEvidence(dir,'complete'),/refusing replacement/);
    assert.equal(await readFile(r.file,'utf8'),'corrupt');
    assert.deepEqual(await readdir(dir),[r.id+'.json']);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('a symlinked evidence root is rejected',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fictional-clock-'));
  try{
    const alias=join(dir,'alias');await symlink(dir,alias,'dir');
    await assert.rejects(saveClockEvidence(alias,'complete'),/Expected local evidence directory/);
    assert.deepEqual(await readdir(dir),['alias']);
  }finally{await rm(dir,{recursive:true,force:true});}
});
