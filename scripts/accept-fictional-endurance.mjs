/**
 * Multi-process endurance acceptance for fabricated offline StarNet.
 *
 * Creates ONE private disposable OS temp lab, runs staged child processes,
 * deliberately SIGKILLs only its own idle child and verifies replay of the
 * hash-chained fictional journal. Never touches workstation .data, providers,
 * accounts, wallets, networks, live trading or real assets.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {openFictionalExecutionJournal} from '../src/starnet-fictional-execution-journal.mjs';

const worker=fileURLToPath(new URL('./starnet-fictional-endurance-worker.mjs',import.meta.url));
const START_TIMEOUT_MS=60_000;
const fail=reason=>{throw new Error('Fictional endurance acceptance: '+reason);};
const spawnStage=(stage,dir)=>spawn(process.execPath,
  [worker,'--stage',stage,'--lab',dir],
  {stdio:['ignore','pipe','pipe'],env:{...process.env}});

async function invokeStage(stage,dir){
  const child=spawnStage(stage,dir);
  let out='',err='';
  child.stdout.on('data',data=>{out+=data;});
  child.stderr.on('data',data=>{err+=data;});
  return await new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(error,value)=>{
      if(settled)return; settled=true;clearTimeout(timeout);
      if(error)reject(error); else resolve(value);
    };
    const timeout=setTimeout(()=>{
      child.kill('SIGKILL');
      finish(new Error('Fictional '+stage+' exceeded bounded child-process runtime'));
    },START_TIMEOUT_MS);
    child.on('error',error=>finish(error));
    child.on('exit',(code,signal)=>{
      if(code!==0)return finish(new Error('Fictional '+stage+' exited '+code+' '+signal+': '+err.slice(0,3000)));
      try{finish(null,JSON.parse(out.trim()));}
      catch(error){finish(error);}
    });
  });
}

async function killOwnedIdleChild(dir){
  const child=spawnStage('hold-lock',dir);
  let stdout='',stderr='';
  child.stdout.on('data',b=>{stdout+=b;});
  child.stderr.on('data',b=>{stderr+=b;});
  let ready=false;
  try{
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Idle child fixture readiness timeout')),START_TIMEOUT_MS);
      const onData=()=>{
        if(stdout.includes('READY')){
          ready=true;clearTimeout(timeout);resolve();
        }
      };
      child.stdout.on('data',onData);
      child.once('error',e=>{clearTimeout(timeout);reject(e);});
      child.once('exit',(code,signal)=>{
        if(!ready){clearTimeout(timeout);reject(new Error('Premature child exit '+code+' '+signal+' '+stderr));}
      });
      onData();
    });
    const lockPath=join(dir,'.writer.lock');
    const lock=JSON.parse(await readFile(lockPath,'utf8'));
    assert.equal(lock.schema,'fictional-lab-lock-v1');
    assert.equal(lock.pid,child.pid);
    assert.match(lock.lockId,/^[\da-f-]{36}$/i);
    await assert.rejects(openFictionalExecutionJournal(dir),
      error=>error?.code==='EEXIST');
    const exited=new Promise((resolve,reject)=>{
      child.once('exit',resolve);
      child.once('error',reject);
    });
    if(!child.kill('SIGKILL'))fail('Only fixture child was expected to be alive');
    await exited;
    assert.equal(child.signalCode,'SIGKILL');
    // Deliberate owner-only recovery: a known child PID terminated, lock ID
    // and PID matched, and original OS-temp directory belongs to this test.
    // This must NEVER be used on an unknown or actual workstation lock.
    const stillOwned=JSON.parse(await readFile(lockPath,'utf8'));
    assert.equal(stillOwned.pid,child.pid);
    assert.equal(stillOwned.lockId,lock.lockId);
    await rm(lockPath);
    return {childWasSeparateProcess:true,childSignal:'SIGKILL',
      existingLockNotStolen:true,knownFixtureLockReviewed:true};
  }finally{
    if(child.exitCode===null&&child.signalCode===null){
      const exited=new Promise(resolve=>child.once('exit',resolve));
      child.kill('SIGKILL');await exited;
    }
  }
}

function compareCheckpoint(actual,expected,label){
  for(const key of ['revision','headHash','diskChecksum','fictionalCashTicks',
    'reservedTicks','decisions','events','messages','reviews','stop',
    'equityUnits','tokenUnits','productionGate','externalCalls','realOrdersCreated']){
    assert.deepEqual(actual[key],expected[key],label+': '+key+' changed on read-only restart');
  }
}
export async function acceptFictionalEndurance(args){
  if(!Array.isArray(args)||args.length!==1||args[0]!=='--demo')
    throw new TypeError('Usage: npm run accept:fictional-endurance -- --demo (offline research only)');
  const dir=await mkdtemp(join(tmpdir(),'p9-execution-lab-'));
  try{
    const initialized=await invokeStage('init',dir);
    const firstRead=await invokeStage('verify',dir);
    compareCheckpoint(firstRead,initialized,'initial');
    const buys=await invokeStage('buys',dir);
    const beforeCrash=await invokeStage('verify',dir);
    compareCheckpoint(beforeCrash,buys,'buy-stage');
    const crash=await killOwnedIdleChild(dir);
    const afterCrash=await invokeStage('verify',dir);
    compareCheckpoint(afterCrash,beforeCrash,'SIGKILL');
    const final=await invokeStage('sells-stop',dir);
    const afterStop=await invokeStage('verify',dir);
    const secondAfterStop=await invokeStage('verify',dir);
    compareCheckpoint(afterStop,final,'first stop read');
    compareCheckpoint(secondAfterStop,final,'second stop read');
    assert.equal(final.productionGate,'NO_GO');
    assert.equal(final.decisions,25);
    assert.equal(final.events,48);
    assert.equal(final.messages,48);
    assert.equal(final.reviews,1);
    assert.equal(final.revision,76);
    assert.equal(final.fictionalCashTicks,118000);
    assert.equal(final.reservedTicks,0);
    assert.equal(final.stop,'STOPPED_LATCHED');
    assert.equal(final.equityUnits,18);
    assert.equal(final.tokenUnits,0);
    assert.equal(final.realOrdersCreated,0);
    assert.equal(final.externalCalls,0);
    return Object.freeze({
      schema:'project9-fictional-endurance-acceptance-v1',
      scope:'ENGINEERED_FICTIONAL_OFFLINE',
      softwareGate:'PASS',productionGate:'NO_GO',
      checks:Object.freeze({
        multiProcessScenarioReplays:true,
        initialReadByteStable:true,
        simultaneousCashAndHoldingsReservations:true,
        quarantineAndExplicitRelease:true,
        deterministicPartialFillsAndCancellations:true,
        SIGKILLIdleProcessCrash:true,
        staleWriterLockNotAutoStolen:true,
        ownerReviewedDisposableLock:true,
        unchangedStateAfterCrash:true,
        independentLedgerRecalculatedInEveryChild:true,
        immutableStopAcrossRestarts:true,
        finalRepeatedReadsIdentical:true,
        observedRealProviderExecutions:false,
        macOperatorAcceptance:'NOT_RUN',
        realOrdersCreated:0,blockchainBroadcasts:0,externalCalls:0
      }),
      recordedDecisions:final.decisions,fictionalEvents:final.events,
      messageReceipts:final.messages,
      reviewDecisions:final.reviews,
      finalRevision:final.revision,
      finalJournalHeadHash:final.headHash,
      finalJournalDiskChecksum:final.diskChecksum,
      simulatedCashTicks:final.fictionalCashTicks,
      simulatedEquityUnits:final.equityUnits,
      simulatedTokenUnits:final.tokenUnits,
      stopState:final.stop,
      childTermination:crash.childSignal,
      note:'All inputs and receipts are local invented fixtures; this does not authenticate broker fills, actual holdings or blockchain settlement.'
    });
  }finally{await rm(dir,{recursive:true,force:true});}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{process.stdout.write(JSON.stringify(
    await acceptFictionalEndurance(process.argv.slice(2)),null,2)+'\n');}
  catch(error){process.stderr.write((error.stack??error.message)+'\n');process.exitCode=1;}
}
