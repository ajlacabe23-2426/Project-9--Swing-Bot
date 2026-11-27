import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,mkdirSync,readdirSync,readFileSync,writeFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {saveFictionalExperiment} from '../src/educational-lab-registry.mjs';
import {captureFictionalInventory,copyVerifiedFictionalRegistry} from '../src/educational-lab-backup.mjs';
import {auditFictionalBackup} from '../src/educational-lab-backup-audit.mjs';

function fixture(t){
  const root=mkdtempSync(join(realpathSync(tmpdir()),'fictional-copy-test-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const source=join(root,'source'),backups=join(root,'backups'),restores=join(root,'restores');
  for(const path of [source,backups,restores])mkdirSync(path);
  const input={schema:'educational-lab-v1',fictional:true,experimentId:'copy-test',instrument:'FICTIONAL_LENGTH_MM',plannedCount:3,observations:[{index:1,status:'OBSERVED',value:0},{index:2,status:'FAILED',value:null}]};
  const ids=[saveFictionalExperiment(source,input).fingerprint];
  input.observations.push({index:3,status:'OBSERVED',value:9});
  ids.push(saveFictionalExperiment(source,input).fingerprint);
  return {root,source,backups,restores,ids,manifest:captureFictionalInventory(source)};
}
test('verified backup and restoration preserve each record byte-for-byte in separate directories',t=>{
  const {source,backups,restores,ids,manifest}=fixture(t);
  const original=new Map(ids.map(id=>[id,readFileSync(join(source,id+'.json'))]));
  const backup=copyVerifiedFictionalRegistry(source,backups,manifest);
  assert.equal(backup.status,'VERIFIED_COPY');assert.equal(backup.copiedCount,2);
  assert.equal(backup.manifestAuthenticityVerified,false);
  assert.equal(backup.hardwareDurabilityVerified,false);
  rmSync(join(source,ids[0]+'.json'));
  writeFileSync(join(source,ids[1]+'.json'),'{');
  assert.equal(auditFictionalBackup(source,manifest).status,'REVIEW_REQUIRED');
  const restored=copyVerifiedFictionalRegistry(backup.destination,restores,manifest);
  assert.equal(auditFictionalBackup(restored.destination,manifest).status,'INVENTORY_MATCH');
  for(const [id,bytes] of original){
    assert.deepEqual(readFileSync(join(restored.destination,id+'.json')),bytes);
    assert.deepEqual(readFileSync(join(backup.destination,id+'.json')),bytes);
  }
  assert.equal(readFileSync(join(source,ids[1]+'.json'),'utf8'),'{');
  assert.deepEqual(readdirSync(source),[ids[1]+'.json']);
});
test('corrupted or missing source records block backup before destination creation',t=>{
  const {source,backups,ids,manifest}=fixture(t);
  writeFileSync(join(source,ids[0]+'.json'),'{');
  assert.throws(()=>captureFictionalInventory(source),/requires review/);
  assert.throws(()=>copyVerifiedFictionalRegistry(source,backups,manifest),/inventory mismatch/);
  rmSync(join(source,ids[0]+'.json'));
  assert.throws(()=>copyVerifiedFictionalRegistry(source,backups,manifest),/inventory mismatch/);
  assert.deepEqual(readdirSync(backups),[]);
});
test('repeated copies allocate distinct directories without replacing prior evidence',t=>{
  const {source,backups,manifest}=fixture(t);
  const a=copyVerifiedFictionalRegistry(source,backups,manifest),b=copyVerifiedFictionalRegistry(source,backups,manifest);
  assert.notEqual(a.destination,b.destination);
  for(const destination of [a.destination,b.destination])assert.equal(auditFictionalBackup(destination,manifest).status,'INVENTORY_MATCH');
});
test('unsafe destination roots and nested source copies are rejected',t=>{
  const {root,source,backups,manifest}=fixture(t);
  const alias=join(root,'alias');symlinkSync(backups,alias);
  for(const parent of [source,join(source,'nested'),alias])assert.throws(()=>copyVerifiedFictionalRegistry(source,parent,manifest));
  assert.deepEqual(readdirSync(backups),[]);
  assert.equal(auditFictionalBackup(source,manifest).status,'INVENTORY_MATCH');
});
