import {mkdtempSync,lstatSync} from 'node:fs';
import {resolve,relative,isAbsolute,join,sep} from 'node:path';
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
  const destination=mkdtempSync(join(parent,'fictional-copy-'));
  try{
    for(const {id,record} of records){
      if(saveFictionalExperiment(destination,record).fingerprint!==id)throw new Error('Fictional copied identity mismatch');
    }
    const checked=auditFictionalBackup(destination,expected);
    if(checked.status!=='INVENTORY_MATCH')throw new Error('Fictional destination inventory mismatch');
    return {schema:'educational-lab-copy-v1',fictional:true,status:'VERIFIED_COPY',
      destination,copiedCount:records.length,inventory:expected,sourceOverwritten:false,
      manifestAuthenticityVerified:false,pointInTimeSnapshotGuaranteed:false,
      hardwareDurabilityVerified:false};
  }catch(cause){
    const error=new Error('Fictional copy incomplete; inspect isolated destination',{cause});
    error.destination=destination;
    throw error;
  }
}
