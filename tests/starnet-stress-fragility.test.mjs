import test from 'node:test';
import assert from 'node:assert/strict';
import {engineered} from '../scripts/starnet-three-level-evidence.mjs';
import {
  auditStarNetStressFragility,evaluateMeanLeaveOneOut
} from '../src/starnet-stress-fragility.mjs';

const inputs=()=>{const fixture=engineered();return {
  marketBytes:fixture.bytes,asOf:fixture.asOf,sourceKind:'ENGINEERED_OFFLINE_FIXTURE'
};};

test('Phase 17 identifies one-holdout observation as insufficient evidence',()=>{
  const report=auditStarNetStressFragility(inputs());
  assert.equal(report.schema,'project9-offline-stress-fragility-v1');
  assert.equal(report.phases.length,3);
  assert.equal(report.phases.at(-1).completedHypotheticalWindows,1);
  assert.equal(report.phases.at(-1).leaveOneOutHighestCost,null);
  assert.equal(report.phases.at(-1).oneObservationCannotSupportLeaveOneOut,true);
  assert.equal(report.holdoutEvidenceGate,'INSUFFICIENT_FOR_SKILL_CLAIM');
  assert.equal(report.safety.productionGate,'NO_GO');
  assert.equal(report.safety.realOrdersCreated,0);
  assert.equal(report.sourceAuthenticityIndependentlyVerified,false);
});

test('higher modeled costs degrade every studied window without retuning',()=>{
  const report=auditStarNetStressFragility(inputs());
  for(const phase of report.phases){
    if(phase.completedHypotheticalWindows){
      assert.ok(phase.costWorseningPercentagePoints>0);
      assert.ok(phase.zeroCostMeanPct>phase.highestModeledCostMeanPct);
    }else{
      assert.equal(phase.zeroCostMeanPct,null);
      assert.equal(phase.leaveOneOutHighestCost,null);
    }
    assert.equal(phase.predictiveReliabilityEstablished,false);
  }
  assert.deepEqual(auditStarNetStressFragility(inputs()),report);
});

test('one-out mean range makes a single extreme hypothetical return visible',()=>{
  const r=evaluateMeanLeaveOneOut([1,1,10]);
  assert.ok(Math.abs(r.minimumMeanPct-1)<1e-9);
  assert.ok(Math.abs(r.maximumMeanPct-5.5)<1e-9);
  assert.equal(r.maximumAbsoluteShiftPctPoints,3);
  assert.equal(evaluateMeanLeaveOneOut([1]),null);
  assert.equal(evaluateMeanLeaveOneOut([]),null);
  assert.throws(()=>evaluateMeanLeaveOneOut([1,Infinity]),/Finite/);
});

test('cutoff and prohibited source classes fail closed',()=>{
  const args=inputs();
  assert.throws(()=>auditStarNetStressFragility({...args,asOf:'2020-01-01'}),/refused/);
  assert.throws(()=>auditStarNetStressFragility({...args,sourceKind:'BROKER_LIVE'}),/refused/);
  assert.throws(()=>auditStarNetStressFragility({...args,marketBytes:Buffer.from('{')}),/refused/);
});
