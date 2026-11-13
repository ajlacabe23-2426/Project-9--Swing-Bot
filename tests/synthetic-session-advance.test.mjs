import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {PaperStore} from '../src/store.mjs';
import {WorkstationStore,evaluatePaperTicket} from '../src/workstation-store.mjs';
import {evaluateSwingSetup} from '../src/market-intelligence.mjs';
import {seedWorkstationDemo,buildDemoDataset} from '../scripts/seed-workstation-demo.mjs';
import {appendSyntheticSession,advanceSyntheticPaperSession} from '../src/synthetic-session-advance.mjs';

function frozenTicket(dataset){
  const plan=evaluateSwingSetup(dataset).paperRiskPlan;
  return {
    id:'P9-0001',symbol:'SIM09',openedAsOf:dataset.sourceAsOf,
    paperUnits:1,entryReference:plan.entryReference,stopReference:plan.stopReference,
    targetReference:plan.targetReference,
    classificationAtOpen:'PAPER_SETUP_STRONG',scoreAtOpen:80,
    outcome:{status:'OPEN_PAPER_OBSERVATION'}
  };
}
test('neutral, target, stop and same-bar ambiguous outcomes use a new invented daily bar',()=>{
  const input=buildDemoDataset('SIM09'),ticket=frozenTicket(input);
  const hold=appendSyntheticSession(input,{scenario:'HOLD',referenceTicket:ticket});
  assert.equal(hold.bar.date,'2026-02-17');
  assert.equal(hold.dataset.bars.length,input.bars.length+1);
  assert.deepEqual(hold.dataset.bars.slice(0,input.bars.length),input.bars);
  assert.equal(evaluatePaperTicket(ticket,hold.dataset).status,'OPEN_PAPER_OBSERVATION');
  for(const [scenario,status] of [
    ['TARGET','TARGET_REFERENCE_TOUCHED'],['STOP','STOP_REFERENCE_TOUCHED'],
    ['BOTH','AMBIGUOUS_SAME_BAR']
  ]){
    const next=appendSyntheticSession(input,{scenario,referenceTicket:ticket});
    const observation=evaluatePaperTicket(ticket,next.dataset);
    assert.equal(observation.status,status,scenario);
    assert.equal(observation.observedThrough,next.bar.date);
    assert.ok(next.bar.high>=Math.max(next.bar.open,next.bar.close));
    assert.ok(next.bar.low<=Math.min(next.bar.open,next.bar.close));
  }
});
test('only exact seeded synthetic prefix can advance; real-labeled/corrupt inputs rejected',()=>{
  const input=buildDemoDataset('SIM09');
  assert.throws(()=>appendSyntheticSession({...input,source:'A vendor feed'},{scenario:'HOLD'}),/Only intact/);
  const tampered=structuredClone(input);tampered.bars[0].volume+=1;
  assert.throws(()=>appendSyntheticSession(tampered,{scenario:'HOLD'}),/Only intact/);
  assert.throws(()=>appendSyntheticSession(input,{scenario:'TARGET'}),/paper observation/);
  assert.throws(()=>appendSyntheticSession(input,{scenario:'NOT_A_SCENARIO'}),/Unsupported/);
});
test('one local synthetic endpoint step updates all four preserved legacy tickets, not the simulator',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-paper-step-'));
  const port=48600+Math.floor(Math.random()*1000),base='http://127.0.0.1:'+port;
  let server;
  try{
    await seedWorkstationDemo({dataDir:dir});
    const workstation=new WorkstationStore(join(dir,'workstation.json'));
    const paper=new PaperStore(join(dir,'paper.json'));
    server=await createApp({port,store:paper,workstationStore:workstation,
      marketFetcher:async({symbol})=>JSON.parse(await readFile(join(dir,symbol+'.json'),'utf8'))});
    await new Promise((resolve,reject)=>server.once('error',reject).listen(port,'127.0.0.1',resolve));
    const request=async(path,body,origin=base)=>{
      const response=await fetch(base+path,{method:'POST',headers:{
        Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
      return {status:response.status,body:await response.json()};
    };
    const refreshed=await request('/api/workstation/refresh',{});
    assert.equal(refreshed.status,200);
    assert.equal(refreshed.body.lastScans.SIM09.classification,'PAPER_SETUP_STRONG');
    const startDate=refreshed.body.lastScans.SIM09.asOf;
    const one=await request('/api/workstation/tickets',{symbol:'SIM09',paperUnits:1});
    assert.equal(one.status,200);
    const duplicate=await request('/api/workstation/tickets',{symbol:'SIM09',paperUnits:1});
    assert.equal(duplicate.status,409);
    // Persist a legacy case like the user's existing four same-session records.
    await workstation.mutate(state=>{
      const original=state.tickets[0];
      for(let i=2;i<=4;i++)state.tickets.unshift({...structuredClone(original),
        id:'P9-'+String(i).padStart(4,'0')});
      return state;
    });
    const previewPage=await fetch(base+'/workstation.html');
    assert.equal(previewPage.status,200);
    const html=await previewPage.text();
    assert.match(html,/id="demo-advance"/);
    assert.match(html,/id="demo-scenario"/);
    assert.match(html,/invented session/i);
    const beforePaper=await readFile(join(dir,'paper.json'),'utf8');
    const beforeBars=JSON.parse(await readFile(join(dir,'SIM09.json'),'utf8')).bars;
    const invalid=await request('/api/workstation/demo/advance',{
      symbol:'AAPL',scenario:'HOLD',expectedAsOf:startDate
    });
    assert.equal(invalid.status,400);
    const wrongOrigin=await request('/api/workstation/demo/advance',{
      symbol:'SIM09',scenario:'HOLD',expectedAsOf:startDate
    },'http://evil.invalid');
    assert.equal(wrongOrigin.status,403);
    const hold=await request('/api/workstation/demo/advance',{
      symbol:'SIM09',scenario:'HOLD',expectedAsOf:startDate
    });
    assert.equal(hold.status,200,JSON.stringify(hold.body));
    assert.equal(hold.body.syntheticStep.previousSession,startDate);
    assert.equal(hold.body.syntheticStep.session,'2026-02-17');
    assert.equal(hold.body.syntheticStep.realOrdersCreated,0);
    assert.equal(hold.body.syntheticStep.paperTicketsCreated,0);
    assert.equal(hold.body.alerts.length,0);
    assert.equal(hold.body.tickets.length,4);
    assert.ok(hold.body.tickets.every(t=>t.outcome.observedThrough==='2026-02-17'));
    assert.ok(hold.body.tickets.every(t=>t.outcome.status==='OPEN_PAPER_OBSERVATION'));
    const afterHoldFile=await readFile(join(dir,'SIM09.json'),'utf8');
    const repeat=await request('/api/workstation/demo/advance',{
      symbol:'SIM09',scenario:'HOLD',expectedAsOf:startDate
    });
    assert.equal(repeat.status,409);
    assert.equal(await readFile(join(dir,'SIM09.json'),'utf8'),afterHoldFile);

    const target=await request('/api/workstation/demo/advance',{
      symbol:'SIM09',scenario:'TARGET',expectedAsOf:'2026-02-17'
    });
    assert.equal(target.status,200,JSON.stringify(target.body));
    assert.equal(target.body.lastScans.SIM09.asOf,'2026-02-18');
    assert.equal(target.body.tickets.length,4);
    assert.equal(target.body.syntheticStep.ticketsStillOpen,0);
    assert.ok(target.body.tickets.every(t=>t.outcome.status==='TARGET_REFERENCE_TOUCHED'));
    assert.ok(target.body.tickets.every(t=>t.outcome.paperPnl>0));
    assert.equal(target.body.alerts.length,0);
    const finalBars=JSON.parse(await readFile(join(dir,'SIM09.json'),'utf8')).bars;
    assert.equal(finalBars.length,beforeBars.length+2);
    assert.deepEqual(finalBars.slice(0,beforeBars.length),beforeBars);
    assert.equal(await readFile(join(dir,'paper.json'),'utf8'),beforePaper);
    assert.equal((await fetch(base+'/api/broker/orders')).status,404);
    const reread=await request('/api/workstation/refresh',{});
    assert.equal(reread.status,200);
    assert.equal(reread.body.tickets.length,4);
    assert.ok(reread.body.tickets.every(t=>t.outcome.status==='TARGET_REFERENCE_TOUCHED'));
    const restored=new WorkstationStore(join(dir,'workstation.json'));await restored.init();
    assert.equal(restored.snapshot().tickets.length,4);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});
test('reject invalid synthetic file without mutating prior history or workstation',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-step-reject-'));
  try{
    await seedWorkstationDemo({dataDir:dir});
    const store=new WorkstationStore(join(dir,'workstation.json'));await store.init();
    const original=buildDemoDataset('SIM09');
    await store.applyRefresh([{dataset:original,evaluation:evaluateSwingSetup(original)}],
      {refreshedAt:'2026-11-13T00:00:00.000Z'});
    const bad={...original,source:'Different market source'};
    const file=join(dir,'SIM09.json');
    await writeFile(file,JSON.stringify(bad));
    const saved=await readFile(file,'utf8'),old=store.snapshot();
    await assert.rejects(()=>advanceSyntheticPaperSession({
      workstation:store,dataDir:dir,symbol:'SIM09',scenario:'HOLD',
      expectedAsOf:original.sourceAsOf
    }),/Only intact/);
    assert.equal(await readFile(file,'utf8'),saved);
    assert.deepEqual(store.snapshot(),old);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('concurrent same-session requests append at most one bar',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-step-race-'));
  try{
    await seedWorkstationDemo({dataDir:dir});
    const store=new WorkstationStore(join(dir,'workstation.json'));await store.init();
    const fixture=buildDemoDataset('SIM09');
    await store.applyRefresh([{dataset:fixture,evaluation:evaluateSwingSetup(fixture)}],
      {refreshedAt:'2026-11-13T00:00:00.000Z'});
    const args={workstation:store,dataDir:dir,symbol:'SIM09',scenario:'HOLD',
      expectedAsOf:fixture.sourceAsOf};
    const results=await Promise.allSettled([
      advanceSyntheticPaperSession(args),advanceSyntheticPaperSession(args)
    ]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const saved=JSON.parse(await readFile(join(dir,'SIM09.json'),'utf8'));
    assert.equal(saved.bars.length,fixture.bars.length+1);
    assert.equal(store.snapshot().lastScans.SIM09.asOf,saved.sourceAsOf);
  }finally{await rm(dir,{recursive:true,force:true});}
});
