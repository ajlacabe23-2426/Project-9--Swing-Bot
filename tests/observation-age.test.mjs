import test from 'node:test';
import assert from 'node:assert/strict';
import {observationAgeDays} from '../public/observation-age.mjs';

const clock=new Date('2026-11-01T15:00:00.000Z');
test('historical age counts UTC calendar days, not market sessions',()=>{
  assert.equal(observationAgeDays('2026-10-30',clock),2);
  assert.equal(observationAgeDays('2026-11-01',clock),0);
  assert.equal(observationAgeDays('2026-02-28',clock),246);
});
test('historical age rejects impossible, malformed and future observations',()=>{
  for(const value of ['2026-02-30','2026-13-01','2025-02-29','not-a-date','2026-1-1','2026-11-02','2026-10-30T00:00:00Z',null]){
    assert.equal(observationAgeDays(value,clock),null,String(value));
  }
  assert.equal(observationAgeDays('2024-02-29',clock)>0,true,'leap day remains valid');
});
