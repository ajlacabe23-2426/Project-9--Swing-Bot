import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {saveFictionalExperiment} from '../src/educational-lab-registry.mjs';
import {renderFictionalLabDashboard} from '../src/educational-lab-dashboard.mjs';
function withDir(fn){
 const root=mkdtempSync(join(tmpdir(),'fictional-dashboard-'));
 try{return fn(root);}finally{rmSync(root,{recursive:true,force:true});}
}
test('empty fictional dashboard exposes its limitations and has no external content',()=>withDir(root=>{
 const html=renderFictionalLabDashboard(root);
 assert.match(html,/No readable saved records/);
 assert.match(html,/Fictional, non-financial length measurements/);
 assert.match(html,/does not establish scientific validity/);
 assert.match(html,/default-src 'none'/);
 assert.doesNotMatch(html,/<script|<iframe|https?:\/\//i);
}));
test('saved fictional record includes native expandable details and explicit missing data',()=>withDir(root=>{
 const r=saveFictionalExperiment(root,{schema:'educational-lab-v1',fictional:true,experimentId:'length-demo',instrument:'FICTIONAL_LENGTH_MM',plannedCount:3,observations:[{index:1,status:'OBSERVED',value:0},{index:2,status:'FAILED',value:null}]});
 const html=renderFictionalLabDashboard(root);
 assert.match(html,/<details><summary>length-demo — INCOMPLETE_RECORD/);
 assert.match(html,/<dt>Mean length \(mm\)<\/dt><dd>0<\/dd>/);
 assert.match(html,/<dt>Failed indexes<\/dt><dd>2<\/dd>/);
 assert.match(html,/<dt>Missing indexes<\/dt><dd>3<\/dd>/);
 assert.ok(html.includes(r.fingerprint));
 assert.equal(html,renderFictionalLabDashboard(root));
}));
test('unrecognized file names cannot inject markup into the dashboard',()=>withDir(root=>{
 writeFileSync(join(root,'<img onerror=bad>.txt'),'unrecognized');
 const html=renderFictionalLabDashboard(root);
 assert.match(html,/REVIEW_REQUIRED/);
 assert.match(html,/Unrecognized entries: 1/);
 assert.doesNotMatch(html,/<img|onerror=bad/);
}));
test('comparison renders exact version differences, completeness and statistical explanations',()=>withDir(root=>{
 const a={schema:'educational-lab-v1',fictional:true,experimentId:'versions',instrument:'FICTIONAL_LENGTH_MM',plannedCount:2,observations:[{index:1,status:'OBSERVED',value:0}]};
 const first=saveFictionalExperiment(root,a);a.observations.push({index:2,status:'FAILED',value:null});const second=saveFictionalExperiment(root,a);
 const html=renderFictionalLabDashboard(root,[first.fingerprint,second.fingerprint]);
 assert.match(html,/1 observation differences/);assert.match(html,/<caption>Saved observations/);assert.match(html,/<meter /);assert.match(html,/Sample standard deviation/);assert.match(html,/Neither chronology nor scientific improvement is verified/);
 assert.throws(()=>renderFictionalLabDashboard(root,[first.fingerprint]),/exactly two/);
 assert.doesNotMatch(html,/<script|<iframe|https?:\/\//i);
}));
