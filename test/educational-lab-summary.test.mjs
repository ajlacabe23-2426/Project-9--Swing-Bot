import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeFictionalLab} from '../src/educational-lab-summary.mjs';
const sample=()=>({schema:'educational-lab-v1',fictional:true,experimentId:'length-demo',instrument:'FICTIONAL_LENGTH_MM',plannedCount:4,observations:[{index:1,status:'OBSERVED',value:10},{index:2,status:'FAILED',value:null},{index:4,status:'OBSERVED',value:14}]});
test('fictional measurements distinguish failed and absent observations',()=>{
  const result=summarizeFictionalLab(sample());
  assert.equal(result.mean,12);
  assert.equal(result.min,10);
  assert.equal(result.max,14);
  assert.equal(result.observedCount,2);
  assert.deepEqual(result.failed,[2]);
  assert.deepEqual(result.missing,[3]);
  assert.equal(result.status,'INCOMPLETE_RECORD');
  assert.equal(result.scientificValidityEstablished,false);
});
test('empty observations do not fabricate statistics',()=>{
  const x=sample();x.observations=[];
  const r=summarizeFictionalLab(x);
  assert.equal(r.mean,null);assert.equal(r.min,null);assert.equal(r.max,null);
  assert.deepEqual(r.missing,[1,2,3,4]);
});
test('normalized evidence is deterministic and changes when data change',()=>{
  const x=sample(),a=summarizeFictionalLab(x);
  assert.deepEqual(a,summarizeFictionalLab(JSON.parse(JSON.stringify(x))));
  x.observations[0].value=11;
  assert.notEqual(a.fingerprint,summarizeFictionalLab(x).fingerprint);
});
test('invalid, duplicate, non-fictional and out-of-bounds records fail closed',()=>{
  for(const mutate of [
    x=>{x.fictional=false;},x=>{x.instrument='OTHER';},x=>{x.plannedCount=1001;},
    x=>{x.observations[1].index=1;},x=>{x.observations[1].value=0;},
    x=>{x.observations[0].value=NaN;},x=>{x.observations[0].value=-1;},
    x=>{x.observations[2].index=5;},x=>{x.extra=true;}
  ]){const x=sample();mutate(x);assert.throws(()=>summarizeFictionalLab(x),/Invalid fictional lab/);}
});
test('complete record is a coverage statement rather than scientific validation',()=>{
  const x=sample();x.plannedCount=1;x.observations=[{index:1,status:'OBSERVED',value:0}];
  const r=summarizeFictionalLab(x);assert.equal(r.mean,0);assert.equal(r.status,'COMPLETE_RECORD');assert.equal(r.scientificValidityEstablished,false);
});
