// Offline classroom exercise: fictional non-financial sensor observations.
// No market prices, accounts, provider requests, strategies or transactions.
import {createHash,randomUUID} from 'node:crypto';
import {open,link,unlink,readFile,lstat,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const sha=s=>createHash('sha256').update(s).digest('hex');
const start=Date.parse('2024-02-28T23:00:00.000Z'), step=3600000;
const allowed=new Set(['complete','gap','duplicate','reversed']);
const schema='starnet-fictional-clock-replay-v1';

export function makeClockFixture(scenario='complete'){
  if(!allowed.has(scenario))throw new TypeError('Unknown classroom scenario');
  const rows=Array.from({length:72},(_,i)=>({
    at:new Date(start+i*step).toISOString(),reading:(i*17+11)%101
  }));
  if(scenario==='gap')rows.splice(25,2);
  if(scenario==='duplicate')rows.splice(25,0,{...rows[24]});
  if(scenario==='reversed')[rows[25],rows[26]]=[rows[26],rows[25]];
  return {schema,scenario,fictional:true,unit:'invented sensor units',rows};
}

export function replayClockFixture(fixture){
  // Only the built-in invented examples are accepted; arbitrary real data is not.
  if(!fixture||!allowed.has(fixture.scenario)||
     JSON.stringify(fixture)!==JSON.stringify(makeClockFixture(fixture.scenario)))
    throw new TypeError('Only exact built-in fictional observations are supported');
  let missing=0,duplicates=0,reversed=0,previous=null;
  const observations=[];
  for(const row of fixture.rows){
    const t=Date.parse(row.at);
    let status='OBSERVED';
    if(previous!==null){
      const delta=(t-previous)/step;
      if(delta===0){duplicates++;status='DUPLICATE';}
      else if(delta<0){reversed++;status='REVERSED';}
      else if(delta>1){missing+=delta-1;status='GAP_BEFORE';}
    }
    observations.push({at:row.at,status});
    // Preserve the latest chronological boundary; never move the clock backwards.
    previous=previous===null?t:Math.max(previous,t);
  }
  return {schema,fictional:true,scenario:fixture.scenario,fixtureSha256:sha(JSON.stringify(fixture)),
    received:fixture.rows.length,missing,duplicates,reversed,observations,
    quality:missing||duplicates||reversed?'REVIEW_REQUIRED':'COMPLETE',
    marketDataUsed:false,transactionsEnabled:false};
}

export async function saveClockEvidence(directory,scenario){
  const report=replayClockFixture(makeClockFixture(scenario));
  const bytes=JSON.stringify(report)+'\n';
  const id=sha(bytes);
  await mkdir(directory,{recursive:true,mode:0o700});
  const stat=await lstat(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Expected local evidence directory');
  const target=join(directory,id+'.json');
  const temporary=join(directory,'.pending-'+randomUUID());
  let handle;
  try{
    handle=await open(temporary,'wx',0o600);
    await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;
    try{await link(temporary,target);}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      const existing=await lstat(target);
      if(!existing.isFile()||existing.isSymbolicLink()||existing.size!==Buffer.byteLength(bytes)||
         await readFile(target,'utf8')!==bytes)throw new Error('Existing evidence differs; refusing replacement');
    }
    const folder=await open(directory,'r');
    try{await folder.sync();}finally{await folder.close();}
    return {id,file:target,report};
  }finally{
    if(handle)await handle.close();
    await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
  }
}
