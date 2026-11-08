import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {launchLocalOperator,parseOperatorOptions} from '../scripts/launch-operator.mjs';
import {runOperationalCycle} from '../scripts/agent-operational-cycle.mjs';

test('launcher enforces explicit paper and demo modes',()=>{
  assert.deepEqual(parseOperatorOptions([]),{demo:false,autoPaper:false});
  assert.deepEqual(parseOperatorOptions(['--paper-auto','--demo']),{
    demo:true,autoPaper:true
  });
  assert.throws(()=>parseOperatorOptions(['--broker']),/Usage/);
  assert.throws(()=>parseOperatorOptions(['--demo','--demo']),/Usage/);
});

test('one command starts real loopback server, writes and preserves synthetic paper tickets',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'project9-agent-launch-'));
  const port=53000+Math.floor(Math.random()*1000);
  let server;
  try{
    // Nonempty provider credentials must never be used in explicit demo mode.
    const started=await launchLocalOperator({
      port,dataDir:dir,demo:true,autoPaper:true,
      now:new Date('2026-11-08T22:00:00Z'),
      apiKey:'must-not-use-in-synthetic-demo'
    });
    server=started.server;
    assert.equal(started.url,'http://127.0.0.1:'+port+'/workstation.html');
    assert.equal(started.report.guardrails.realOrdersCreated,false);
    assert.equal(started.report.refreshErrors.length,0);
    assert.equal(started.report.mode,'EXPLICIT_SYNTHETIC_DEMO');
    assert.ok(started.report.actions.some(action=>action.status==='PAPER_TICKET_CREATED'));

    const response=await fetch(started.url);
    assert.equal(response.status,200);
    assert.match(await response.text(),/workstation/i);

    const state=JSON.parse(await readFile(join(dir,'workstation.json'),'utf8'));
    assert.ok(state.tickets.length>0);
    const savedCount=state.tickets.length;
    const repeat=await runOperationalCycle({
      port,autoPaper:true,allowSyntheticDemo:true,
      now:new Date('2026-11-08T22:00:00Z')
    });
    assert.equal(repeat.mutations.virtualTicketsCreated,0);
    assert.ok(repeat.actions.some(action=>action.status==='ALREADY_TRACKED'));
    const after=JSON.parse(await readFile(join(dir,'workstation.json'),'utf8'));
    assert.equal(after.tickets.length,savedCount);
  }finally{
    if(server?.listening)await new Promise(resolve=>server.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});
