import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {saveClockEvidence} from '../src/fictional-clock-replay.mjs';
import {inspectClockEvidence} from '../src/fictional-clock-evidence-audit.mjs';

test('audit verifies deterministic fictional reports and preserves interrupted artifacts',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'clock-audit-'));
  try{
    assert.equal((await inspectClockEvidence(dir)).reviewRequired,true);
    const good=await saveClockEvidence(dir,'complete');
    assert.equal((await inspectClockEvidence(dir)).reviewRequired,false);
    await writeFile(join(dir,'.pending-abandoned'),'incomplete');
    await writeFile(join(dir,'other.json'),'unexpected');
    const r=await inspectClockEvidence(dir);
    assert.equal(r.verified,1);assert.equal(r.reviewRequired,true);
    assert.deepEqual(r.records.map(x=>x.status).sort(),
      ['INTERRUPTED_OR_ACTIVE_WRITE','UNEXPECTED_ENTRY','VERIFIED_FIXTURE']);
    assert.equal(await readFile(join(dir,'.pending-abandoned'),'utf8'),'incomplete');
    assert.equal((await readdir(dir)).length,3);
    const bytes=await readFile(good.file);
    bytes[0]^=1;await writeFile(good.file,bytes);
    const corrupted=await inspectClockEvidence(dir);
    assert.equal(corrupted.verified,0);
    assert.ok(corrupted.records.some(x=>x.status==='INVALID_EVIDENCE'));
    assert.deepEqual(await readFile(good.file),bytes);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('audit rejects symlinked evidence and bounds directory enumeration',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'clock-audit-bound-'));
  try{
    const good=await saveClockEvidence(dir,'gap');
    await rm(good.file);await symlink('/not-a-classroom-record',good.file);
    assert.equal((await inspectClockEvidence(dir)).records[0].status,'INVALID_EVIDENCE');
    for(let i=0;i<128;i++)await writeFile(join(dir,'unknown-'+i),'');
    await assert.rejects(inspectClockEvidence(dir),/limit exceeded/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
