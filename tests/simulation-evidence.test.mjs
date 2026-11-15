import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {PaperStore} from '../src/store.mjs';
import {WorkstationStore,syntheticReplayBinding} from '../src/workstation-store.mjs';
import {generateScenario} from '../src/engine.mjs';
import {buildDemoDataset} from '../scripts/seed-workstation-demo.mjs';
import {verifyBuiltInPrefix,readFictionalContractStatus} from '../src/simulation-evidence.mjs';

test('built-in prefix identity is stable when only unseen bars change',()=>{
  const bars=generateScenario(73),cursor=29,asOf=bars[cursor].date;
  const args={sourceId:'SIM-01',seed:73,cursor,asOf,bars};
  const first=verifyBuiltInPrefix(args);
  const altered=structuredClone(bars);altered[30].close+=1;
  assert.deepEqual(verifyBuiltInPrefix({...args,bars:altered}),first);
  altered[29].volume+=1;
  assert.throws(()=>verifyBuiltInPrefix({...args,bars:altered}),/does not match/);
  assert.throws(()=>verifyBuiltInPrefix({...args,sourceId:'REAL'}),/Unrecognized/);
  assert.throws(()=>verifyBuiltInPrefix({...args,asOf:'2026-01-01'}),/cursor or date/);
  assert.throws(()=>verifyBuiltInPrefix({...args,seed:74}),/does not match/);
});
test('seed identity is checked; missing or extended evidence is not elevated',()=>{
  const base=buildDemoDataset('SIM09'),paper={seed:73,cursor:29};
  const scan={asOf:base.sourceAsOf,syntheticReplayBinding:syntheticReplayBinding(base)};
  const status=readFictionalContractStatus(paper,{lastScans:{SIM09:scan,REAL:scan}});
  assert.equal(status.simulation.contract.mode,'FILLED_SIMULATION');
  assert.equal(status.observations.length,2);
  assert.equal(status.observations[0].status,'SEED_IDENTITY_MATCH');
  assert.equal(status.observations[0].contract.mode,'OBSERVATION_REFERENCE');
  assert.equal(status.observations[1].status,'NO_SAVED_SCAN');
  for(const patch of [{asOf:'2026-02-18'},{syntheticReplayBinding:'a'.repeat(64)},{syntheticReplayBinding:undefined}]){
    const result=readFictionalContractStatus(paper,{lastScans:{SIM09:{...scan,...patch}}});
    assert.equal(result.observations[0].status,'UNVERIFIED_SAVED_PREFIX');
    assert.equal(result.observations[0].contract,null);
  }
});
test('read-only evidence endpoint is local, rejects parameters and does not write or fetch',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'project9-contract-'));
  const port=19473;let server;
  try{
    const paperFile=join(dir,'paper.json'),workFile=join(dir,'workstation.json');
    const store=new PaperStore(paperFile),workstationStore=new WorkstationStore(workFile);
    let calls=0;
    server=await createApp({port,store,workstationStore,marketFetcher:async()=>{calls++;throw Error('Forbidden');}});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
    const before=await Promise.all([readFile(paperFile,'utf8'),readFile(workFile,'utf8')]);
    const response=await fetch('http://127.0.0.1:'+port+'/api/simulation-contracts');
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.scope,'FICTIONAL_OFFLINE');
    assert.equal(body.simulation.status,'BUILT_IN_PREFIX_VERIFIED');
    assert.ok(body.observations.every(x=>x.status==='NO_SAVED_SCAN'));
    assert.equal((await fetch('http://127.0.0.1:'+port+'/api/simulation-contracts?symbol=REAL')).status,400);
    assert.equal((await fetch('http://127.0.0.1:'+port+'/api/simulation-contracts',{method:'POST'})).status,404);
    assert.equal(calls,0);
    assert.deepEqual(await Promise.all([readFile(paperFile,'utf8'),readFile(workFile,'utf8')]),before);
  }finally{
    if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    await rm(dir,{recursive:true,force:true});
  }
});
