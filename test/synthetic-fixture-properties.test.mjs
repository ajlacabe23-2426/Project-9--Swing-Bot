import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSyntheticFixtures} from '../src/synthetic-fixture-comparison.mjs';

// Deterministic PRNG for fictional software-test data, not market simulation.
function rng(seed){
  let state=seed>>>0;
  return n=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return (state>>>8)%n;};
}
const fields=['open','high','low','close'];
const encode=(source,rows)=>Buffer.from(JSON.stringify({schema:'synthetic-candle-fixture-v1',fictional:true,source,rows}));
function sample(seed){
  const next=rng(seed);
  const left=[],right=[];
  for(let i=0;i<32;i++){
    const timestamp=i*3600, base=10+next(100);
    const row={timestamp,open:base,high:base+4,low:base-2,close:base+1};
    if(i===0||i===31||next(4)!==0)left.push({...row});
    if(i===0||i===31||next(4)!==0)right.push({...row,close:row.close+(next(4)===0?1:0)});
  }
  return [left,right];
}
test('200 seeded fictional comparisons agree with a finite-grid oracle',()=>{
  for(let seed=1;seed<=200;seed++){
    const [left,right]=sample(seed);
    const a=encode('fixture-a',left),b=encode('fixture-b',right);
    const actual=compareSyntheticFixtures(a,b);
    const differences=[], missing=[];
    let matched=0, observed=0;
    for(let i=0;i<32;i++){
      const timestamp=i*3600;
      const l=left.find(r=>r.timestamp===timestamp),r=right.find(r=>r.timestamp===timestamp);
      if(!l&&!r){missing.push(timestamp);continue;}
      observed++;
      if(!l||!r){differences.push({timestamp,kind:l?'MISSING_RIGHT':'MISSING_LEFT'});continue;}
      const mismatches=fields.filter(k=>l[k]!==r[k]);
      if(mismatches.length)differences.push({timestamp,kind:'VALUE_DISAGREEMENT',fields:mismatches});
      else matched++;
    }
    const expandedGaps=actual.sharedGaps.flatMap(g=>Array.from({length:g.missing},(_,i)=>g.after+(i+1)*3600));
    assert.deepEqual(expandedGaps,missing,'gap oracle seed '+seed);
    assert.deepEqual(actual.differences,differences,'difference oracle seed '+seed);
    assert.equal(actual.matched,matched);
    assert.equal(actual.comparedTimestamps,observed);
    assert.equal(actual.status,differences.length||missing.length?'REVIEW_REQUIRED':'FIXTURES_AGREE');
    assert.equal(actual.realMarketEvidence,false);
    assert.equal(actual.independentlyAuthenticated,false);
    assert.deepEqual(actual,compareSyntheticFixtures(a,b));
  }
});
test('100 seeded comparisons preserve direction-independent invariants',()=>{
  for(let seed=201;seed<=300;seed++){
    const [left,right]=sample(seed);
    const a=encode('fixture-a',left),b=encode('fixture-b',right);
    const ab=compareSyntheticFixtures(a,b),ba=compareSyntheticFixtures(b,a);
    assert.equal(ab.status,ba.status);
    assert.equal(ab.matched,ba.matched);
    assert.equal(ab.comparedTimestamps,ba.comparedTimestamps);
    assert.deepEqual(ab.sharedGaps,ba.sharedGaps);
    assert.deepEqual(ab.sources,[...ba.sources].reverse());
    assert.deepEqual(ab.differences.map(d=>({...d,kind:d.kind==='MISSING_LEFT'?'MISSING_RIGHT':d.kind==='MISSING_RIGHT'?'MISSING_LEFT':d.kind})),ba.differences);
  }
});
test('100 seeded invalid fictional record mutations fail closed',()=>{
  const next=rng(712);
  const valid=encode('fixture-a',[{timestamp:0,open:10,high:12,low:9,close:11}]);
  const mutations=[
    r=>{r.high=r.open-1;},r=>{r.low=r.close+1;},r=>{r.timestamp+=1;},
    r=>{r.open=0;},r=>{r.close='11';},r=>{delete r.low;},r=>{r.extra=true;}
  ];
  for(let i=0;i<100;i++){
    const [,right]=sample(i+401);
    const row=right[next(right.length)];
    mutations[i%mutations.length](row);
    assert.throws(()=>compareSyntheticFixtures(valid,encode('fixture-b',right)),/Invalid or unordered/);
  }
});
