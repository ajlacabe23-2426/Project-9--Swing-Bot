import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,readdirSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {saveFictionalExperiment,loadFictionalExperiment} from '../src/educational-lab-registry.mjs';
import {summarizeFictionalLab} from '../src/educational-lab-summary.mjs';
import {reportFictionalExperiments} from '../src/educational-lab-report.mjs';

const moduleUrl=new URL('../src/educational-lab-registry.mjs',import.meta.url).href;
const example=(id='fault-demo')=>({schema:'educational-lab-v1',fictional:true,experimentId:id,instrument:'FICTIONAL_LENGTH_MM',plannedCount:2,observations:[{index:1,status:'OBSERVED',value:12}]});
function fixture(t){
  const root=mkdtempSync(join(realpathSync(tmpdir()),'fictional-fault-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  return root;
}

// Inject failures only inside a disposable subprocess, never on an actual full disk.
for(const stage of ['write','file-sync','publish','directory-sync']){
  test('injected '+stage+' failure preserves unrelated evidence and permits verified retry',t=>{
    const root=fixture(t),input=example(),id=summarizeFictionalLab(input).fingerprint;
    const previous=saveFictionalExperiment(root,example('unrelated'));
    const previousPath=join(root,previous.fingerprint+'.json'),before=readFileSync(previousPath);
    const code=`import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
const stage=process.argv[3];
const fault=()=>{const e=new Error('Injected fictional storage error');e.code='EIO';throw e;};
const write=fs.writeFileSync,link=fs.linkSync,sync=fs.fsyncSync;
fs.writeFileSync=(...args)=>{if(stage==='write')fault();return write(...args);};
fs.linkSync=(...args)=>{if(stage==='publish')fault();return link(...args);};
fs.fsyncSync=fd=>{const isDir=fs.fstatSync(fd).isDirectory();if((stage==='file-sync'&&!isDir)||(stage==='directory-sync'&&isDir))fault();return sync(fd);};
syncBuiltinESMExports();
const {saveFictionalExperiment}=await import(${JSON.stringify(moduleUrl)});
try{saveFictionalExperiment(process.argv[1],JSON.parse(process.argv[2]));process.exitCode=2;}
catch(e){process.exitCode=e.code==='EIO'?0:3;}`;
    const child=spawnSync(process.execPath,['--input-type=module','-e',code,root,JSON.stringify(input),stage],{encoding:'utf8',timeout:10000});
    assert.equal(child.status,0,child.stderr);
    assert.deepEqual(readFileSync(previousPath),before);
    const after=reportFictionalExperiments(root);
    assert.equal(after.recordCount,stage==='directory-sync'?2:1);
    assert.deepEqual(after.pending,[]);
    if(stage==='directory-sync')assert.deepEqual(loadFictionalExperiment(root,id).record,input);
    else assert.throws(()=>loadFictionalExperiment(root,id),{code:'ENOENT'});
    const retry=saveFictionalExperiment(root,input);
    assert.equal(retry.fingerprint,id);
    assert.deepEqual(loadFictionalExperiment(root,id).record,input);
    assert.deepEqual(readFileSync(previousPath),before);
    assert.equal(readdirSync(root).length,2);
  });
}

test('nonregular and oversized evidence is reported without modifying unrelated records',t=>{
  const root=fixture(t),kept=saveFictionalExperiment(root,example('kept'));
  const path=join(root,kept.fingerprint+'.json'),before=readFileSync(path);
  mkdirSync(join(root,'a'.repeat(64)+'.json'));
  writeFileSync(join(root,'b'.repeat(64)+'.json'),Buffer.alloc(160001));
  const report=reportFictionalExperiments(root);
  assert.equal(report.status,'REVIEW_REQUIRED');
  assert.equal(report.recordCount,1);
  assert.deepEqual(report.unreadable,['a'.repeat(64),'b'.repeat(64)]);
  assert.deepEqual(readFileSync(path),before);
});
