import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compareSyntheticFixtures} from '../src/synthetic-fixture-comparison.mjs';

const fixture=source=>Buffer.from(JSON.stringify({schema:'synthetic-candle-fixture-v1',fictional:true,source,rows:[{timestamp:0,open:10,high:12,low:9,close:11}]}));
const a=fixture('source-a'), b=fixture('source-b');
test('every truncated prefix is rejected, complete fixture still works',()=>{
  for(let length=0;length<b.length;length++){
    assert.throws(()=>compareSyntheticFixtures(a,b.subarray(0,length)));
  }
  assert.equal(compareSyntheticFixtures(a,b).status,'FIXTURES_AGREE');
});
test('simulated interrupted fixture write is rejected in a fresh process and recovery reproduces evidence',()=>{
  const dir=mkdtempSync(join(tmpdir(),'starnet-fictional-fixture-'));
  try{
    const left=join(dir,'a.json'),right=join(dir,'b.json');
    writeFileSync(left,a);
    writeFileSync(right,b.subarray(0,Math.floor(b.length/2)));
    const moduleUrl=new URL('../src/synthetic-fixture-comparison.mjs',import.meta.url).href;
    const script='import {readFileSync} from "node:fs"; import {compareSyntheticFixtures} from '+JSON.stringify(moduleUrl)+'; const result=compareSyntheticFixtures(readFileSync(process.argv[1]),readFileSync(process.argv[2])); console.log(JSON.stringify(result));';
    const run=()=>spawnSync(process.execPath,['--input-type=module','-e',script,left,right],{encoding:'utf8',timeout:10000});
    const failed=run();
    assert.equal(failed.error,undefined);
    assert.equal(failed.status,1);
    assert.equal(failed.stdout,'');
    assert.deepEqual(readFileSync(left),a);
    writeFileSync(right,b);
    const recovered=run();
    assert.equal(recovered.status,0,recovered.stderr);
    assert.deepEqual(JSON.parse(recovered.stdout),compareSyntheticFixtures(a,b));
    assert.equal(run().stdout,recovered.stdout);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('oversize and non-buffer evidence is rejected before comparison',()=>{
  assert.throws(()=>compareSyntheticFixtures(a,Buffer.alloc(512001)),/bounded fixture bytes/);
  assert.throws(()=>compareSyntheticFixtures(a,b.toString()),/bounded fixture bytes/);
});
