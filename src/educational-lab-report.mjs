import {opendirSync} from 'node:fs';
import {basename,resolve} from 'node:path';
import {loadFictionalExperiment,assertFictionalRoot} from './educational-lab-registry.mjs';

// Read-only reporting for the trusted local fictional laboratory directory.
export function reportFictionalExperiments(root){
  assertFictionalRoot(root);
  const entries=[];
  const dir=opendirSync(root);
  try{
    for(let entry; (entry=dir.readSync())!==null;){
      if(entries.length>=2000)throw new TypeError('Fictional registry entry limit exceeded');
      entries.push(entry.name);
    }
  }finally{dir.closeSync();}
  const records=[],unreadable=[],unrecognized=[],pending=[],diagnostics=[];
  // A copy staging directory is never a completed inventory, even when all files are readable.
  const rootName=basename(resolve(root));
  if(/^\.pending-copy-/i.test(rootName))pending.push(rootName);
  let totalObservations=0;
  for(const name of entries.sort()){
    if(/^\.pending-[a-zA-Z0-9]+$/.test(name)){pending.push(name);continue;}
    if(!/^[a-f0-9]{64}\.json$/.test(name)){unrecognized.push(name);continue;}
    const fingerprint=name.slice(0,-5);
    try{const loaded=loadFictionalExperiment(root,fingerprint);records.push({...loaded.summary,observations:loaded.record.observations});totalObservations+=loaded.record.observations.length;}
    catch(error){unreadable.push(fingerprint);diagnostics.push({fingerprint,code:error instanceof SyntaxError?'MALFORMED_JSON':error.code==='ELOOP'?'UNSAFE_SYMLINK':error.code==='ENOENT'?'DISAPPEARED_DURING_SCAN':'INTEGRITY_OR_SCHEMA_FAILURE'});}
    if(totalObservations>20000)throw new TypeError('Fictional report observation limit exceeded');
  }
  const completeCount=records.filter(r=>r.status==='COMPLETE_RECORD').length;
  const incompleteCount=records.length-completeCount;
  return {schema:'educational-lab-report-v1',fictional:true,scope:'NON_FINANCIAL_FICTIONAL_LAB',
    status:unreadable.length||unrecognized.length||pending.length?'REVIEW_REQUIRED':incompleteCount?'INCOMPLETE_RECORDS_PRESENT':'NO_RECORD_ERRORS_OBSERVED',
    recordCount:records.length,completeCount,incompleteCount,
    failedObservationCount:records.reduce((n,r)=>n+r.failed.length,0),
    missingObservationCount:records.reduce((n,r)=>n+r.missing.length,0),
    unreadable,unrecognized,pending,records,diagnostics,scientificValidityEstablished:false,
    pointInTimeSnapshotGuaranteed:false};
}
