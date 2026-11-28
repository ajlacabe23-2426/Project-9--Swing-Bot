import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assessClassroomTestResult as assess} from '../src/classroom-test-result.mjs';
const output=(counts={})=>Object.entries({tests:3,pass:3,fail:0,cancelled:0,skipped:0,todo:0,...counts}).map(([key,value])=>'# '+key+' '+value).join('\n')+'\n';
const run=(stdout,extra={})=>({stdout,status:0,signal:null,...extra});
test('complete consistent TAP evidence passes, including CRLF output',()=>{
  const report=assess(run(output().replace(/\n/g,'\r\n')));
  assert.equal(report.result,'PASS');
  assert.equal(report.counts.tests,3);
  assert.equal(report.counts.pass,3);
});
test('exit zero cannot promote missing or nonexecuted evidence',()=>{
  for(const text of ['',output().replace('# skipped 0\n',''),output({tests:0,pass:0}),output({pass:0,skipped:3}),output({pass:2,todo:1}),output({pass:2,skipped:1})])
    assert.equal(assess(run(text)).result,'INCOMPLETE',text);
});
test('inconsistent, repeated, failed, cancelled and unsafe integer counts fail',()=>{
  for(const text of [output({pass:4}),output()+'# pass 3\n',output({pass:2,fail:1}),output({pass:2,cancelled:1}),output({tests:'9007199254740992'})])
    assert.equal(assess(run(text)).result,'FAIL',text);
  for(const extra of [{status:1},{status:null,signal:'SIGTERM'},{error:new Error('timeout')}])
    assert.equal(assess(run(output(),extra)).result,'FAIL');
});
test('real Node reporter output distinguishes passed and skipped fixture tests',async()=>{
  const root=await mkdtemp(join(tmpdir(),'classroom-tap-'));
  try{
    const path=join(root,'fixture.test.mjs');
    const execute=()=>spawnSync(process.execPath,['--test-reporter=tap','--test',path],{
      cwd:root,encoding:'utf8',timeout:10000,maxBuffer:1024*1024
    });
    await writeFile(path,"import test from 'node:test';\ntest('runs',()=>{});\n");
    const passing=assess(execute());
    assert.equal(passing.result,'PASS');
    assert.equal(passing.counts.tests,1);
    await writeFile(path,"import test from 'node:test';\ntest('skipped',{skip:true},()=>{});\n");
    const skipped=assess(execute());
    assert.equal(skipped.result,'INCOMPLETE');
    assert.equal(skipped.counts.skipped,1);
  }finally{await rm(root,{recursive:true,force:true});}
});
