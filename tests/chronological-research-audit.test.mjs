import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {auditChronologicalResearch,RESEARCH_STRESS_CASES} from '../src/chronological-research-audit.mjs';
import {classifyDailyBreakoutAt} from '../src/daily-breakout-research.mjs';
import {parseTimeSplitArgs,runTimeSplitCli} from '../scripts/research-time-split.mjs';

function fictional({count=190,drift=0.011,symbol='FAKE'}={}){
  const day=new Date('2025-01-01T00:00:00Z'),bars=[];
  let last=100;
  while(bars.length<count){
    day.setUTCDate(day.getUTCDate()+1);
    if([0,6].includes(day.getUTCDay()))continue;
    const open=last,close=Number((last*(1+drift)).toFixed(6));
    const high=Number((Math.max(open,close)+0.24).toFixed(6));
    const low=Number((Math.min(open,close)-0.24).toFixed(6));
    bars.push({date:day.toISOString().slice(0,10),open,high,low,close,volume:100000});
    last=close;
  }
  return {schema:'project9-market-data-v1',symbol,currency:'USD',
    source:'ENGINEERED FICTIONAL TEST DATA',mode:'HISTORICAL',
    sourceAsOf:bars.at(-1).date,priceAdjustment:'RAW',bars};
}

test('locked chronological development/validation/holdout partitions and windows never overlap across phase boundaries',()=>{
  const input=fictional();
  const report=auditChronologicalResearch(input);
  assert.equal(report.schema,'project9-chronological-cost-stress-audit-v1');
  assert.equal(report.strategy,'P9_DAILY_20H_50SMA_V1');
  assert.deepEqual(report.partitions.phaseSizes,[70,35,36]);
  assert.equal(report.phases.length,3);
  assert.equal(report.phases[0].startIndex,49);
  assert.equal(report.phases.at(-1).endIndex,189);
  assert.equal(report.phases[0].endIndex+1,report.phases[1].startIndex);
  assert.equal(report.phases[1].endIndex+1,report.phases[2].startIndex);
  assert.equal(report.safety.holdoutIsDescriptiveOnly,true);
  assert.equal(report.safety.independentOutOfSampleEfficacyEstablished,false);
  assert.equal(report.safety.productionGate,'NO_GO');
  assert.equal(report.safety.realOrdersCreated,0);
  for(const phase of report.phases){
    assert.equal(phase.strategy.strategyId,report.strategy);
    assert.equal(phase.strategy.costSensitivity.length,4);
    assert.ok(phase.control.windows.length>0);
    for(const item of [phase.strategy,phase.control]){
      for(const w of item.windows){
        assert.ok(w.signalIndex>=phase.startIndex);
        assert.ok(w.exitIndex<=phase.endIndex);
        assert.equal(w.entryIndex,w.signalIndex+1);
        assert.equal(w.exitIndex,w.signalIndex+5);
        assert.ok(w.signalDate<w.entryDate);
        assert.ok(w.entryDate<=w.exitDate);
      }
      for(let j=1;j<item.windows.length;j++)
        assert.ok(item.windows[j].signalIndex>=item.windows[j-1].exitIndex);
      assert.ok(item.costSensitivity.every(s=>s.count===item.closedHypotheticalObservations));
    }
  }
});

test('fixed daily breakout signal helper exactly matches original locked condition',()=>{
  const data=fictional();
  const lastIndex=90,signal=classifyDailyBreakoutAt(data.bars,lastIndex);
  assert.equal(signal.signal,'HISTORICAL_BREAKOUT');
  assert.equal(signal.checks.above50DayAverage,true);
  assert.equal(signal.checks.brokePrior20DayHigh,true);
  assert.throws(()=>classifyDailyBreakoutAt(data.bars,48),/50 completed bars/);
});

test('cost stress decreases hypothetical raw mean without changing classifications or observation windows',()=>{
  const report=auditChronologicalResearch(fictional());
  assert.deepEqual(RESEARCH_STRESS_CASES.map(x=>x.id),
    ['ZERO_COST_REFERENCE','DEFAULT_10_BPS','STRESS_25_BPS','STRESS_50_BPS']);
  let observations=0;
  for(const phase of report.phases){
    observations+=phase.strategy.closedHypotheticalObservations;
    for(const group of [phase.strategy,phase.control]){
      const s=group.costSensitivity;
      if(!s[0].count){
        assert.ok(s.every(row=>row.meanCashOutlayReturnPct===null));
        assert.ok(s.every(row=>row.positiveOutcomeRatePct===null));
      }else{
        for(let i=1;i<s.length;i++){
          assert.ok(s[i].meanCashOutlayReturnPct<s[i-1].meanCashOutlayReturnPct,
            'Increasing both sides fees/slippage must lower modeled net reference');
        }
      }
    }
  }
  assert.ok(observations>0,'engineered trending fixture should generate breakout samples');
});

test('changing future bars cannot change earlier independent phase signal or return results',()=>{
  const input=fictional(),baseline=auditChronologicalResearch(input);
  const revised=structuredClone(input);
  for(let i=baseline.phases[1].startIndex;i<revised.bars.length;i++){
    const bar=revised.bars[i];
    bar.open*=1.3;bar.close*=1.3;bar.high*=1.3;bar.low*=1.3;
  }
  const later=auditChronologicalResearch(revised);
  assert.deepEqual(later.phases[0],baseline.phases[0]);
  assert.notDeepEqual(later.phases[1].control.costSensitivity,baseline.phases[1].control.costSensitivity);
});

test('no eligible signals produces null descriptive strategy means, never a fabricated win rate',()=>{
  const report=auditChronologicalResearch(fictional({drift:0}));
  for(const phase of report.phases){
    assert.equal(phase.strategy.closedHypotheticalObservations,0);
    for(const c of phase.strategy.costSensitivity){
      assert.equal(c.count,0);
      assert.equal(c.meanCashOutlayReturnPct,null);
      assert.equal(c.positiveOutcomeRatePct,null);
      assert.equal(c.worstCashOutlayReturnPct,null);
    }
  }
});

test('invalid review cutoffs and insufficient completed bars fail closed',()=>{
  const input=fictional();
  assert.throws(()=>auditChronologicalResearch(input,{asOf:'2026-02-30'}),/real YYYY-MM-DD/);
  assert.throws(()=>auditChronologicalResearch(input,{asOf:'2031-01-01'}),/source-as-of/);
  assert.throws(()=>auditChronologicalResearch(fictional({count:120})),/at least 90 post-warmup/);
  assert.throws(()=>auditChronologicalResearch(input,{asOf:input.bars[110].date}),/at least 90 post-warmup/);
});

test('offline CLI refuses unsafe options and returns exact input-byte and candidate identities without modifying source',async()=>{
  assert.deepEqual(parseTimeSplitArgs(['--demo']),{mode:'DEMO'});
  assert.throws(()=>parseTimeSplitArgs(['--paper-auto']),/Usage:/);
  assert.throws(()=>parseTimeSplitArgs(['--demo','--schedule']),/Usage:/);
  assert.throws(()=>parseTimeSplitArgs(['--as-of','2026-02-30','anything.json']),/Usage:/);
  assert.throws(()=>parseTimeSplitArgs(['--as-of','2026-11-20','--paper-auto']),/Usage:/);
  const demo=await runTimeSplitCli(['--demo']);
  assert.equal(demo.inputIdentity.sourceKind,'ENGINEERED_FICTIONAL_FIXTURE');
  assert.match(demo.inputIdentity.fullCandidateCommitSha,/^[a-f0-9]{40}$/);
  assert.equal(demo.safety.productionGate,'NO_GO');
  const dir=await mkdtemp(join(tmpdir(),'p9-time-split-test-'));
  try{
    const file=join(dir,'test.json'),bytes=JSON.stringify(fictional()),date=fictional().sourceAsOf;
    await writeFile(file,bytes,{mode:0o600});
    const one=await runTimeSplitCli(['--as-of',date,file]);
    assert.equal(one.inputIdentity.inputByteSha256,
      createHash('sha256').update(bytes).digest('hex'));
    assert.equal(one.inputIdentity.sourceKind,'USER_SUPPLIED_UNVERIFIED_LOCAL_JSON');
    assert.equal(one.safety.authenticHistoricalDataIndependentlyVerified,false);
    assert.equal(one.inputIdentity.rawInputEchoed,false);
    assert.equal(await readFile(file,'utf8'),bytes);
    assert.deepEqual(await readdir(dir),['test.json']);
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});
