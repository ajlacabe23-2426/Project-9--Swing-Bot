import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {seedWorkstationDemo,buildDemoDataset} from '../scripts/seed-workstation-demo.mjs';
import {parseMissionArgs,runStarNetMission} from '../scripts/starnet-crew-mission.mjs';

const asOf='2026-02-16';
test('StarNet mission option parsing rejects malformed dates, duplicate flags and unsafe symbols',()=>{
  assert.deepEqual(parseMissionArgs(['--as-of',asOf,'--demo','--paper-auto']).symbols,['SIM09','SIM10']);
  assert.throws(()=>parseMissionArgs(['--as-of','2026-02-31']),/valid --as-of/);
  assert.throws(()=>parseMissionArgs(['--as-of',asOf,'--symbols','../secrets']),/symbols/);
  assert.throws(()=>parseMissionArgs(['--as-of',asOf,'--symbols','SIM09,SIM09']),/symbols/);
  assert.throws(()=>parseMissionArgs(['--as-of',asOf,'--paper-auto','--paper-auto']),/Repeated option/);
});
test('complete StarNet mission writes reproducible local research evidence without market or broker calls',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-starnet-research-'));
  try{
    await seedWorkstationDemo({dataDir:dir});
    const output=await runStarNetMission({
      asOf,dataDir:dir,demo:true,now:new Date('2026-11-08T18:00:00Z')
    });
    assert.equal(output.summary.inputDatasetCount,2);
    assert.equal(output.summary.virtualTicketsCreated,0);
    assert.equal(output.paperActions.length,0);
    assert.equal(output.realOrdersCreated,false);
    const md=await readFile(output.deliverables.markdown,'utf8');
    const json=JSON.parse(await readFile(output.deliverables.json,'utf8'));
    assert.match(md,/SIM09/);
    assert.match(md,/Synthetic demonstrations do not represent real price performance/);
    assert.equal(json.audit.datasetCount,2);
    assert.equal(json.regimes.datasetCount,2);
    assert.equal(json.paperForward.datasetCount,2);
    assert.equal(json.operations.paperCycle,false);
    assert.equal(json.guardrails.executionAllowed,false);
    assert.match(output.deliverables.json,/\.data\/starnet\/latest\.json$/);
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});
test('explicit paper opt-in invokes existing operator and records its returned evidence',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-starnet-cycle-'));
  try{
    await seedWorkstationDemo({dataDir:dir});
    let called=0;
    const result=await runStarNetMission({
      asOf,dataDir:dir,demo:true,paperAuto:true,
      now:new Date('2026-11-08T18:00:00Z'),port:4179,
      cycleRunner:async options=>{
        called++;
        assert.equal(options.autoPaper,true);
        assert.equal(options.allowSyntheticDemo,true);
        return {mutations:{virtualTicketsCreated:1},refreshErrors:[],
          actions:[{symbol:'SIM09',status:'PAPER_TICKET_CREATED',ticketId:'P9-0001'}]};
      }
    });
    assert.equal(called,1);
    assert.equal(result.summary.virtualTicketsCreated,1);
    assert.equal(result.paperActions[0].ticketId,'P9-0001');
    const contents=JSON.parse(await readFile(result.deliverables.json,'utf8'));
    assert.equal(contents.operations.paperCycle,true);
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});
test('invalid synthetic label fails closed before any paper cycle or report',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-starnet-invalid-'));
  try{
    await seedWorkstationDemo({dataDir:dir});
    const invalid=buildDemoDataset('SIM09');
    invalid.source='Unverified external data';
    await writeFile(join(dir,'SIM09.json'),JSON.stringify(invalid));
    let called=0;
    await assert.rejects(()=>runStarNetMission({
      asOf,dataDir:dir,demo:true,paperAuto:true,
      cycleRunner:async()=>{called++;return {};}}),/labeled synthetic datasets only/);
    assert.equal(called,0);
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});
