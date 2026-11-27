import {reportFictionalExperiments} from './educational-lab-report.mjs';

// Compare a trusted, independently retained fictional record inventory.
// No writes, no automatic restoration, no authentication claim.
export function auditFictionalBackup(root,manifest){
  const fail=()=>{throw new TypeError('Invalid fictional backup manifest');};
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||
     Object.keys(manifest).length!==3||manifest.schema!=='educational-lab-inventory-v1'||
     manifest.fictional!==true||!Array.isArray(manifest.fingerprints)||
     manifest.fingerprints.length>2000)fail();
  const ids=manifest.fingerprints;
  if(ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))||
     new Set(ids).size!==ids.length)fail();
  const expected=new Set(ids),report=reportFictionalExperiments(root);
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
