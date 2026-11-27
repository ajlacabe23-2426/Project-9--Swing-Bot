import {mkdtempSync,lstatSync,renameSync} from 'node:fs';
import {resolve,relative,isAbsolute,join,sep,basename} from 'node:path';
import {assertFictionalRoot,loadFictionalExperiment,saveFictionalExperiment} from './educational-lab-registry.mjs';
import {reportFictionalExperiments} from './educational-lab-report.mjs';
import {auditFictionalBackup} from './educational-lab-backup-audit.mjs';

// Trusted, quiescent local directories only. Inventory is not a signature or backup by itself.
export function captureFictionalInventory(root){
  const report=reportFictionalExperiments(root);
  if(report.status==='REVIEW_REQUIRED')throw new TypeError('Fictional inventory source requires review');
  return {schema:'educational-lab-inventory-v1',fictional:true,
    fingerprints:report.records.map(x=>x.fingerprint).sort()};
}
function inside(parent,child){
  const r=relative(parent,child);
  return r===''||(!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep));
}

// Use this for backup or restoration into a fresh, private destination directory.
// Never overwrite an existing registry. A failed copy is left for explicit inspection.
export function copyVerifiedFictionalRegistry(source,destinationParent,manifest){
  assertFictionalRoot(source);assertFictionalRoot(destinationParent);
  const src=resolve(source),parent=resolve(destinationParent);
  if(inside(src,parent))throw new TypeError('Destination must be outside fictional source');
  if(!lstatSync(parent).isDirectory())throw new TypeError('Invalid fictional destination parent');
  const audit=auditFictionalBackup(src,manifest);
  if(audit.status!=='INVENTORY_MATCH')throw new TypeError('Fictional source inventory mismatch');
  // The validated fingerprints are a snapshot of the supplied inventory, not an atomic disk snapshot.
  const expected={schema:'educational-lab-inventory-v1',fictional:true,fingerprints:[...audit.matched]};
  const records=expected.fingerprints.map(id=>({id,record:loadFictionalExperiment(src,id).record}));
  if(auditFictionalBackup(src,expected).status!=='INVENTORY_MATCH')throw new TypeError('Fictional source changed during validation');
  const staging=mkdtempSync(join(parent,'.pending-copy-'));
  const stageName=basename(staging);
  const destination=join(parent,'fictional-copy-'+stageName.slice('.pending-copy-'.length));
  let published=false;
  try{
    for(const {id,record} of records){
      if(saveFictionalExperiment(staging,record).fingerprint!==id)throw new Error('Fictional copied identity mismatch');
    }
    const staged=reportFictionalExperiments(staging);
    const observed=staged.records.map(r=>r.fingerprint).sort();
    if(staged.pending.length!==1||staged.pending[0]!==stageName||
       staged.unreadable.length||staged.unrecognized.length||
       observed.length!==expected.fingerprints.length||
       observed.some((id,i)=>id!==expected.fingerprints[i]))
      throw new Error('Fictional staging inventory mismatch');
    // The parent must remain trusted and quiescent; this is not a concurrent-publisher lock.
    if(lstatSync(destination,{throwIfNoEntry:false}))throw new Error('Fictional destination already exists');
    renameSync(staging,destination);
    published=true;
    const checked=auditFictionalBackup(destination,expected);
    if(checked.status!=='INVENTORY_MATCH')throw new Error('Fictional destination inventory mismatch');
    return {schema:'educational-lab-copy-v1',fictional:true,status:'VERIFIED_COPY',
      destination,copiedCount:records.length,inventory:expected,sourceOverwritten:false,
      manifestAuthenticityVerified:false,pointInTimeSnapshotGuaranteed:false,
      hardwareDurabilityVerified:false};
  }catch(cause){
    const error=new Error('Fictional copy incomplete; inspect isolated destination',{cause});
    error.destination=published?destination:staging;
    throw error;
  }
}
