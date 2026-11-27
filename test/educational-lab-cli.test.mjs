import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {saveFictionalExperiment} from '../src/educational-lab-registry.mjs';
import {renderFictionalLabDashboard} from '../src/educational-lab-dashboard.mjs';

const script=fileURLToPath(new URL('../scripts/render-educational-lab.mjs',import.meta.url));
const run=(...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:10000,maxBuffer:2*1024*1024});
function withRoot(fn){
  const root=mkdtempSync(join(tmpdir(),'fictional-cli-'));
  try{return fn(root);}finally{rmSync(root,{recursive:true,force:true});}
}
const example=()=>({schema:'educational-lab-v1',fictional:true,experimentId:'length-check',instrument:'FICTIONAL_LENGTH_MM',plannedCount:3,observations:[{index:1,status:'OBSERVED',value:12},{index:2,status:'FAILED',value:null}]});
test('standalone CLI renders saved fictional evidence in a fresh process without modifying records',()=>withRoot(root=>{
  const saved=saveFictionalExperiment(root,example());
  const file=join(root,saved.fingerprint+'.json');
  const before=readFileSync(file);
  const first=run(root),second=run(root);
  assert.equal(first.status,0,first.stderr);
  assert.equal(second.status,0,second.stderr);
  assert.equal(first.stderr,'');
  assert.equal(first.stdout,second.stdout);
  assert.equal(first.stdout,renderFictionalLabDashboard(root));
  assert.match(first.stdout,/length-check — INCOMPLETE_RECORD/);
  assert.deepEqual(readFileSync(file),before);
  assert.deepEqual(readdirSync(root),[saved.fingerprint+'.json']);
}));
test('standalone CLI shows review state for damaged evidence without repairing or concealing it',()=>withRoot(root=>{
  const saved=saveFictionalExperiment(root,example()),file=join(root,saved.fingerprint+'.json');
  writeFileSync(file,'{');
  const result=run(root);
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/REVIEW_REQUIRED/);
  assert.match(result.stdout,/Unreadable entries: 1/);
  assert.match(result.stdout,/No readable saved records/);
  assert.equal(readFileSync(file,'utf8'),'{');
}));
test('standalone CLI fails without output for unavailable input and incorrect arguments',()=>withRoot(root=>{
  for(const args of [[],[root,root],[join(root,'absent')]]){
    const result=run(...args);
    assert.equal(result.error,undefined);
    assert.equal(result.status,args.length===1?1:2);
    assert.equal(result.stdout,'');
    assert.ok(result.stderr.length>0);
  }
}));
