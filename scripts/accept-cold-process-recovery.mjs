/**
 * Real operating-system process recovery exercise over disposable fictional data.
 * Every server is a distinct child PID and is killed with SIGKILL. No provider,
 * broker, scheduler, existing .data, or real-market observations are touched.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {seedWorkstationDemo} from './seed-workstation-demo.mjs';
import {assertPatchedNodeRuntime} from '../src/runtime-security.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=input=>createHash('sha256').update(input).digest('hex');

async function freeLoopbackPort(){
  const probe=createServer();
  await new Promise((done,reject)=>probe.once('error',reject).listen(0,'127.0.0.1',done));
  const port=probe.address().port;
  await new Promise(done=>probe.close(done));
  assert.ok(port>1023&&port<=65535);
  return port;
}

function spawnServer({port,directory,pauseBeforeRename=false}){
  const journal=join(directory,'workstation.json');
  const paper=join(directory,'paper.json');
  const code=`
    import {syncBuiltinESMExports} from 'node:module';
    if (${JSON.stringify(pauseBeforeRename)}) {
      const fs=await import('node:fs/promises');
      const original=fs.rename;
      fs.rename=async(from,to)=>{
        if(to===${JSON.stringify(journal)}){
          process.stdout.write('BEFORE_RENAME\\n');
          await new Promise(()=>{});
        }
        return original(from,to);
      };
      syncBuiltinESMExports();
    }
    const {createApp}=await import('./server.mjs');
    const {PaperStore}=await import('./src/store.mjs');
    const {WorkstationStore}=await import('./src/workstation-store.mjs');
    const app=await createApp({
      port:${port},
      store:new PaperStore(${JSON.stringify(paper)}),
      workstationStore:new WorkstationStore(${JSON.stringify(journal)}),
      requireSessionEvidence:true,
      sessionPolicy:null,
      now:()=>new Date('2026-11-22T12:00:00Z'),
      marketFetcher:async()=>{throw new Error('External market provider forbidden');}
    });
    app.listen(${port},'127.0.0.1',()=>process.stdout.write('READY '+process.pid+'\\n'));
  `;
  const child=spawn(process.execPath,['--input-type=module','--eval',code],
    {cwd:root,stdio:['ignore','pipe','pipe'],env:{...process.env,MASSIVE_API_KEY:''}});
  let stdout='',stderr='';
  child.stdout.on('data',chunk=>{stdout=(stdout+String(chunk)).slice(-8192);});
  child.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-8192);});
  const wait=async(token,timeoutMs=12000)=>new Promise((resolve,reject)=>{
    const started=Date.now();
    const ticker=setInterval(()=>{
      if(stdout.includes(token)){clearInterval(ticker);resolve(stdout);return;}
      if(child.exitCode!==null||child.signalCode!==null||Date.now()-started>=timeoutMs){
        clearInterval(ticker);
        reject(new Error('Child did not emit '+token+'; exit='+child.exitCode+' stderr='+stderr.slice(-900)));
      }
    },25);
  });
  return {child,wait,logs:()=>({stdout,stderr})};
}

async function kill(child){
  if(child.exitCode!==null||child.signalCode!==null)return;
  const exited=once(child,'exit');
  assert.equal(child.kill('SIGKILL'),true);
  await Promise.race([
    exited,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('SIGKILL did not terminate child')),5000))
  ]);
}

function review(scan){
  const p=scan.paperRiskPlan;
  return {asOf:scan.asOf,binding:scan.syntheticReplayBinding,
    entry:p.entryReference,stop:p.stopReference,target:p.targetReference};
}

export async function runColdProcessRecoveryAcceptance(){
  assertPatchedNodeRuntime();
  const directory=await mkdtemp(join(tmpdir(),'p9-cold-process-recovery-'));
  let server=null;
  const pids=[];
  const port=await freeLoopbackPort();
  const base='http://127.0.0.1:'+port;
  const journal=join(directory,'workstation.json');
  const get=async()=>{
    const response=await fetch(base+'/api/workstation');
    assert.equal(response.status,200);
    return response.json();
  };
  const post=async(path,body)=>{
    const response=await fetch(base+path,{method:'POST',
      headers:{Origin:base,'Content-Type':'application/json'},
      body:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  };
  const start=async(pauseBeforeRename=false)=>{
    server=spawnServer({port,directory,pauseBeforeRename});
    await server.wait('READY ');
    assert.ok(Number.isSafeInteger(server.child.pid));
    assert.notEqual(server.child.pid,process.pid);
    assert.ok(!pids.includes(server.child.pid),'every recovery must create a new PID');
    pids.push(server.child.pid);
  };
  const stop=async()=>{if(server){const current=server;server=null;await kill(current.child);}};
  try{
    await seedWorkstationDemo({dataDir:directory});
    const seeds=await Promise.all(['SIM09','SIM10'].map(symbol=>
      readFile(join(directory,symbol+'.json'),'utf8')));
    await start();
    const initial=await post('/api/workstation/refresh',{});
    assert.equal(initial.status,200);
    assert.deepEqual(initial.body.lastRefreshErrors,[]);
    assert.equal(initial.body.lastScans.SIM09.classification,'PAPER_SETUP_STRONG');
    assert.equal(initial.body.lastScans.SIM10.classification,'NO_PAPER_SETUP');
    const reviewedScan=review(initial.body.lastScans.SIM09);
    const proposed={symbol:'SIM09',paperUnits:0.001,reviewedScan};
    const first=await post('/api/workstation/tickets',proposed);
    assert.equal(first.status,200);
    assert.equal(first.body.tickets.length,1);
    const ticket=first.body.tickets[0];
    assert.equal(ticket.outcome.status,'OPEN_PAPER_OBSERVATION');
    const originalJournal=await readFile(journal,'utf8');
    await stop(); // Actual SIGKILL of server #1, AFTER durable ticket commit.

    await start();
    const restored=await get();
    assert.deepEqual(restored,JSON.parse(originalJournal));
    assert.equal(restored.tickets[0].id,ticket.id);
    const duplicate=await post('/api/workstation/tickets',proposed);
    assert.equal(duplicate.status,409);
    assert.equal(await readFile(journal,'utf8'),originalJournal);
    const hold=await post('/api/workstation/demo/advance',{
      symbol:'SIM09',scenario:'HOLD',expectedAsOf:ticket.openedAsOf});
    assert.equal(hold.status,200);
    assert.equal(hold.body.tickets.length,1);
    assert.equal(hold.body.tickets[0].outcome.status,'OPEN_PAPER_OBSERVATION');
    const heldJournal=await readFile(journal,'utf8');
    await stop(); // Actual SIGKILL of server #2, AFTER synthetic HOLD commit.

    await start();
    assert.deepEqual(await get(),JSON.parse(heldJournal));
    const target=await post('/api/workstation/demo/advance',{
      symbol:'SIM09',scenario:'TARGET',expectedAsOf:hold.body.lastScans.SIM09.asOf});
    assert.equal(target.status,200);
    assert.equal(target.body.tickets.length,1);
    assert.equal(target.body.tickets[0].id,ticket.id);
    assert.equal(target.body.tickets[0].outcome.status,'TARGET_REFERENCE_TOUCHED');
    const terminalJournal=await readFile(journal,'utf8');
    await stop(); // Actual SIGKILL of server #3, AFTER terminal outcome commit.

    await start();
    assert.deepEqual(await get(),JSON.parse(terminalJournal));
    assert.equal((await post('/api/workstation/tickets',proposed)).status,409);
    assert.equal((await fetch(base+'/api/broker/orders')).status,404);
    await stop();

    // Inject a failure at the precise workstation rename boundary in a
    // DIFFERENT process. Killing this process cannot commit the staged JSON.
    await start(true);
    assert.deepEqual(await get(),JSON.parse(terminalJournal));
    const pending=post('/api/workstation/watchlist',{symbols:['SIM09']})
      .then(()=>({resolved:true}),error=>({resolved:false,error:String(error)}));
    await server.wait('BEFORE_RENAME');
    await stop(); // SIGKILL with the atomic rename deliberately suspended.
    assert.equal((await pending).resolved,false);
    assert.equal(await readFile(journal,'utf8'),terminalJournal);

    await start();
    const finalState=await get();
    assert.deepEqual(finalState,JSON.parse(terminalJournal));
    assert.deepEqual(finalState.watchlist,['SIM09','SIM10']);
    assert.equal(finalState.tickets.length,1);
    assert.equal(finalState.tickets[0].outcome.status,'TARGET_REFERENCE_TOUCHED');
    assert.equal((await post('/api/workstation/tickets',proposed)).status,409);
    assert.equal(await readFile(journal,'utf8'),terminalJournal);
    assert.equal((await fetch(base+'/api/broker/orders')).status,404);
    const files=await readdir(directory);
    const stagedOrphans=files.filter(name=>name.startsWith('workstation.json.')&&name.endsWith('.tmp'));
    assert.ok(stagedOrphans.length>=1,'crashed writer must leave a staged, ignored temp file');
    for(let i=0;i<seeds.length;i++){
      const current=await readFile(join(directory,['SIM09','SIM10'][i]+'.json'),'utf8');
      assert.equal(current,seeds[i],'fictional seed must remain untouched');
    }
    assert.ok(pids.length>=5);
    return {
      schema:'project9-cold-process-recovery-v1',
      mode:'ENGINEERED_SYNTHETIC_ONLY',
      separateChildProcesses:pids.length,
      uniqueChildPids:new Set(pids).size===pids.length,
      realSigkillAfterTicket:true,
      realSigkillAfterHold:true,
      realSigkillAfterTarget:true,
      sigkillBeforeAtomicRename:true,
      originalTicketPreserved:true,
      duplicateRejectedAfterColdRestart:true,
      terminalOutcomeRecovered:true,
      interruptedSavePreservedCommittedBytes:true,
      ignoredStagedTempFiles:stagedOrphans.length,
      seedFilesUnchanged:true,
      externalMarketProviderAllowed:false,
      brokerEndpointStatus:404,
      realOrdersCreated:0,
      originalJournalSha256:hash(originalJournal),
      finalJournalSha256:hash(terminalJournal),
      limitations:'OS-process SIGKILL and atomic rename precommit tested in disposable fiction; not power-loss durability, fsync, multi-writer locking, real-data authenticity or actual brokerage execution.'
    };
  }finally{
    await stop();
    await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:50});
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runColdProcessRecoveryAcceptance()
    .then(report=>process.stdout.write(JSON.stringify(report,null,2)+'\n'))
    .catch(error=>{console.error('Cold-process recovery acceptance FAILED:',error.message);process.exitCode=1;});
}
