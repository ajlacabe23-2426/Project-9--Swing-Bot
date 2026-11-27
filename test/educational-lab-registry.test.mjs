import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {saveFictionalExperiment,loadFictionalExperiment} from '../src/educational-lab-registry.mjs';
const sample=()=>({schema:'educational-lab-v1',fictional:true,experimentId:'length-demo',instrument:'FICTIONAL_LENGTH_MM',plannedCount:4,observations:[{index:1,status:'OBSERVED',value:10},{index:2,status:'FAILED',value:null}]});
const withDir=fn=>{const dir=mkdtempSync(join(tmpdir(),'fictional-lab-'));try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}};
test('saved incomplete experiments can be loaded without losing failures or gaps',()=>withDir(dir=>{
  const x=sample(),saved=saveFictionalExperiment(dir,x);
  const loaded=loadFictionalExperiment(dir,saved.fingerprint);
  assert.deepEqual(loaded.record,x);
  assert.deepEqual(loaded.summary,saved);
  assert.deepEqual(loaded.summary.failed,[2]);
  assert.deepEqual(loaded.summary.missing,[3,4]);
  assert.deepEqual(readdirSync(dir),[saved.fingerprint+'.json']);
}));
test('duplicate saves are idempotent and edited experiments preserve older versions',()=>withDir(dir=>{
  const x=sample(),a=saveFictionalExperiment(dir,x);
  assert.deepEqual(saveFictionalExperiment(dir,x),a);
  x.observations[0].value=11;
  const b=saveFictionalExperiment(dir,x);
  assert.notEqual(a.fingerprint,b.fingerprint);
  assert.equal(loadFictionalExperiment(dir,a.fingerprint).record.observations[0].value,10);
  assert.equal(readdirSync(dir).length,2);
}));
test('tampered evidence is rejected and never silently replaced',()=>withDir(dir=>{
  const x=sample(),a=saveFictionalExperiment(dir,x),path=join(dir,a.fingerprint+'.json');
  const tampered=readFileSync(path,'utf8').replace('"value":10','"value":11');
  writeFileSync(path,tampered);
  assert.throws(()=>loadFictionalExperiment(dir,a.fingerprint),/integrity mismatch/);
  assert.throws(()=>saveFictionalExperiment(dir,x),/integrity mismatch/);
  assert.equal(readFileSync(path,'utf8'),tampered);
}));
test('invalid fingerprint paths and malformed records are rejected',()=>withDir(dir=>{
  assert.throws(()=>loadFictionalExperiment(dir,'../other'),/fingerprint/);
  const x=sample();x.fictional=false;
  assert.throws(()=>saveFictionalExperiment(dir,x),/Invalid fictional lab/);
  assert.deepEqual(readdirSync(dir),[]);
}));
test('symbolic-link evidence entries are not followed',()=>withDir(dir=>{
  const x=sample(),a=saveFictionalExperiment(dir,x),path=join(dir,a.fingerprint+'.json');
  const bytes=readFileSync(path);
  rmSync(path);const target=join(dir,'other.json');writeFileSync(target,bytes);
  symlinkSync(target,path);
  assert.throws(()=>loadFictionalExperiment(dir,a.fingerprint));
  assert.throws(()=>saveFictionalExperiment(dir,x));
  assert.deepEqual(readFileSync(target),bytes);
}));
