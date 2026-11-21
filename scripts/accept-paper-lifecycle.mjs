/**
 * Project 9 Phase 3: isolated, deterministic-structure paper lifecycle acceptance.
 *
 * Every file lives under a newly allocated OS temp directory, and every HTTP
 * request targets an in-process loopback-only server. This script never opens
 * orders, contacts a market-data provider, or reads/writes the user's .data.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

import {createApp} from '../server.mjs';
import {PaperStore} from '../src/store.mjs';
import {WorkstationStore} from '../src/workstation-store.mjs';
import {runOperationalCycle} from './agent-operational-cycle.mjs';
import {seedWorkstationDemo} from './seed-workstation-demo.mjs';

const FIXED_CLOCK='2026-11-21T12:00:00.000Z';
const digest=text=>createHash('sha256').update(text).digest('hex');
const reviewed=scan=>{
  const plan=scan.paperRiskPlan;
  return {asOf:scan.asOf,binding:scan.syntheticReplayBinding,
    entry:plan.entryReference,stop:plan.stopReference,target:plan.targetReference};
};

async function unallocatedLoopbackPort(){
  const probe=createServer();
  await new Promise((done,reject)=>{
    probe.once('error',reject);
    probe.listen(0,'127.0.0.1',done);
  });
  const port=probe.address().port;
  await new Promise(done=>probe.close(done));
  assert.ok(port>=1024&&port<=65535);
  return port;
}

export async function runPaperLifecycleAcceptance(){
  const directory=await mkdtemp(join(tmpdir(),'p9-phase3-acceptance-'));
  const paperFile=join(directory,'paper.json');
  const workstationFile=join(directory,'workstation.json');
  let app=null;
  let providerCalls=0;
  const port=await unallocatedLoopbackPort();
  const base='http://127.0.0.1:'+port;

  async function start(){
    app=await createApp({
      port,store:new PaperStore(paperFile),
      workstationStore:new WorkstationStore(workstationFile),
      requireSessionEvidence:true,
      sessionPolicy:null,
      now:()=>new Date(FIXED_CLOCK),
      marketFetcher:async()=>{providerCalls++;throw new Error('External provider forbidden in isolated acceptance');}
    });
    await new Promise((done,reject)=>app.once('error',reject).listen(port,'127.0.0.1',done));
  }

  async function stop(){
    if(!app)return;
    const current=app;
    app=null;
    if(current.listening)await new Promise(done=>current.close(done));
  }

  async function get(path){
    const response=await fetch(base+path);
    return {status:response.status,body:await response.json()};
  }

  async function post(path,data){
    const response=await fetch(base+path,{method:'POST',
      headers:{Origin:base,'Content-Type':'application/json'},
      body:JSON.stringify(data)});
    return {status:response.status,body:await response.json()};
  }

  try{
    await seedWorkstationDemo({dataDir:directory});
    const sim09Seed=await readFile(join(directory,'SIM09.json'),'utf8');
    const sim10Seed=await readFile(join(directory,'SIM10.json'),'utf8');
    await start();
    const paperBefore=await readFile(paperFile,'utf8');

    const initial=await post('/api/workstation/refresh',{});
    assert.equal(initial.status,200);
    assert.deepEqual(initial.body.lastRefreshErrors,[]);
    assert.deepEqual(initial.body.watchlist,['SIM09','SIM10']);
    assert.equal(initial.body.lastScans.SIM09.classification,'PAPER_SETUP_STRONG');
    assert.equal(initial.body.lastScans.SIM10.classification,'NO_PAPER_SETUP');
    assert.equal(initial.body.tickets.length,0);
    assert.equal(providerCalls,0);

    const scanOnly=await runOperationalCycle({port,now:new Date(FIXED_CLOCK),fetcher:fetch});
    assert.equal(scanOnly.mutations.virtualTicketsCreated,0);
    assert.deepEqual(scanOnly.actions.map(a=>a.status),['SCANNED_ONLY','SCANNED_ONLY']);
    assert.equal((await get('/api/workstation')).body.tickets.length,0);

    const noSetup=await post('/api/workstation/tickets',{
      symbol:'SIM10',paperUnits:0.001,
      reviewedScan:reviewed(initial.body.lastScans.SIM10)});
    assert.equal(noSetup.status,400);
    assert.match(noSetup.body.error,/watch or strong research classification/);

    const attempted={symbol:'SIM09',paperUnits:0.001,
      reviewedScan:reviewed(initial.body.lastScans.SIM09)};
    const beforeRejects=await readFile(workstationFile,'utf8');
    const withoutReview=await post('/api/workstation/tickets',{
      symbol:'SIM09',paperUnits:0.001});
    assert.equal(withoutReview.status,409);
    const forged=await post('/api/workstation/tickets',{
      ...attempted,reviewedScan:{...attempted.reviewedScan,binding:'0'.repeat(64)}});
    assert.equal(forged.status,409);
    assert.equal(await readFile(workstationFile,'utf8'),beforeRejects);

    const simultaneous=await Promise.all([
      post('/api/workstation/tickets',attempted),
      post('/api/workstation/tickets',attempted)
    ]);
    assert.deepEqual(simultaneous.map(x=>x.status).sort(),[200,409]);
    const ticket=simultaneous.find(x=>x.status===200).body.tickets[0];
    assert.equal(ticket.symbol,'SIM09');
    assert.equal(ticket.openedAsOf,attempted.reviewedScan.asOf);
    assert.equal(ticket.syntheticBinding,attempted.reviewedScan.binding);
    assert.equal(ticket.classificationAtOpen,'PAPER_SETUP_STRONG');
    assert.equal(ticket.paperUnits,0.001);
    assert.equal(ticket.outcome.status,'OPEN_PAPER_OBSERVATION');
    assert.equal('broker' in ticket,false);
    const created=(await get('/api/workstation')).body;
    assert.equal(created.tickets.length,1);
    assert.equal(created.tickets[0].id,ticket.id);
    const savedAfterCreate=await readFile(workstationFile,'utf8');
    assert.equal((await post('/api/workstation/tickets',attempted)).status,409);
    assert.equal(await readFile(workstationFile,'utf8'),savedAfterCreate);

    await stop();
    await start();
    const reopened=(await get('/api/workstation')).body;
    assert.deepEqual(reopened,created);
    assert.equal((await post('/api/workstation/tickets',attempted)).status,409);
    assert.equal(await readFile(workstationFile,'utf8'),savedAfterCreate);

    const hold=await post('/api/workstation/demo/advance',{
      symbol:'SIM09',scenario:'HOLD',expectedAsOf:ticket.openedAsOf});
    assert.equal(hold.status,200);
    assert.equal(hold.body.syntheticStep.paperTicketsCreated,0);
    assert.equal(hold.body.tickets.length,1);
    assert.equal(hold.body.tickets[0].id,ticket.id);
    assert.equal(hold.body.tickets[0].outcome.status,'OPEN_PAPER_OBSERVATION');
    assert.notEqual(hold.body.lastScans.SIM09.asOf,ticket.openedAsOf);
    assert.equal(hold.body.lastScans.SIM10.classification,'NO_PAPER_SETUP');

    const beforeRepeatedHold=await readFile(workstationFile,'utf8');
    assert.equal((await post('/api/workstation/demo/advance',{
      symbol:'SIM09',scenario:'HOLD',expectedAsOf:ticket.openedAsOf})).status,409);
    assert.equal(await readFile(workstationFile,'utf8'),beforeRepeatedHold);

    const target=await post('/api/workstation/demo/advance',{
      symbol:'SIM09',scenario:'TARGET',expectedAsOf:hold.body.lastScans.SIM09.asOf});
    assert.equal(target.status,200);
    assert.equal(target.body.tickets.length,1);
    assert.equal(target.body.tickets[0].id,ticket.id);
    assert.equal(target.body.tickets[0].outcome.status,'TARGET_REFERENCE_TOUCHED');
    assert.equal(target.body.syntheticStep.ticketsStillOpen,0);
    assert.equal(target.body.syntheticStep.realOrdersCreated,0);
    assert.equal(target.body.alerts.length,0);
    assert.equal((await post('/api/workstation/tickets',attempted)).status,409);

    const afterRefresh=await post('/api/workstation/refresh',{});
    assert.equal(afterRefresh.status,200);
    assert.deepEqual(afterRefresh.body.lastRefreshErrors,[]);
    assert.deepEqual(afterRefresh.body.tickets,target.body.tickets);
    const finalState=(await get('/api/workstation')).body;
    await stop();
    await start();
    assert.deepEqual((await get('/api/workstation')).body,finalState);

    const broker=await fetch(base+'/api/broker/orders');
    assert.equal(broker.status,404);
    assert.equal(providerCalls,0);
    assert.equal(await readFile(paperFile,'utf8'),paperBefore);
    assert.equal(await readFile(join(directory,'SIM09.json'),'utf8'),sim09Seed);
    assert.equal(await readFile(join(directory,'SIM10.json'),'utf8'),sim10Seed);
    assert.equal(finalState.watchlist.includes('AAPL'),false);
    assert.equal(finalState.tickets.some(t=>t.symbol!=='SIM09'),false);

    return {
      schema:'project9-phase3-paper-lifecycle-acceptance-v1',
      mode:'OFFLINE_ENGINEERED_SYNTHETIC_ONLY',
      fixtureSymbols:['SIM09','SIM10'],
      defaultCycleTickets:scanOnly.mutations.virtualTicketsCreated,
      noSetupDenialStatus:noSetup.status,
      missingReviewDenialStatus:withoutReview.status,
      forgedReviewDenialStatus:forged.status,
      simultaneousCreateStatuses:simultaneous.map(x=>x.status).sort(),
      duplicateAfterRestartStatus:409,
      lifecycle:['OPEN_PAPER_OBSERVATION','OPEN_PAPER_OBSERVATION','TARGET_REFERENCE_TOUCHED'],
      journalRestoredIdentically:true,
      legacyPaperStateUnchanged:true,
      fixtureFilesUnchanged:true,
      realProviderCalls:providerCalls,
      realOrdersCreated:0,
      finalJournalSha256:digest(await readFile(workstationFile,'utf8')),
      limitations:'This is an isolated synthetic acceptance, not a live AAPL ticket, real vendor validation, profitability, or a multi-process crash-durability guarantee.'
    };
  }finally{
    await stop();
    await rm(directory,{recursive:true,force:true});
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runPaperLifecycleAcceptance().then(report=>{
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
  }).catch(error=>{
    console.error('Project 9 isolated acceptance FAILED:',error.message);
    process.exitCode=1;
  });
}
