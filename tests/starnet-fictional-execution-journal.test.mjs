import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {openFictionalExecutionJournal} from '../src/starnet-fictional-execution-journal.mjs';

const M='MISSING';
function descriptor(token=false) {
  return {
    schema:'project9-market-rail-descriptor-v1',scope:'FICTIONAL_OFFLINE',
    rail:token?'TOKENIZED_SECURITY':'LISTED_EQUITY',
    instrumentId:token?'SIM-TOKEN-ONE':'SIM-EQUITY-ONE',
    referenceInstrument:token?'SIM-EQUITY-ONE':null,
    declaredEvidence:token?{
      issuerAndLegalForm:M,underlyingRights:M,custodyOrBacking:M,
      networkAndGovernance:M,transferRestrictions:M,
      redemptionAndReconciliation:M,dataRights:M
    }:{
      listingIdentity:M,dataRights:M,exchangeCalendar:M,
      corporateActions:M,custodyAndOwnership:M
    }
  };
}
const intent=(id='SIM-ORDER-STOCK',token=false)=>({
  schema:'project9-sim-order-intent-v1',scope:'FICTIONAL_OFFLINE',
  intentId:id,railDescriptor:descriptor(token),
  side:'BUY',orderType:'LIMIT',units:5,limitPriceTicks:900
});
const event=(id,order,kind,units=0)=>({
  schema:'project9-sim-execution-event-v1',scope:'FICTIONAL_OFFLINE',
  eventId:id,intentId:order,kind,filledUnits:units
});
const fresh=()=>mkdtemp(join(tmpdir(),'p9-execution-lab-'));

test('reopen preserves fictional orders and strictly separates market rails',async()=>{
  const dir=await fresh();
  let journal;
  try {
    journal=await openFictionalExecutionJournal(dir);
    assert.equal((await journal.report()).revision,0);
    await journal.submit(intent());
    await journal.submit(intent('SIM-ORDER-TOKEN',true));
    await journal.recordEvent(event('SIM-EVENT-STOCKACK','SIM-ORDER-STOCK','ACK'));
    await journal.recordEvent(event('SIM-EVENT-STOCKPART','SIM-ORDER-STOCK','FILL',2));
    await journal.recordEvent(event('SIM-EVENT-TOKENACK','SIM-ORDER-TOKEN','ACK'));
    await journal.recordEvent(event('SIM-EVENT-TOKENCANCEL','SIM-ORDER-TOKEN','CANCEL'));
    const before=await journal.report();
    assert.equal(before.revision,6);
    assert.equal(before.records[0].status,'SIMULATED_PARTIAL');
    assert.equal(before.records[1].status,'SIMULATED_CANCELLED');
    assert.equal(before.records[0].safety.realOrdersCreated,0);
    assert.equal(before.records[1].safety.chainTransactionsBroadcast,0);
    assert.equal(before.controls.productionGate,'NO_GO');
    const bytes=await readFile(join(dir,'journal.json'));
    await journal.close();
    journal=await openFictionalExecutionJournal(dir);
    assert.deepEqual(await journal.report(),before);
    assert.deepEqual(await readFile(join(dir,'journal.json')),bytes);
    assert.equal((await journal.get('SIM-ORDER-TOKEN')).referenceInstrument,'SIM-EQUITY-ONE');
    assert.equal(await journal.get('SIM-ORDER-MISSING'),null);
  }finally {
    if(journal) await journal.close().catch(()=>{});
    await rm(dir,{recursive:true,force:true});
  }
});

test('strict idempotency and queued concurrent fictional events persist once',async()=>{
  const dir=await fresh();
  let journal;
  try {
    journal=await openFictionalExecutionJournal(dir);
    const order=intent();
    await journal.submit(order);
    await journal.submit(structuredClone(order));
    const ack=event('SIM-EVENT-ACK','SIM-ORDER-STOCK','ACK');
    const returned=await Promise.all([journal.recordEvent(ack),
      journal.recordEvent(structuredClone(ack))]);
    assert.equal(returned[0].status,'SIMULATED_ACCEPTED');
    assert.equal(returned[1].status,'SIMULATED_ACCEPTED');
    await journal.recordEvent(event('SIM-EVENT-FILLONE','SIM-ORDER-STOCK','FILL',2));
    const bytes=await readFile(join(dir,'journal.json'));
    assert.equal((await journal.report()).revision,3);
    await assert.rejects(journal.recordEvent(event('SIM-EVENT-OVER','SIM-ORDER-STOCK','FILL',5)),/Overfill/);
    await assert.rejects(journal.submit({...order,units:6}),/Conflicting retry/);
    await assert.rejects(journal.recordEvent(event('SIM-EVENT-FILLONE','SIM-ORDER-STOCK','FILL',3)),/Conflicting event/);
    await assert.rejects(journal.submit({...order,apiKey:'never'}),/Exact offline/);
    await assert.rejects(journal.submit({...order,scope:'LIVE'}),/scope/);
    assert.deepEqual(await readFile(join(dir,'journal.json')),bytes);
    await journal.close();
    journal=await openFictionalExecutionJournal(dir);
    assert.equal((await journal.get('SIM-ORDER-STOCK')).filledUnits,2);
    assert.equal((await journal.report()).revision,3);
  }finally {
    if(journal) await journal.close().catch(()=>{});
    await rm(dir,{recursive:true,force:true});
  }
});

test('strict single writer blocks concurrent instances',async()=>{
  const dir=await fresh();
  let first,second;
  try {
    first=await openFictionalExecutionJournal(dir);
    await first.submit(intent());
    await assert.rejects(openFictionalExecutionJournal(dir),/EEXIST/);
    await first.close();first=null;
    second=await openFictionalExecutionJournal(dir);
    assert.equal((await second.report()).revision,1);
  }finally {
    if(first)await first.close().catch(()=>{});
    if(second)await second.close().catch(()=>{});
    await rm(dir,{recursive:true,force:true});
  }
});

test('tampered hash and invalid JSON fail closed without overwriting bytes',async()=>{
  for(const tamper of ['hash','json']) {
    const dir=await fresh();
    let journal;
    try {
      journal=await openFictionalExecutionJournal(dir);
      await journal.submit(intent());
      await journal.close();journal=null;
      const path=join(dir,'journal.json');
      const original=JSON.parse(await readFile(path,'utf8'));
      const broken=tamper==='hash'
        ? JSON.stringify({...original,headHash:'f'.repeat(64)})
        : '{"schema":';
      await writeFile(path,broken);
      const old=await readFile(path);
      await assert.rejects(openFictionalExecutionJournal(dir),/journal|Corrupt/);
      assert.deepEqual(await readFile(path),old);
      await assert.rejects(readFile(join(dir,'.writer.lock'),'utf8'),{code:'ENOENT'});
    }finally {
      if(journal)await journal.close().catch(()=>{});
      await rm(dir,{recursive:true,force:true});
    }
  }
});

test('disallow workstation paths, shared directories, symlink lab and traversal',async()=>{
  const dir=await fresh();
  const link=join(tmpdir(),'p9-execution-lab-SYMLINK' + Date.now());
  try {
    await assert.rejects(openFictionalExecutionJournal(resolve('.data')),/temp|directory|ENOENT|private|real/i);
    await assert.rejects(openFictionalExecutionJournal('/tmp/not-project9-research'),/ENOENT|private|temp/);
    await symlink(dir,link);
    await assert.rejects(openFictionalExecutionJournal(link),/[Pp]rivate real directory/);
    await assert.rejects(openFictionalExecutionJournal(dir+'/..'),/[Pp]rivate real directory|temp folder/);
  }finally {
    await rm(link,{force:true});
    await rm(dir,{recursive:true,force:true});
  }
});

test('SIGKILL leaves stale lock: no silent takeover; disposable fixture replays after inspection',async()=>{
  const dir=await fresh();
  let child,reopened;
  try {
    const moduleUrl=new URL('../src/starnet-fictional-execution-journal.mjs',import.meta.url).href;
    const script=[
      "import {openFictionalExecutionJournal} from '"+moduleUrl+"';",
      "const dir=process.argv[1];",
      "const j=await openFictionalExecutionJournal(dir);",
      "await j.submit("+JSON.stringify(intent())+");",
      "await j.recordEvent({schema:'project9-sim-execution-event-v1',scope:'FICTIONAL_OFFLINE',eventId:'SIM-EVENT-CHILDACK',intentId:'SIM-ORDER-STOCK',kind:'ACK',filledUnits:0});",
      "process.stdout.write('READY\\n');",
      "setInterval(()=>{},1000);"
    ].join('\n');
    child=spawn(process.execPath,['--input-type=module','-e',script,dir],
      {stdio:['ignore','pipe','pipe'],env:{...process.env}});
    const ready=await Promise.race([
      once(child.stdout,'data').then(([chunk])=>chunk.toString()),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('Child startup timed out')),6000))
    ]);
    assert.match(ready,/READY/);
    child.kill('SIGKILL');
    await once(child,'exit');
    assert.match(await readFile(join(dir,'journal.json'),'utf8'),/SIM-ORDER-STOCK/);
    await assert.rejects(openFictionalExecutionJournal(dir),/EEXIST/);
    // Test fixture only, with confirmed dead PID. Never auto-clear a real lock.
    await rm(join(dir,'.writer.lock'));
    reopened=await openFictionalExecutionJournal(dir);
    assert.equal((await reopened.get('SIM-ORDER-STOCK')).status,'SIMULATED_ACCEPTED');
    await assert.rejects(reopened.recordEvent(event('SIM-EVENT-CHILDACK','SIM-ORDER-STOCK','ACK',1)),
      /zero units|Conflicting/);
    assert.equal((await reopened.recordEvent(event('SIM-EVENT-CHILDACK','SIM-ORDER-STOCK','ACK'))).eventCount,1);
    assert.equal((await reopened.report()).revision,2);
  }finally {
    if(child && child.exitCode===null && child.signalCode===null) {
      child.kill('SIGKILL');
      await once(child,'exit').catch(()=>{});
    }
    if(reopened)await reopened.close().catch(()=>{});
    await rm(dir,{recursive:true,force:true});
  }
});
