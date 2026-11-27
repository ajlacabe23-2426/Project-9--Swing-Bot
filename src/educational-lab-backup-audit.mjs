import {reportFictionalExperiments} from './educational-lab-report.mjs';

// Compare a trusted, independently retained fictional record inventory.
// No writes, no automatic restoration, no authentication claim.
export function auditFictionalBackup(root,manifest){
  const fail=()=>{throw new TypeError('Invalid fictional backup manifest');};
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||
     Object.keys(manifest).length!==3||
     !['schema','fictional','fingerprints'].every(key=>Object.hasOwn(manifest,key))||
     manifest.schema!=='educational-lab-inventory-v1'||
     manifest.fictional!==true||!Array.isArray(manifest.fingerprints)||
     manifest.fingerprints.length>2000)fail();
  const ids=manifest.fingerprints,expected=new Set();
  // Inspect every slot explicitly: Array.some skips holes and can be overridden.
  const length=ids.length;
  for(let i=0;i<length;i++){
    if(!Object.hasOwn(ids,i))fail();
    const id=ids[i];
    if(typeof id!=='string'||id.length!==64||!/^[a-f0-9]{64}$/.test(id)||expected.has(id))fail();
    expected.add(id);
  }
  const report=reportFictionalExperiments(root);
  const observed=new Set(report.records.map(r=>r.fingerprint));
  const unreadable=new Set(report.unreadable);
  const missing=[...expected].filter(id=>!observed.has(id)&&!unreadable.has(id)).sort();
  const corrupt=[...expected].filter(id=>unreadable.has(id)).sort();
  const unexpected=[...new Set([...observed,...unreadable])].filter(id=>!expected.has(id)).sort();
  const matched=[...expected].filter(id=>observed.has(id)).sort();
  return {
    schema:'educational-lab-backup-audit-v1',fictional:true,
    status:missing.length||corrupt.length||unexpected.length||report.pending.length||report.unrecognized.length?'REVIEW_REQUIRED':'INVENTORY_MATCH',
    expectedCount:expected.size,matched,missing,corrupt,unexpected,
    pending:report.pending,unrecognized:report.unrecognized,
    manifestAuthenticityVerified:false,pointInTimeSnapshotGuaranteed:false,
    restorationPerformed:false
  };
}
