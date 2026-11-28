// Read-only inspection of fixed, invented classroom replay reports.
import {createHash} from 'node:crypto';
import {opendir,lstat,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {makeClockFixture,replayClockFixture} from './fictional-clock-replay.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const expected=new Map(['complete','gap','duplicate','reversed'].map(scenario=>{
  const bytes=JSON.stringify(replayClockFixture(makeClockFixture(scenario)))+'\n';
  return [hash(bytes)+'.json',bytes];
}));

export async function inspectClockEvidence(directory){
  const stat=await lstat(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Expected local evidence directory');
  const records=[];
  const dir=await opendir(directory);
  for await(const entry of dir){
    if(records.length>=128)throw new Error('Evidence inspection limit exceeded');
    const name=entry.name;
    if(name.startsWith('.pending-')){
      records.push({name,status:'INTERRUPTED_OR_ACTIVE_WRITE'});
      continue;
    }
    if(!expected.has(name)){
      records.push({name,status:'UNEXPECTED_ENTRY'});
      continue;
    }
    const path=join(directory,name);
    const info=await lstat(path);
    const bytes=expected.get(name);
    if(!info.isFile()||info.isSymbolicLink()||info.size!==Buffer.byteLength(bytes)){
      records.push({name,status:'INVALID_EVIDENCE'});
      continue;
    }
    const actual=await readFile(path);
    records.push({name,status:actual.equals(Buffer.from(bytes))?'VERIFIED_FIXTURE':'INVALID_EVIDENCE'});
  }
  records.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  const verified=records.filter(x=>x.status==='VERIFIED_FIXTURE').length;
  return {schema:'fictional-clock-evidence-audit-v1',fictional:true,records,verified,
    reviewRequired:records.length===0||verified!==records.length,
    inspectionIsAtomicSnapshot:false,marketDataUsed:false,transactionsEnabled:false};
}
