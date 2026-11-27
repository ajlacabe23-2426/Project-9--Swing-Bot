import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,readdirSync,symlinkSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {summarizeFictionalLab} from '../src/educational-lab-summary.mjs';
import {saveFictionalExperiment,loadFictionalExperiment} from '../src/educational-lab-registry.mjs';
import {reportFictionalExperiments} from '../src/educational-lab-report.mjs';
import {compareFictionalExperiments,reviewFictionalConclusion} from '../src/educational-lab-comparison.mjs';
const example=()=>({schema:'educational-lab-v2',fictional:true,experimentId:'invented-ruler',instrument:'FICTIONAL_LENGTH_MM',plannedCount:4,recordedAt:'2026-01-01T01:00:00.000Z',observations:[2,4,4,6].map((value,i)=>({index:i+1,status:'OBSERVED',value,observedAt:`2026-01-01T00:0${i}:00.000Z`}))});
const directory=t=>{const root=mkdtempSync(join(tmpdir(),'fictional-integrity-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;};
const moduleUrl=new URL('../src/educational-lab-registry.mjs',import.meta.url).href;

test('descriptive statistics match independent hand calculations and preserve zero/empty/singleton semantics',()=>{
  const x=example(),r=summarizeFictionalLab(x);
  assert.equal(r.mean,4);assert.equal(r.median,4);assert.equal(r.sampleVariance,8/3);assert.equal(r.sampleStandardDeviation,Math.sqrt(8/3));
  x.observations=x.observations.slice(0,1);x.observations[0].value=0;
  const one=summarizeFictionalLab(x);assert.equal(one.mean,0);assert.equal(one.median,0);assert.equal(one.sampleVariance,null);assert.equal(one.completionFraction,.25);
  x.observations=[];assert.equal(summarizeFictionalLab(x).median,null);
  x.observations=example().observations.map(o=>({...o,value:1000000}));assert.equal(summarizeFictionalLab(x).sampleVariance,0);
});
test('timestamps reject impossible, noncanonical, duplicate, reversed and post-record observations',()=>{
  for(const mutate of [x=>x.recordedAt='2026-02-30T00:00:00.000Z',x=>x.recordedAt='2026-01-01T00:00:00Z',x=>x.observations[1].observedAt=x.observations[0].observedAt,x=>x.observations[1].observedAt='2025-01-01T00:00:00.000Z',x=>x.observations[1].observedAt='2027-01-01T00:00:00.000Z',x=>delete x.observations[0].observedAt]){
    const x=example();mutate(x);assert.throws(()=>summarizeFictionalLab(x));
  }
});
test('invalid numbers, mixed schema fields and duplicate indexes are rejected',()=>{
  for(const value of [NaN,Infinity,-Infinity,1.5,-1,1000001,'4',null]){const x=example();x.observations[0].value=value;assert.throws(()=>summarizeFictionalLab(x));}
  const x=example();x.observations[1].index=1;assert.throws(()=>summarizeFictionalLab(x));
  x.schema='educational-lab-v1';assert.throws(()=>summarizeFictionalLab(x));
});
test('structured claims distinguish checked arithmetic from unsupported inference',()=>{
  const x=example();
  assert.equal(reviewFictionalConclusion(x,{kind:'OBSERVED_MEAN',value:4}).status,'SUPPORTED_DESCRIPTIVE_CALCULATION');
  assert.equal(reviewFictionalConclusion(x,{kind:'OBSERVED_MEAN',value:5}).status,'CONTRADICTED_OR_UNAVAILABLE');
  for(const kind of ['CAUSAL_EFFECT','POPULATION_MEAN','STATISTICAL_SIGNIFICANCE','INDEPENDENT_REPLICATION'])assert.equal(reviewFictionalConclusion(x,{kind,value:4}).status,'UNSUPPORTED_INFERENCE');
  x.observations=[];assert.equal(reviewFictionalConclusion(x,{kind:'OBSERVED_MEAN',value:null}).status,'CONTRADICTED_OR_UNAVAILABLE');
  assert.throws(()=>reviewFictionalConclusion(x,{kind:'UNKNOWN',value:1}));
});
test('selected versions expose changes without inventing chronology or replacing old evidence',t=>{
  const root=directory(t),a=example(),saved=saveFictionalExperiment(root,a),b=example();
  b.observations[0].value=8;b.observations[1]={...b.observations[1],status:'FAILED',value:null};b.observations.pop();
  const second=saveFictionalExperiment(root,b),comparison=compareFictionalExperiments(a,b);
  assert.deepEqual(comparison.changes.map(x=>x.kind),['MODIFIED','MODIFIED','REMOVED']);
  assert.equal(comparison.chronologicalOrderVerified,false);assert.equal(comparison.scientificImprovementEstablished,false);
  assert.deepEqual(loadFictionalExperiment(root,saved.fingerprint).record,a);
  assert.equal(loadFictionalExperiment(root,second.fingerprint).summary.missing[0],4);
  b.experimentId='different';assert.throws(()=>compareFictionalExperiments(a,b));
});
test('canonical evidence rejects duplicate JSON keys, invalid encoding, truncation and altered history',t=>{
  const root=directory(t),x=example(),r=saveFictionalExperiment(root,x),file=join(root,r.fingerprint+'.json'),original=readFileSync(file);
  for(const bytes of [Buffer.from(original.toString().replace('"fictional":true','"fictional":false,"fictional":true')),Buffer.from('{'),Buffer.concat([original,Buffer.from([255])]),Buffer.from(original.toString().replace('"value":2','"value":3'))]){
    writeFileSync(file,bytes);assert.throws(()=>loadFictionalExperiment(root,r.fingerprint));assert.throws(()=>saveFictionalExperiment(root,x));assert.deepEqual(readFileSync(file),bytes);
  }
  writeFileSync(file,original);assert.deepEqual(loadFictionalExperiment(root,r.fingerprint).record,x);
});
test('symlinked storage roots and parent components cannot escape local boundaries',t=>{
  const root=directory(t),target=join(root,'target'),alias=join(root,'alias');mkdirSync(target);symlinkSync(target,alias);
  for(const path of [alias,join(alias,'nested')]){
    assert.throws(()=>saveFictionalExperiment(path,example()),/Unsafe/);
    assert.throws(()=>reportFictionalExperiments(path),/Unsafe/);
  }
  assert.deepEqual(readdirSync(target),[]);
});
test('concurrent process saves produce one complete immutable record',async t=>{
  const root=directory(t),x=example();
  const code=`import {saveFictionalExperiment} from ${JSON.stringify(moduleUrl)};saveFictionalExperiment(process.argv[1],JSON.parse(process.argv[2]));`;
  const statuses=await Promise.all(Array.from({length:8},()=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--input-type=module','-e',code,root,JSON.stringify(x)],{stdio:'pipe'});
    child.on('error',reject);child.on('exit',(code,signal)=>resolve({code,signal}));
  })));
  assert.ok(statuses.every(s=>s.code===0),JSON.stringify(statuses));
  assert.equal(readdirSync(root).length,1);assert.deepEqual(loadFictionalExperiment(root,summarizeFictionalLab(x).fingerprint).record,x);
});
test('forced process death before and after publication preserves evidence and allows safe retry',t=>{
  for(const stage of ['before-link','after-link']){
    const root=join(directory(t),stage);mkdirSync(root);
    const code=`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const link=fs.linkSync;fs.linkSync=(...args)=>{if(process.argv[3]==='after-link')link(...args);process.kill(process.pid,'SIGKILL');};syncBuiltinESMExports();const {saveFictionalExperiment}=await import(${JSON.stringify(moduleUrl)});saveFictionalExperiment(process.argv[1],JSON.parse(process.argv[2]));`;
    const child=spawnSync(process.execPath,['--input-type=module','-e',code,root,JSON.stringify(example()),stage],{timeout:10000});
    assert.equal(child.signal,'SIGKILL');
    const report=reportFictionalExperiments(root);assert.equal(report.pending.length,1);assert.equal(report.status,'REVIEW_REQUIRED');assert.equal(report.recordCount,stage==='after-link'?1:0);
    const saved=saveFictionalExperiment(root,example());assert.deepEqual(loadFictionalExperiment(root,saved.fingerprint).record,example());
    assert.equal(reportFictionalExperiments(root).pending.length,1);
  }
});
test('fresh processes reproduce identical statistics and fingerprints',t=>{
  const root=directory(t),r=saveFictionalExperiment(root,example());
  const code=`import {loadFictionalExperiment} from ${JSON.stringify(moduleUrl)};console.log(JSON.stringify(loadFictionalExperiment(process.argv[1],process.argv[2]).summary));`;
  const run=()=>spawnSync(process.execPath,['--input-type=module','-e',code,root,r.fingerprint],{encoding:'utf8',timeout:10000});
  const a=run(),b=run();assert.equal(a.status,0);assert.equal(b.status,0);assert.equal(a.stdout,b.stdout);assert.deepEqual(JSON.parse(a.stdout),r);
});

test('normalized comparison ignores object key insertion order',()=>{
  const a=example(),b=example();b.observations=b.observations.map(o=>({value:o.value,status:o.status,index:o.index,observedAt:o.observedAt}));
  const r=compareFictionalExperiments(a,b);assert.equal(r.identical,true);assert.deepEqual(r.changes,[]);
});
test('bounded reporting fails explicitly instead of returning a partial oversized dashboard',t=>{
  const root=directory(t);
  for(let i=0;i<21;i++)saveFictionalExperiment(root,{schema:'educational-lab-v1',fictional:true,experimentId:'bounded-'+i,instrument:'FICTIONAL_LENGTH_MM',plannedCount:1000,observations:Array.from({length:1000},(_,j)=>({index:j+1,status:'OBSERVED',value:j}))});
  assert.throws(()=>reportFictionalExperiments(root),/observation limit/);
});
