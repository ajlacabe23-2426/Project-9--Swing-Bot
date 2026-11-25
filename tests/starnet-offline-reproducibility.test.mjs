import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  buildStarNetResearchReproducibility,
  verifyStarNetResearchReproducibility
} from '../src/starnet-offline-reproducibility.mjs';
import {engineered} from '../scripts/starnet-three-level-evidence.mjs';
import {runStarNetResearchReproduction} from '../scripts/starnet-reproduce-research.mjs';

const CLI=fileURLToPath(new URL('../scripts/starnet-reproduce-research.mjs',import.meta.url));
const hash=x=>createHash('sha256').update(x).digest('hex');
const SHA='a'.repeat(64);
const demo=()=>{const f=engineered();return {
  marketBytes:f.bytes,witnessMarketBytes:f.witnessBytes,
  manifestBytes:f.manifestBytes,asOf:f.asOf,
  sourceKind:'ENGINEERED_OFFLINE_FIXTURE',methodologySha256:SHA
};};
const fake=()=>buildStarNetResearchReproducibility(demo());
const child=args=>spawnSync(process.execPath,[CLI,...args],{
  encoding:'utf8',timeout:30_000,maxBuffer:2_000_000
});

test('reproducibility bundle binds all three invented source files and frozen research, without embedding inputs',()=>{
  const x=demo(),r=buildStarNetResearchReproducibility(x);
  assert.equal(r.schema,'project9-offline-research-reproducibility-v1');
  assert.equal(r.asOf,x.asOf);
  assert.equal(r.inputs.historicalDataSha256,hash(x.marketBytes));
  assert.equal(r.inputs.witnessSha256,hash(x.witnessMarketBytes));
  assert.equal(r.inputs.custodyManifestSha256,hash(x.manifestBytes));
  assert.equal(r.inputs.historicalDataBytes,x.marketBytes.length);
  assert.equal(r.inputs.originalInputsEmbedded,false);
  assert.equal(r.inputs.originalInputFilesMustBeRetained,true);
  assert.equal(r.methodology.localSourceCodeSha256,SHA);
  assert.match(r.resultIdentity.resultSha256,/^[a-f0-9]{64}$/);
  assert.match(r.bundleSha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(r.resultIdentity.descriptive.chronologicalPhases.map(p=>p.completedBars),[70,35,36]);
  assert.equal(r.resultIdentity.descriptive.crossSourceStatus,'DISCREPANCIES_REQUIRE_MANUAL_REVIEW');
  assert.equal(r.resultIdentity.descriptive.custodyStatus,'REVIEW_REQUIRED');
  assert.equal(r.resultIdentity.descriptive.predictiveOutOfSampleEfficacyEstablished,false);
  assert.equal(r.evidenceGaps.independentThirdPartyReproduction,'NOT_PERFORMED');
  assert.equal(r.release.productionGate,'NO_GO');
  assert.equal(r.release.realOrdersCreated,0);
  assert.equal(r.release.blockchainTransactionsBroadcast,0);
  assert.equal(r.release.externalCalls,0);
  assert.equal(r.release.liveTradingEnabled,false);
  assert.doesNotMatch(JSON.stringify(r),/PROJECT9 ENGINEERED SYNTHETIC HISTORY/);
});

test('same invented input/code reproduces bit-for-bit; exact replay only verifies LOCAL inputs',()=>{
  const x=demo(),r=buildStarNetResearchReproducibility(x);
  assert.deepEqual(buildStarNetResearchReproducibility(x),r);
  const verified=verifyStarNetResearchReproducibility(r,x);
  assert.equal(verified.finding,'EXACT_LOCAL_REPRODUCTION');
  assert.equal(verified.bundleSha256,r.bundleSha256);
  assert.equal(verified.resultSha256,r.resultIdentity.resultSha256);
  assert.equal(verified.originalInputFilesRechecked,true);
  assert.equal(verified.methodologyBytesRechecked,true);
  assert.equal(verified.independentMarketAuthenticityVerified,false);
  assert.equal(verified.independentStatisticalValidityVerified,false);
  assert.equal(verified.productionGate,'NO_GO');
});

test('replay detects tampered original historical bytes, witness, manifest, and methodology fingerprint',()=>{
  const x=demo(),r=buildStarNetResearchReproducibility(x);
  const variants=[
    {...x,marketBytes:Buffer.from(x.marketBytes.toString('utf8')+'\n')},
    {...x,witnessMarketBytes:Buffer.from(x.witnessMarketBytes.toString('utf8')+'\n')},
    {...x,manifestBytes:Buffer.from(x.manifestBytes.toString('utf8')+'\n')},
    {...x,methodologySha256:'b'.repeat(64)}
  ];
  for(const input of variants){
    assert.throws(()=>verifyStarNetResearchReproducibility(r,input),
      /refused/);
  }
  assert.equal(verifyStarNetResearchReproducibility(r,x).finding,'EXACT_LOCAL_REPRODUCTION');
});

test('tampered result, forged safety fields, missing files and recomputed fake body checksum fail closed',()=>{
  const x=demo(),r=fake();
  for(const change of [
    z=>{z.release.productionGate='GO';},
    z=>{z.evidenceGaps.pointInTimeMarketDataAvailability='VERIFIED';},
    z=>{z.resultIdentity.descriptive.chronologicalPhases[2].strategyClosedWindows=1000;},
    z=>{z.resultIdentity.resultSha256='0'.repeat(64);},
    z=>{z.inputs.historicalDataSha256='0'.repeat(64);},
    z=>{z.methodology.localSourceCodeSha256='c'.repeat(64);}
  ]){
    const bad=structuredClone(r);change(bad);
    assert.throws(()=>verifyStarNetResearchReproducibility(bad,x),/refused/);
  }
  const forged=structuredClone(r);
  forged.resultIdentity.descriptive.chronologicalPhases[2].strategyClosedWindows=123;
  const {bundleSha256,...body}=forged;
  forged.bundleSha256=hash(Buffer.from(JSON.stringify(body)));
  assert.throws(()=>verifyStarNetResearchReproducibility(forged,x),/refused/);
  assert.throws(()=>verifyStarNetResearchReproducibility(r,{
    ...x,marketBytes:null
  }),/refused/);
  assert.throws(()=>buildStarNetResearchReproducibility({
    ...x,sourceKind:'REAL_BROKER'
  }),/refused/);
  assert.throws(()=>buildStarNetResearchReproducibility({
    ...x,asOf:'2026-02-30'
  }),/refused/);
});

test('two independent Node CLI processes yield identical record bytes, and third process replays it',async()=>{
  const one=child(['--demo']),two=child(['--demo']);
  assert.equal(one.status,0,one.stderr);
  assert.equal(two.status,0,two.stderr);
  assert.equal(one.stdout,two.stdout);
  const record=JSON.parse(one.stdout);
  assert.equal(record.sourceKind,'ENGINEERED_OFFLINE_FIXTURE');
  assert.equal(record.release.productionGate,'NO_GO');
  const dir=await mkdtemp(join(tmpdir(),'p9-repro-lab-'));
  try{
    const path=join(dir,'study.json');
    await writeFile(path,one.stdout);
    const verified=child(['--verify-record',path,'--demo']);
    assert.equal(verified.status,0,verified.stderr);
    assert.equal(JSON.parse(verified.stdout).finding,'EXACT_LOCAL_REPRODUCTION');
    assert.deepEqual(await readFile(path,'utf8'),one.stdout);
    const corrupted=JSON.parse(one.stdout);
    corrupted.resultIdentity.descriptive.chronologicalPhases[0].completedBars=999;
    await writeFile(path,JSON.stringify(corrupted));
    const denied=child(['--verify-record',path,'--demo']);
    assert.notEqual(denied.status,0);
    assert.match(denied.stderr,/refused/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('local historical JSON is not modified; changing its bytes requires new evidence record',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-repro-lab-'));
  try{
    const fixture=engineered(),market=join(dir,'market.json'),witness=join(dir,'witness.json'),record=join(dir,'record.json');
    await writeFile(market,fixture.bytes);await writeFile(witness,fixture.witnessBytes);
    const args=['--as-of',fixture.asOf,market,'--compare',witness];
    const r=await runStarNetResearchReproduction(args);
    assert.equal(r.sourceKind,'USER_SUPPLIED_UNVERIFIED_JSON');
    assert.equal(r.inputs.custodyManifestSha256,null);
    assert.equal(r.resultIdentity.descriptive.crossSourceStatus,'DISCREPANCIES_REQUIRE_MANUAL_REVIEW');
    await writeFile(record,JSON.stringify(r));
    const verified=await runStarNetResearchReproduction(['--verify-record',record,...args]);
    assert.equal(verified.finding,'EXACT_LOCAL_REPRODUCTION');
    assert.deepEqual(await readFile(market),fixture.bytes);
    assert.deepEqual(await readFile(witness),fixture.witnessBytes);
    await writeFile(witness,Buffer.from(fixture.witnessBytes.toString('utf8')+'\n'));
    await assert.rejects(runStarNetResearchReproduction(['--verify-record',record,...args]),/refused/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('no live mode, external accounts or arbitrary CLI fields can enter offline reproduction',async()=>{
  for(const args of [
    [],['--live'],['--demo','--markdown'],['--demo','--broker'],
    ['--verify-record','--live','--demo'],
    ['--verify-record','record.json','--live'],
    ['--as-of','2026-02-30','historical.json'],
    ['--as-of','2026-01-01','historical.json','--broker']
  ])await assert.rejects(runStarNetResearchReproduction(args));
});
