import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,mkdirSync,readdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {summarizeFictionalLab} from '../src/educational-lab-summary.mjs';
import {saveFictionalExperiment,loadFictionalExperiment} from '../src/educational-lab-registry.mjs';
import {reportFictionalExperiments} from '../src/educational-lab-report.mjs';

function fixture(t){
  const root=mkdtempSync(join(realpathSync(tmpdir()),'fictional-endurance-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  return root;
}
function rng(seed){
  let state=seed>>>0;
  return n=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%n;};
}
function example(id,random){
  const plannedCount=1+random(32),observations=[];
  for(let index=1;index<=plannedCount;index++){
    const kind=random(7);
    if(kind===0)continue;
    observations.push(kind===1?{index,status:'FAILED',value:null}:{index,status:'OBSERVED',value:random(1000001)});
  }
  return {schema:'educational-lab-v1',fictional:true,experimentId:id,instrument:'FICTIONAL_LENGTH_MM',plannedCount,observations};
}
function checkSummary(input,summary){
  const observed=input.observations.filter(x=>x.status==='OBSERVED').map(x=>x.value);
  const failed=input.observations.filter(x=>x.status==='FAILED').map(x=>x.index);
  const missing=[];
  for(let i=1;i<=input.plannedCount;i++)if(!input.observations.some(x=>x.index===i))missing.push(i);
  const n=observed.length,total=observed.reduce((a,b)=>a+b,0);
  const squares=observed.reduce((a,b)=>a+b*b,0);
  const variance=n>1?(squares-total*total/n)/(n-1):null;
  assert.equal(summary.observedCount,n);
  assert.equal(summary.mean,n?total/n:null);
  assert.deepEqual(summary.failed,failed);
  assert.deepEqual(summary.missing,missing);
  assert.equal(summary.status,failed.length||missing.length?'INCOMPLETE_RECORD':'COMPLETE_RECORD');
  if(variance===null)assert.equal(summary.sampleVariance,null);
  else assert.ok(Math.abs(summary.sampleVariance-variance)<=Math.max(1,Math.abs(variance))*1e-10);
  assert.equal(summary.scientificValidityEstablished,false);
}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

test('300 seeded fictional experiments match independent arithmetic and survive duplicate retries',t=>{
  const root=fixture(t),random=rng(20261127),expected=new Map();
  for(let i=0;i<300;i++){
    const input=example('endurance-'+i,random);
    const summary=saveFictionalExperiment(root,input);
    checkSummary(input,summary);
    assert.deepEqual(saveFictionalExperiment(root,input),summary);
    assert.deepEqual(loadFictionalExperiment(root,summary.fingerprint).record,input);
    expected.set(summary.fingerprint,input);
  }
  assert.equal(readdirSync(root).length,expected.size);
  const report=reportFictionalExperiments(root);
  assert.equal(report.recordCount,300);
  assert.deepEqual(report.records.map(x=>x.fingerprint).sort(),[...expected.keys()].sort());
  for(const record of report.records)checkSummary(expected.get(record.fingerprint),record);
});

test('300 seeded invalid fictional measurements are rejected without changing existing evidence',t=>{
  const root=fixture(t),random=rng(81513),baseline=example('baseline',random);
  const saved=saveFictionalExperiment(root,baseline),path=join(root,saved.fingerprint+'.json');
  const before=readFileSync(path);
  const mutations=[
    x=>{x.plannedCount=1001;},
    x=>{x.fictional=false;},
    x=>{x.observations=[{index:1,status:'OBSERVED',value:NaN}];},
    x=>{x.observations=[{index:1,status:'FAILED',value:7}];},
    x=>{x.observations=[{index:0,status:'OBSERVED',value:0}];},
    x=>{x.observations=[{index:1,status:'OBSERVED',value:1},{index:1,status:'OBSERVED',value:2}];}
  ];
  for(let i=0;i<300;i++){
    const input=example('invalid-'+i,random);
    mutations[i%mutations.length](input);
    assert.throws(()=>saveFictionalExperiment(root,input),/Invalid fictional lab/);
  }
  assert.deepEqual(readdirSync(root),[saved.fingerprint+'.json']);
  assert.deepEqual(readFileSync(path),before);
});

test('compound deletion, corruption and pending evidence are detected against a separate backup manifest',t=>{
  const root=fixture(t),primary=join(root,'primary'),backup=join(root,'backup'),restored=join(root,'restored');
  mkdirSync(primary);mkdirSync(backup);mkdirSync(restored);
  const random=rng(1024),manifest=new Map();
  for(let i=0;i<24;i++){
    const input=example('recovery-'+i,random),saved=saveFictionalExperiment(primary,input);
    const name=saved.fingerprint+'.json',bytes=readFileSync(join(primary,name));
    manifest.set(name,digest(bytes));
    copyFileSync(join(primary,name),join(backup,name));
  }
  const names=[...manifest.keys()];
  // Damage only the disposable primary fixture. The independent copy is unchanged.
  rmSync(join(primary,names[0]));
  writeFileSync(join(primary,names[1]),'{');
  mkdirSync(join(primary,'.pending-demo'));
  const damaged=reportFictionalExperiments(primary);
  assert.equal(damaged.status,'REVIEW_REQUIRED');
  assert.equal(damaged.recordCount,22);
  assert.deepEqual(damaged.unreadable,[names[1].slice(0,-5)]);
  assert.deepEqual(damaged.pending,['.pending-demo']);
  assert.equal(readdirSync(primary).includes(names[0]),false);
  for(const [name,sha] of manifest){
    const bytes=readFileSync(join(backup,name));
    assert.equal(digest(bytes),sha);
    copyFileSync(join(backup,name),join(restored,name));
  }
  const recovered=reportFictionalExperiments(restored);
  assert.equal(recovered.recordCount,24);
  assert.deepEqual(recovered.unreadable,[]);
  assert.deepEqual(recovered.pending,[]);
  for(const [name,sha] of manifest){
    assert.equal(digest(readFileSync(join(restored,name))),sha);
    assert.equal(digest(readFileSync(join(backup,name))),sha);
  }
  assert.equal(readFileSync(join(primary,names[1]),'utf8'),'{');
  assert.equal(readdirSync(primary).includes(names[0]),false);
});
