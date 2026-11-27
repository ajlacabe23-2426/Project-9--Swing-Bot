import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {saveFictionalExperiment} from '../src/educational-lab-registry.mjs';
import {reportFictionalExperiments} from '../src/educational-lab-report.mjs';
const withDir=fn=>{const dir=mkdtempSync(join(tmpdir(),'fictional-report-'));try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}};
const sample=(id,observations)=>({schema:'educational-lab-v1',fictional:true,experimentId:id,instrument:'FICTIONAL_LENGTH_MM',plannedCount:2,observations});
test('empty registry does not claim scientific validity',()=>withDir(dir=>{
 const r=reportFictionalExperiments(dir);
 assert.equal(r.recordCount,0);
 assert.equal(r.scientificValidityEstablished,false);
 assert.deepEqual(r.records,[]);
}));
test('report counts complete and incomplete records separately and is deterministic',()=>withDir(dir=>{
 saveFictionalExperiment(dir,sample('complete',[{index:1,status:'OBSERVED',value:10},{index:2,status:'OBSERVED',value:12}]));
 saveFictionalExperiment(dir,sample('incomplete',[{index:1,status:'FAILED',value:null}]));
 const r=reportFictionalExperiments(dir);
 assert.equal(r.recordCount,2);assert.equal(r.completeCount,1);assert.equal(r.incompleteCount,1);
 assert.equal(r.failedObservationCount,1);assert.equal(r.missingObservationCount,1);
 assert.equal(r.status,'INCOMPLETE_RECORDS_PRESENT');
 assert.deepEqual(r,reportFictionalExperiments(dir));
}));
test('report explicitly flags corrupt, pending and unknown entries',()=>withDir(dir=>{
 const saved=saveFictionalExperiment(dir,sample('damaged',[]));
 writeFileSync(join(dir,saved.fingerprint+'.json'),'{');
 mkdirSync(join(dir,'.pending-demo'));
 writeFileSync(join(dir,'unknown.txt'),'unrecognized');
 const r=reportFictionalExperiments(dir);
 assert.equal(r.status,'REVIEW_REQUIRED');assert.equal(r.recordCount,0);
 assert.deepEqual(r.unreadable,[saved.fingerprint]);
 assert.deepEqual(r.pending,['.pending-demo']);
 assert.deepEqual(r.unrecognized,['unknown.txt']);
 assert.equal(r.pointInTimeSnapshotGuaranteed,false);
}));
test('unavailable directories do not produce successful reports',()=>withDir(dir=>{
 assert.throws(()=>reportFictionalExperiments(join(dir,'absent')));
}));
