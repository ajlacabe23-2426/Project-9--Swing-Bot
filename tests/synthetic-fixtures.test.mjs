import test from 'node:test';
import assert from 'node:assert/strict';
import {generateScenario,buildDemoFixture,DEMO_SYMBOLS} from '../src/synthetic-fixtures.mjs';
import {generateScenario as legacyGenerate} from '../src/engine.mjs';
import {buildDemoDataset} from '../src/synthetic-demo-fixture.mjs';
import {buildDemoDataset as legacyDemo} from '../scripts/seed-workstation-demo.mjs';

test('legacy fictional fixture entrypoints preserve their output and prefix',()=>{
  for(const seed of [1,73,91,1_000_000]){
    const full=generateScenario(seed);
    assert.deepEqual(full,legacyGenerate(seed));
    assert.deepEqual(generateScenario(seed,50),full.slice(0,50));
    assert.equal(full.length,190);
  }
  assert.equal(generateScenario,legacyGenerate);
  assert.equal(buildDemoDataset,legacyDemo);
});
test('seeded classroom datasets preserve wire shape and identity',()=>{
  for(const symbol of DEMO_SYMBOLS){
    const fixture=buildDemoFixture(symbol);
    assert.deepEqual(fixture,buildDemoDataset(symbol));
    assert.deepEqual(fixture,legacyDemo(symbol));
    assert.equal(fixture.bars.length,120);
    assert.equal(fixture.sourceAsOf,'2026-02-16');
    assert.equal(fixture.bars.at(-1).date,fixture.sourceAsOf);
    assert.equal(fixture.currency,'USD');
    assert.match(fixture.source,/NOT REAL MARKET DATA/);
  }
  assert.equal(buildDemoFixture('SIM09').bars.at(-1).close,129.232);
  assert.throws(()=>buildDemoFixture('UNKNOWN'),/Unknown demo symbol/);
  assert.throws(()=>buildDemoDataset('SIM09',{retrievedAt:'invalid'}),/retrieval timestamp/);
});
test('independent fixture copies do not share mutable data',()=>{
  const first=buildDemoFixture('SIM09'),second=buildDemoFixture('SIM09');
  first.bars[0].close=-1;
  assert.notEqual(first.bars[0].close,second.bars[0].close);
  assert.deepEqual(second,buildDemoFixture('SIM09'));
});
