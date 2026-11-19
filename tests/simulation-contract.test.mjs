import test from 'node:test';
import assert from 'node:assert/strict';
import {ACCOUNTING_MODE,validateSimulationContract,assertSameAccountingDomain} from '../src/simulation-contract.mjs';

const observation=()=>({
  version:1,mode:ACCOUNTING_MODE.OBSERVATION_REFERENCE,scope:'FICTIONAL_OFFLINE',
  sourceId:'SIM09',prefixDigest:'a'.repeat(64),exerciseVersion:'classroom-v1',
  asOf:'2026-02-18',cursor:121,currency:'USD',precision:'REFERENCE_DISPLAY_ONLY',
  costs:'NOT_APPLICABLE',capitalBasis:'NO_LEDGER',visibility:'COMPLETED_PREFIX_ONLY'
});
const simulation=()=>({...observation(),mode:ACCOUNTING_MODE.FILLED_SIMULATION,
  precision:'VIRTUAL_LEDGER_DEFERRED',costs:'VIRTUAL_COST_POLICY_DEFERRED',capitalBasis:'FICTIONAL_LEDGER'});

test('explicit compatible fictional metadata is copied and frozen',()=>{
  for(const input of [observation(),simulation()]){
    const output=validateSimulationContract(input);
    assert.deepEqual(output,input);assert.notEqual(output,input);assert.ok(Object.isFrozen(output));
  }
});
test('unknown and real-labeled inputs fail closed',()=>{
  for(const patch of [{sourceId:'AAPL'},{scope:'LIVE'},{currency:'EUR'},{visibility:'FUTURE_BARS'},{version:2}]){
    assert.throws(()=>validateSimulationContract({...observation(),...patch}),TypeError);
  }
});
test('invalid cursor, calendar date and identity fail closed',()=>{
  for(const patch of [{cursor:-1},{cursor:0.5},{cursor:NaN},{asOf:'2026-02-30'},{asOf:'2026-2-18'},{prefixDigest:'invalid'},{exerciseVersion:''}]){
    assert.throws(()=>validateSimulationContract({...observation(),...patch}),TypeError);
  }
});
test('mode and policy must agree; retrospective remains disabled',()=>{
  for(const patch of [{mode:'toString'},{mode:ACCOUNTING_MODE.RETROSPECTIVE_UNIT_REFERENCE},
     {mode:ACCOUNTING_MODE.FILLED_SIMULATION},{capitalBasis:'FICTIONAL_LEDGER'},{costs:'VIRTUAL_COST_POLICY_DEFERRED'}]){
    assert.throws(()=>validateSimulationContract({...observation(),...patch}),TypeError);
  }
});
test('exact metadata rejects missing fields, extra amounts and foreign prototypes',()=>{
  const missing=observation();delete missing.mode;
  for(const value of [null,[],missing,{...observation(),cash:100},Object.assign(Object.create({}),observation())]){
    assert.throws(()=>validateSimulationContract(value),TypeError);
  }
});
test('reference and fictional ledger domains cannot be combined',()=>{
  assert.throws(()=>assertSameAccountingDomain([observation(),simulation()]),/Incompatible/);
  assert.throws(()=>assertSameAccountingDomain([simulation(),observation()]),/Incompatible/);
});
test('identical domains pass but different history, cursor or exercise does not',()=>{
  assert.deepEqual(assertSameAccountingDomain([observation(),observation()]),observation());
  for(const patch of [{sourceId:'SIM10'},{prefixDigest:'b'.repeat(64)},{asOf:'2026-02-19'},{cursor:122},{exerciseVersion:'classroom-v2'}]){
    assert.throws(()=>assertSameAccountingDomain([observation(),{...observation(),...patch}]),/Incompatible/);
  }
  assert.throws(()=>assertSameAccountingDomain([]),TypeError);
  assert.throws(()=>assertSameAccountingDomain(Array(1)),TypeError);
});
