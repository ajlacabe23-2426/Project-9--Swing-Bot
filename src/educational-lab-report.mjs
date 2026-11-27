import {opendirSync} from 'node:fs';
import {loadFictionalExperiment} from './educational-lab-registry.mjs';

// Read-only reporting for the trusted local fictional laboratory directory.
export function reportFictionalExperiments(root){
  const entries=[];
  const dir=opendirSync(root);
  try{
    for(let entry; (entry=dir.readSync())!==null;){
      if(entries.length>=2000)throw new TypeError('Fictional registry entry limit exceeded');
      entries.push(entry.name);
    }
  }finally{dir.closeSync();}
  const records=[],unreadable=[],unrecognized=[],pending=[];
  for(const name of entries.sort()){
    if(/^\.pending-[a-zA-Z0-9]+$/.test(name)){pending.push(name);continue;}
    if(!/^[a-f0-9]{64}\.json$/.test(name)){unrecognized.push(name);continue;}
    const fingerprint=name.slice(0,-5);
    try{records.push(loadFictionalExperiment(root,fingerprint).summary);}
    catch{unreadable.push(fingerprint);}
  }
  const completeCount=records.filter(r=>r.status==='COMPLETE_RECORD').length;
  const incompleteCount=records.length-completeCount;
  return {schema:'educational-lab-report-v1',fictional:true,scope:'NON_FINANCIAL_FICTIONAL_LAB',
    status:unreadable.length||unrecognized.length||pending.length?'REVIEW_REQUIRED':incompleteCount?'INCOMPLETE_RECORDS_PRESENT':'NO_RECORD_ERRORS_OBSERVED',
    recordCount:records.length,completeCount,incompleteCount,
    failedObservationCount:records.reduce((n,r)=>n+r.failed.length,0),
    missingObservationCount:records.reduce((n,r)=>n+r.missing.length,0),
    unreadable,unrecognized,pending,records,scientificValidityEstablished:false,
    pointInTimeSnapshotGuaranteed:false};
}
