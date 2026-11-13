import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildDemoDataset} from '../scripts/seed-workstation-demo.mjs';
import {buildSyntheticAlertPreview,inspectSyntheticAlert} from '../src/synthetic-alert-preview.mjs';
import {createApp} from '../server.mjs';
import {PaperStore} from '../src/store.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('demo outputs trigger, no-trigger, rejected source date and no notification promotion',()=>{
  const report=buildSyntheticAlertPreview();
  assert.equal(report.schema,'project9-synthetic-alert-preview-v1');
  assert.deepEqual(report.counts,{triggeredExamples:1,noTriggerExamples:1,
    blockedExamples:1,actualNotificationsSent:0,ordersPlaced:0});
  assert.deepEqual(report.scenarios.map(s=>s.status),[
    'DEMO_RULE_TRIGGERED','DEMO_NO_RULE_TRIGGER','BLOCKED_INVALID_REVIEW_DATE'
  ]);
  assert.deepEqual(report.scenarios.map(s=>s.ruleTriggered),[true,false,null]);
  assert.deepEqual(report.scenarios[0].checks,{closeAboveSma50:true,closeAbovePrevious20High:true});
  assert.equal(report.scenarios[2].checks,null);
  assert.ok(report.scenarios[2].reasons.includes('REVIEW_DATE_AFTER_SOURCE_AS_OF_OR_INVALID'));
  for(const item of report.scenarios){
    assert.equal(item.notificationEligibility,'DENIED_UNVERIFIED_SYNTHETIC');
    assert.equal(item.realMarketNotificationAllowed,false);
    assert.equal(item.externalNotificationsSent,0);
    assert.equal(item.paperTicketsCreated,0);
    assert.equal(item.brokerConnected,false);
    assert.equal(item.realOrdersCreated,0);
  }
});
test('preview is deterministic, binds to the original fixture bytes and contains no current-data claims',()=>{
  const once=buildSyntheticAlertPreview(),twice=buildSyntheticAlertPreview();
  assert.deepEqual(once,twice);
  assert.equal(once.authenticMarketData,false);
  assert.equal(once.notificationDeliveryEnabled,false);
  assert.equal(once.noStateMutation,true);
  assert.equal(once.scenarios[0].inputSha256,
    hash(JSON.stringify(buildDemoDataset('SIM09'))));
  assert.equal(once.scenarios[1].inputSha256,
    hash(JSON.stringify(buildDemoDataset('SIM10'))));
  assert.equal(once.scenarios[0].signalDate,once.scenarios[0].sourceAsOf);
});
test('no renamed real provider dataset can enter the synthetic preview',()=>{
  const changed=buildDemoDataset('SIM09');
  changed.source='Market provider original';
  assert.throws(()=>inspectSyntheticAlert(changed,{scenarioId:'fake'}),/only built-in/);
  changed.source='Project 9 ENGINEERED SYNTHETIC DEMO - NOT REAL MARKET DATA';
  changed.symbol='NVDA';
  assert.throws(()=>inspectSyntheticAlert(changed,{scenarioId:'fake'}),/only built-in/);
});
test('read-only preview endpoint never calls market fetch or mutates workstation or paper JSON',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-preview-api-'));
  const store=new PaperStore(join(dir,'paper.json'));
  const port=48500+Math.floor(Math.random()*1200);
  let app;
  let fetchCount=0;
  try{
    app=await createApp({port,store,marketFetcher:async()=>{fetchCount++;throw new Error('Should not fetch market');}});
    await new Promise((resolve,reject)=>app.once('error',reject).listen(port,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+port;
    const firstState=await readFile(join(dir,'paper.json'),'utf8');
    const firstWorkstation=await readFile(join(dir,'workstation.json'),'utf8');
    const a=await fetch(base+'/api/alerts/preview');
    const b=await fetch(base+'/api/alerts/preview');
    assert.equal(a.status,200);assert.equal(b.status,200);
    assert.equal(a.headers.get('cache-control'),'no-store');
    assert.deepEqual(await a.json(),await b.json());
    const html=await fetch(base+'/alert-preview.html');
    assert.equal(html.status,200);
    assert.match(await html.text(),/Alert research/);
    const invalid=await fetch(base+'/api/alerts/preview?untrusted=1');
    assert.equal(invalid.status,400);
    const post=await fetch(base+'/api/alerts/preview',{method:'POST',headers:{
      'Content-Type':'application/json',Origin:base},body:'{}'});
    assert.equal(post.status,404);
    assert.equal(fetchCount,0);
    assert.equal(await readFile(join(dir,'paper.json'),'utf8'),firstState);
    assert.equal(await readFile(join(dir,'workstation.json'),'utf8'),firstWorkstation);
  }finally{
    if(app)await new Promise(resolve=>app.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});

test('the documented offline CLI prints the same deterministic report and rejects extra args',()=>{
  const json=execFileSync(process.execPath,['scripts/preview-alerts.mjs'],{encoding:'utf8'});
  assert.deepEqual(JSON.parse(json),buildSyntheticAlertPreview());
  const extra=spawnSync(process.execPath,['scripts/preview-alerts.mjs','unexpected'],{encoding:'utf8'});
  assert.equal(extra.status,2);
  assert.match(extra.stderr,/no arguments/);
});
