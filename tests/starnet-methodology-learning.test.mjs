import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {engineered} from '../scripts/starnet-three-level-evidence.mjs';
import {generateScenario} from '../src/synthetic-fixtures.mjs';
import {auditChronologicalResearch} from '../src/chronological-research-audit.mjs';
import {
  buildStarNetMethodologyWatch,classifyStarNetPriorContext,
  renderStarNetMethodologyLearningMarkdown
} from '../src/starnet-methodology-learning.mjs';
import {
  runStarNetMethodologyLearningCli,parseMethodologyLearningArgs
} from '../scripts/starnet-learn-methodology.mjs';

const source=()=>engineered();
const report=(fixture=source())=>buildStarNetMethodologyWatch({
  marketBytes:fixture.bytes,asOf:fixture.asOf,
  sourceKind:'ENGINEERED_OFFLINE_FIXTURE'
});
const withBars=bars=>{
  const f=source(),dataset=JSON.parse(f.bytes.toString('utf8'));
  dataset.bars=bars;
  dataset.sourceAsOf=bars.at(-1).date;
  dataset.provenance.retrievedAt=dataset.sourceAsOf+'T00:00:00.000Z';
  return {bytes:Buffer.from(JSON.stringify(dataset)),asOf:dataset.sourceAsOf};
};

test('methodology report separately reveals tiny holdout, observational counts and no prediction proof',()=>{
  const fixture=source(),r=report(fixture);
  assert.equal(r.schema,'project9-offline-methodology-learning-v1');
  assert.equal(r.status,'DESCRIPTIVE_EDUCATION_ONLY');
  assert.equal(r.inputByteSha256,createHash('sha256').update(fixture.bytes).digest('hex'));
  assert.equal(r.sourceKind,'ENGINEERED_OFFLINE_FIXTURE');
  assert.equal(r.sampleReferenceFloor,20);
  assert.equal(r.study.holdoutWindows,1);
  assert.equal(r.phases.length,3);
  assert.deepEqual(r.phases.map(p=>p.completedBars),[70,35,36]);
  assert.ok(r.learningFlags.some(f=>f.code==='THIN_HOLDOUT_SAMPLE'));
  assert.ok(r.learningFlags.some(f=>f.code==='SOURCE_AUTHENTICITY_NOT_VERIFIED'));
  assert.ok(r.learningFlags.some(f=>f.code==='CONTROL_NOT_SIGNAL_MATCHED'));
  assert.ok(r.learningFlags.some(f=>f.code==='DEPENDENCE_AND_MULTIPLE_TESTING_UNASSESSED'));
  assert.equal(r.study.independentPredictionEstablished,false);
  assert.equal(r.study.marketConditionRobustnessEstablished,false);
  assert.equal(r.study.statisticalSignificanceEstablished,false);
  assert.equal(r.safety.noSignalRefittingOrOptimization,true);
  assert.equal(r.safety.everyContextUsesPriorBarsOnly,true);
  assert.equal(r.safety.notPortfolioReturn,true);
  assert.equal(r.safety.realOrdersCreated,0);
  assert.equal(r.safety.externalCalls,0);
  assert.equal(r.safety.productionGate,'NO_GO');
});

test('independently re-evaluated study counts and cost stress are consistent with frozen chronological exercise',()=>{
  const fixture=source(),data=JSON.parse(fixture.bytes.toString('utf8'));
  const study=auditChronologicalResearch(data,{asOf:fixture.asOf}),r=report(fixture);
  assert.deepEqual(r.phases.map(p=>p.strategyWindows),
    study.phases.map(p=>p.strategy.closedHypotheticalObservations));
  assert.deepEqual(r.phases.map(p=>p.periodicControlWindows),
    study.phases.map(p=>p.control.closedHypotheticalObservations));
  for(const p of r.phases){
    const counts=p.priorSignalContextCounts;
    assert.equal(counts.PRIOR_RISING+counts.PRIOR_FALLING+counts.PRIOR_MIXED,p.strategyWindows);
    assert.equal(counts.PRIOR_HIGH_NOISE+counts.PRIOR_LOW_NOISE,p.strategyWindows);
    assert.equal(p.contextRows.length,p.strategyWindows);
    if(p.strategyWindows>0)
      assert.ok(p.hypotheticalCostSensitivity.worseningPercentagePoints>0);
    else
      assert.equal(p.hypotheticalCostSensitivity.worseningPercentagePoints,null);
    assert.equal(p.contextGroupEffectEstablished,false);
    assert.equal(p.scannerVersusControlIsNotMatchedExperiment,true);
    assert.equal(p.statisticalIndependenceVerified,false);
    for(const row of p.contextRows){
      assert.ok(row.latestContextDate<row.signalDate);
      assert.ok(row.trend.startsWith('PRIOR_'));
      assert.ok(row.noise.startsWith('PRIOR_'));
    }
  }
});

test('prior-ten-completed-return context does not use current signal or any later outcome',()=>{
  const original=generateScenario(73,190),idx=85;
  const before=classifyStarNetPriorContext(original,idx);
  const altered=structuredClone(original);
  altered[idx].close=altered[idx].close*12;
  altered[idx+1].close=altered[idx+1].close*4;
  altered[idx+5].close=altered[idx+5].close*9;
  assert.deepEqual(classifyStarNetPriorContext(altered,idx),before);
  const changedPrior=structuredClone(original);
  changedPrior[idx-1].close*=1.09;
  assert.notEqual(classifyStarNetPriorContext(changedPrior,idx).priorTenCloseChangePct,
    before.priorTenCloseChangePct);
  assert.equal(before.latestInputBarIndex,idx-1);
  assert.equal(before.excludesSignalBarAndAllLaterBars,true);
});

test('source-asserted reviewed metadata never becomes independent authenticity or prediction',()=>{
  const fixture=source(),data=JSON.parse(fixture.bytes.toString('utf8'));
  data.provenance.corporateActions='INDEPENDENTLY_REVIEWED';
  data.provenance.survivorship='INDEPENDENTLY_REVIEWED';
  data.provenance.licensing='COMMERCIAL_REDISTRIBUTION_VERIFIED';
  const r=buildStarNetMethodologyWatch({
    marketBytes:Buffer.from(JSON.stringify(data)),
    asOf:fixture.asOf,sourceKind:'USER_SUPPLIED_UNVERIFIED_JSON'
  });
  assert.equal(r.dataQuality.authenticHistoricalDataVerified,false);
  assert.equal(r.dataQuality.corporateActionsIndependentlyVerified,false);
  assert.equal(r.study.independentPredictionEstablished,false);
  assert.equal(r.safety.productionGate,'NO_GO');
});

test('unusual volume and calendar gaps generate review cues, not fabricated external facts',()=>{
  const fixture=source(),data=JSON.parse(fixture.bytes.toString('utf8'));
  data.bars[100].volume=0;
  const r=buildStarNetMethodologyWatch({
    marketBytes:Buffer.from(JSON.stringify(data)),
    asOf:fixture.asOf,sourceKind:'USER_SUPPLIED_UNVERIFIED_JSON'
  });
  assert.ok(r.dataQuality.zeroVolumeBars>=1);
  assert.ok(r.learningFlags.some(f=>f.code==='ZERO_VOLUME_SOURCE_REVIEW'));
  assert.equal(r.dataQuality.authenticHistoricalDataVerified,false);
  assert.equal(r.safety.realOrdersCreated,0);
});

test('malformed market history, unsafe classes, after-cutoff bars and fake claims fail closed',()=>{
  const fixture=source(),dataset=JSON.parse(fixture.bytes.toString('utf8'));
  const badDate='2024-03-01';
  assert.throws(()=>buildStarNetMethodologyWatch({
    marketBytes:fixture.bytes,asOf:badDate,sourceKind:'ENGINEERED_OFFLINE_FIXTURE'
  }),/refused/);
  assert.throws(()=>buildStarNetMethodologyWatch({
    marketBytes:fixture.bytes,asOf:fixture.asOf,sourceKind:'REAL_BROKER'
  }),/refused/);
  const noMore=structuredClone(dataset);
  noMore.bars[80].date=noMore.bars[79].date;
  assert.throws(()=>buildStarNetMethodologyWatch({
    marketBytes:Buffer.from(JSON.stringify(noMore)),
    asOf:fixture.asOf,sourceKind:'USER_SUPPLIED_UNVERIFIED_JSON'
  }),/strictly ascending/);
  const early=withBars(dataset.bars.slice(0,120));
  assert.throws(()=>buildStarNetMethodologyWatch({
    marketBytes:early.bytes,asOf:early.asOf,sourceKind:'ENGINEERED_OFFLINE_FIXTURE'
  }),/90 post-warmup/);
  assert.throws(()=>buildStarNetMethodologyWatch({
    marketBytes:Buffer.from('{not json'),
    asOf:fixture.asOf,sourceKind:'ENGINEERED_OFFLINE_FIXTURE'
  }),/refused/);
  assert.throws(()=>renderStarNetMethodologyLearningMarkdown({
    schema:'project9-offline-methodology-learning-v1',
    safety:{productionGate:'GO'}
  }),/refused/);
});

test('readable learning report identifies warning signs and remains identical across runs',async()=>{
  const json=await runStarNetMethodologyLearningCli(['--demo']);
  const md=await runStarNetMethodologyLearningCli(['--demo','--markdown']);
  assert.equal(json.status,'DESCRIPTIVE_EDUCATION_ONLY');
  assert.match(md,/StarNet Phase 16 — What to Watch For/);
  assert.match(md,/THIN_HOLDOUT_SAMPLE/);
  assert.match(md,/COSTS_AND_LIQUIDITY_ARE_HYPOTHETICAL/);
  assert.match(md,/CONTEXT_GROUPS_ARE_DESCRIPTIVE_ONLY/);
  assert.match(md,/NOT a significance test/);
  assert.match(md,/NO_GO/);
  assert.equal(await runStarNetMethodologyLearningCli(['--demo','--markdown']),md);
  assert.deepEqual(await runStarNetMethodologyLearningCli(['--demo']),json);
});

test('local permitted file CLI is read-only and reports original source byte identity',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-methodology-watch-'));
  try{
    const fixture=source(),path=join(dir,'permitted.json');
    const copy=Buffer.from(fixture.bytes.toString('utf8')+'\n');
    await writeFile(path,copy);
    const out=await runStarNetMethodologyLearningCli(['--as-of',fixture.asOf,path]);
    assert.equal(out.inputByteSha256,createHash('sha256').update(copy).digest('hex'));
    assert.equal(out.sourceKind,'USER_SUPPLIED_UNVERIFIED_JSON');
    assert.equal(out.safety.productionGate,'NO_GO');
    assert.deepEqual(await readFile(path),copy);
    assert.match(await runStarNetMethodologyLearningCli(['--as-of',fixture.asOf,path,'--markdown']),
      /source|SOURCE/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('CLI strictly rejects live, network, broker, extra flags and incomplete dates',async()=>{
  assert.deepEqual(parseMethodologyLearningArgs(['--demo']),{mode:'DEMO',markdown:false});
  for(const args of [
    [],['--live'],['--demo','--broker'],['--demo','--compare','other.json'],
    ['--as-of','2026-02-30','dataset.json'],
    ['--as-of','2026-11-25','--broker'],
    ['--as-of','2026-11-25','file.json','--live']
  ])await assert.rejects(runStarNetMethodologyLearningCli(args));
});
