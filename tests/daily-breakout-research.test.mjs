import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildDemoDataset} from '../scripts/seed-workstation-demo.mjs';
import {analyzeDailyBreakout,BREAKOUT_STRATEGY_ID} from '../src/daily-breakout-research.mjs';
import {inspectDailyBreakoutFiles} from '../scripts/research-daily-breakout.mjs';

test('the same two daily-close conditions classify simulated rising vs falling datasets',()=>{
  const rising=buildDemoDataset('SIM09');
  const falling=buildDemoDataset('SIM10');
  const positive=analyzeDailyBreakout(rising);
  const negative=analyzeDailyBreakout(falling);
  assert.equal(positive.strategy,BREAKOUT_STRATEGY_ID);
  assert.equal(positive.latestSetup.signal,'HISTORICAL_BREAKOUT');
  assert.equal(positive.latestSetup.checks.above50DayAverage,true);
  assert.equal(positive.latestSetup.checks.brokePrior20DayHigh,true);
  assert.equal(negative.latestSetup.signal,'NO_BREAKOUT');
  assert.equal(negative.closedPaperObservations,0);
  assert.equal(negative.positiveOutcomeRatePct,null);
  assert.equal(positive.caveats.realOrdersCreated,false);
  assert.equal(positive.caveats.brokerConnected,false);
  assert.equal(positive.parameters.holdingBars,5);
});

test('all historical entries are after signals and paper windows do not overlap',()=>{
  const data=buildDemoDataset('SIM09');
  const report=analyzeDailyBreakout(data);
  assert.ok(report.closedPaperObservations>1);
  for(let i=0;i<report.outcomes.length;i++){
    const outcome=report.outcomes[i];
    assert.ok(outcome.signalDate<outcome.modeledEntrySession);
    assert.ok(outcome.modeledEntrySession<=outcome.modeledExitSession);
    assert.ok(outcome.modeledExitSession<=report.latestCompletedBar);
    if(i>0)assert.ok(report.outcomes[i-1].modeledExitSession<=outcome.signalDate);
  }
  assert.ok(Number.isFinite(report.positiveOutcomeRatePct));
  assert.ok(report.positiveOutcomeRatePct>=0&&report.positiveOutcomeRatePct<=100);
});

test('strict as-of cutoff prevents future bars changing signals and completed outcomes',()=>{
  const data=buildDemoDataset('SIM09');
  const asOf=data.bars[89].date;
  const before=analyzeDailyBreakout(data,{asOf});
  const changed=structuredClone(data);
  for(let i=90;i<changed.bars.length;i++){
    const b=changed.bars[i];
    b.open*=1.5;b.close*=1.5;b.high*=1.5;b.low*=1.5;b.volume*=2;
  }
  assert.deepEqual(analyzeDailyBreakout(changed,{asOf}),before);
});

test('invalid dates, costs and insufficient history fail closed',()=>{
  const data=buildDemoDataset('SIM09');
  assert.throws(()=>analyzeDailyBreakout(data,{asOf:'2026-02-30'}),/asOf/);
  assert.throws(()=>analyzeDailyBreakout(data,{asOf:'2029-01-01'}),/source-as-of/);
  assert.throws(()=>analyzeDailyBreakout(data,{asOf:data.bars[45].date}),/50 completed bars/);
  assert.throws(()=>analyzeDailyBreakout(data,{holdingBars:0}),/holdingBars/);
  assert.throws(()=>analyzeDailyBreakout(data,{feeBps:-1}),/feeBps/);
  assert.throws(()=>analyzeDailyBreakout(data,{slippageBps:500}),/slippageBps/);
});

test('file-based repeatable scan records byte SHA and rejects duplicate symbol',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-locked-daily-'));
  try{
    const data=buildDemoDataset('SIM09'),path=join(dir,'SIM09.json');
    const text=JSON.stringify(data);
    await writeFile(path,text);
    const report=await inspectDailyBreakoutFiles([path]);
    assert.equal(report.datasetCount,1);
    assert.equal(report.realOrdersCreated,false);
    assert.equal(report.results[0].inputSha256,
      createHash('sha256').update(text).digest('hex'));
    assert.equal(report.results[0].latestSetup.signal,'HISTORICAL_BREAKOUT');
    await assert.rejects(inspectDailyBreakoutFiles([path,path]),/Duplicate market symbol/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
