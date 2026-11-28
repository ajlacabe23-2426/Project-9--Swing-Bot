import test from 'node:test';
import assert from 'node:assert/strict';
import {makeClockFixture} from '../src/fictional-clock-replay.mjs';
import {summarizeClockScenario} from '../src/fictional-clock-statistics.mjs';

test('fictional descriptive statistics agree with separate integer-sum calculation',()=>{
  const unique=[...new Map(makeClockFixture().rows.map(x=>[x.at,x.reading])).values()];
  const n=unique.length,sum=unique.reduce((a,b)=>a+b,0);
  const squares=unique.reduce((a,b)=>a+b*b,0);
  const expectedVariance=(n*squares-sum*sum)/(n*(n-1));
  const r=summarizeClockScenario('complete');
  assert.equal(r.uniqueCount,72);assert.equal(r.completeness,1);
  assert.equal(r.mean,sum/n);
  assert.ok(Math.abs(r.sampleVariance-expectedVariance)<1e-9);
  assert.ok(Math.abs(r.sampleStandardDeviation-Math.sqrt(expectedVariance))<1e-9);
  assert.equal(r.min,Math.min(...unique));assert.equal(r.max,Math.max(...unique));
  assert.equal(r.marketDataUsed,false);assert.equal(r.transactionsEnabled,false);
});
test('duplicates and reversals do not bias descriptive values; gaps are not imputed',()=>{
  const a=summarizeClockScenario('complete');
  for(const scenario of ['duplicate','reversed']){
    const b=summarizeClockScenario(scenario);
    for(const key of ['mean','median','sampleVariance','uniqueCount','completeness'])
      assert.equal(b[key],a[key]);
  }
  const g=summarizeClockScenario('gap');
  assert.equal(g.uniqueCount,70);assert.equal(g.missingCount,2);
  assert.equal(g.completeness,70/72);
  assert.ok(g.limitations.includes('NO_POPULATION_OR_CAUSAL_INFERENCE'));
  assert.throws(()=>summarizeClockScenario('BTC/USD'),/Unknown classroom/);
});
