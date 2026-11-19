import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMissionInputSnapshot,assertMissionInputSnapshot,snapshotEntries} from '../src/mission-input-snapshot.mjs';

test('mission snapshot detects source mutation before later stages',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-snapshot-')); const file=join(dir,'SIM09.json');
  await writeFile(file,JSON.stringify({symbol:'SIM09',bars:[]}));
  const snapshot=await createMissionInputSnapshot([file]);
  await writeFile(file,JSON.stringify({symbol:'SIM09',bars:[{date:'2026-01-01'}]}));
  await assert.rejects(()=>assertMissionInputSnapshot(snapshot),/changed during run/);
});

test('snapshot entries retain the original content identity',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-snapshot-')); const file=join(dir,'SIM10.json');
  await writeFile(file,JSON.stringify({symbol:'SIM10',bars:[]}));
  const snapshot=await createMissionInputSnapshot([file]);
  const entries=snapshotEntries(snapshot);
  assert.equal(entries[0].filename,'SIM10.json');
  assert.equal(entries[0].data.symbol,'SIM10');
  assert.match(entries[0].sha256,/^[0-9a-f]{64}$/);
  assert(Object.isFrozen(entries));
  assert(Object.isFrozen(entries[0].data));
  assert(Object.isFrozen(entries[0].data.bars));
  assert.throws(()=>{entries[0].data.symbol='SIMXX';},TypeError);
});

test('snapshot validation runs on captured bytes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-snapshot-')); const file=join(dir,'SIM09.json');
  await writeFile(file,JSON.stringify({symbol:'OTHER',bars:[]}));
  await assert.rejects(()=>createMissionInputSnapshot([file],{validate(data){
    if(data.symbol!=='SIM09')throw new Error('symbol mismatch');
  }}),/symbol mismatch/);
});

test('snapshot hash mismatch fails closed',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-snapshot-')); const file=join(dir,'SIM09.json');
  await writeFile(file,JSON.stringify({symbol:'SIM09',bars:[]}));
  await assert.rejects(()=>assertMissionInputSnapshot([{
    path:file,filename:'SIM09.json',sha256:'0'.repeat(64)
  }]),/changed during run/);
});
