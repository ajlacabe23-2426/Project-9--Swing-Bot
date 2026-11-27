import {mkdirSync,mkdtempSync,writeFileSync,linkSync,rmSync,openSync,fstatSync,readSync,closeSync,constants} from 'node:fs';
import {join} from 'node:path';
import {summarizeFictionalLab} from './educational-lab-summary.mjs';

// A local, caller-selected trusted directory for fictional length measurements.
// Immutable records, not a database or a multi-user storage service.
const MAX_BYTES=160000;
function canonical(input){
  const summary=summarizeFictionalLab(input);
  const record={schema:input.schema,fictional:true,experimentId:input.experimentId,
    instrument:input.instrument,plannedCount:input.plannedCount,
    observations:input.observations.map(o=>({index:o.index,status:o.status,value:o.value}))};
  return {summary,bytes:Buffer.from(JSON.stringify(record),'utf8')};
}
function recordPath(root,fingerprint){
  if(typeof fingerprint!=='string'||!(/^[a-f0-9]{64}$/).test(fingerprint))
    throw new TypeError('Invalid fictional evidence fingerprint');
  return join(root,fingerprint+'.json');
}
export function loadFictionalExperiment(root,fingerprint){
  const path=recordPath(root,fingerprint);
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  let bytes;
  try{
    const info=fstatSync(fd);
    if(!info.isFile()||info.size<1||info.size>MAX_BYTES)throw new TypeError('Invalid fictional evidence file');
    bytes=Buffer.alloc(info.size+1);
    let offset=0;
    while(offset<bytes.length){
      const n=readSync(fd,bytes,offset,bytes.length-offset,null);
      if(!n)break;
      offset+=n;
    }
    if(offset!==info.size)throw new TypeError('Fictional evidence size changed');
    bytes=bytes.subarray(0,offset);
  }finally{closeSync(fd);}
  const record=JSON.parse(bytes.toString('utf8'));
  const checked=canonical(record);
  if(checked.summary.fingerprint!==fingerprint||!checked.bytes.equals(bytes))
    throw new TypeError('Fictional evidence integrity mismatch');
  return {record,summary:checked.summary};
}
export function saveFictionalExperiment(root,input){
  const checked=canonical(input);
  if(checked.bytes.length>MAX_BYTES)throw new TypeError('Fictional evidence too large');
  mkdirSync(root,{recursive:true,mode:0o700});
  const path=recordPath(root,checked.summary.fingerprint);
  const temp=mkdtempSync(join(root,'.pending-'));
  try{
    const pending=join(temp,'record.json');
    writeFileSync(pending,checked.bytes,{flag:'wx',mode:0o600});
    try{linkSync(pending,path);}
    catch(error){if(error.code!=='EEXIST')throw error;}
    // Never silently overwrite an existing or corrupted record.
    const saved=loadFictionalExperiment(root,checked.summary.fingerprint);
    return saved.summary;
  }finally{rmSync(temp,{recursive:true,force:true});}
}
