import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {saveFictionalExperiment} from '../src/educational-lab-registry.mjs';
import {auditFictionalBackup} from '../src/educational-lab-backup-audit.mjs';

function fixture(t){
  const root=mkdtempSync(join(realpathSync(tmpdir()),'fictional-backup-audit-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  return root;
}
const save=(root,id)=>saveFictionalExperiment(root,{schema:'educational-lab-v1',fictional:true,experimentId:id,instrument:'FICTIONAL_LENGTH_MM',plannedCount:2,observations:[{index:1,status:'OBSERVED',value:4}]}).fingerprint;
const inventory=fingerprints=>({schema:'educational-lab-inventory-v1',fictional:true,fingerprints});

test('matching inventory verifies record presence without claiming authenticity',t=>{
  const root=fixture(t),a=save(root,'a'),b=save(root,'b');
  const result=auditFictionalBackup(root,inventory([b,a]));
  assert.equal(result.status,'INVENTORY_MATCH');
  assert.deepEqual(result.matched,[a,b].sort());
  assert.deepEqual(result.missing,[]);
  assert.equal(result.manifestAuthenticityVerified,false);
  assert.equal(result.restorationPerformed,false);
});

test('compound inventory mismatches are classified without changing evidence',t=>{
  const root=fixture(t),a=save(root,'a'),b=save(root,'b'),c=save(root,'c'),d=save(root,'d');
  rmSync(join(root,a+'.json'));
  writeFileSync(join(root,b+'.json'),'{');
  mkdirSync(join(root,'.pending-demo'));
  writeFileSync(join(root,'unexpected.txt'),'fictional');
  const snapshot=readdirSync(root).sort();
  const bytes=readFileSync(join(root,c+'.json'));
  const result=auditFictionalBackup(root,inventory([a,b,c]));
  assert.equal(result.status,'REVIEW_REQUIRED');
  assert.deepEqual(result.missing,[a]);
  assert.deepEqual(result.corrupt,[b]);
  assert.deepEqual(result.matched,[c]);
  assert.deepEqual(result.unexpected,[d]);
  assert.deepEqual(result.pending,['.pending-demo']);
  assert.deepEqual(result.unrecognized,['unexpected.txt']);
  assert.deepEqual(readdirSync(root).sort(),snapshot);
  assert.deepEqual(readFileSync(join(root,c+'.json')),bytes);
  assert.equal(readFileSync(join(root,b+'.json'),'utf8'),'{');
});

test('malformed inventories fail closed',t=>{
  const root=fixture(t),a=save(root,'a');
  for(const input of [null,{},inventory([a,a]),inventory(['../outside']),inventory(Array(2001).fill(a)),{...inventory([a]),fictional:false}]){
    assert.throws(()=>auditFictionalBackup(root,input),/Invalid fictional backup manifest/);
  }
  assert.deepEqual(readdirSync(root),[a+'.json']);
});

test('unexpected unreadable record is not mistaken for a match',t=>{
  const root=fixture(t),a=save(root,'a');
  const b='f'.repeat(64);
  writeFileSync(join(root,b+'.json'),'{');
  const result=auditFictionalBackup(root,inventory([a]));
  assert.equal(result.status,'REVIEW_REQUIRED');
  assert.deepEqual(result.unexpected,[b]);
});
