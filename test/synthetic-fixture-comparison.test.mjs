import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {compareSyntheticFixtures} from '../src/synthetic-fixture-comparison.mjs';

const encode=(source,rows)=>Buffer.from(JSON.stringify({schema:'synthetic-candle-fixture-v1',fictional:true,source,rows}));
const row=(timestamp,close=11)=>({timestamp,open:10,high:12,low:9,close});
// Independently authored representations of invented observations.
const a=encode('fixture-a',[row(0),row(3600),row(7200)]);
const b=Buffer.from('{"schema":"synthetic-candle-fixture-v1","fictional":true,"source":"fixture-b","rows":[{"timestamp":0,"open":10,"high":12,"low":9,"close":11},{"timestamp":3600,"open":10,"high":12,"low":9,"close":11},{"timestamp":7200,"open":10,"high":12,"low":9,"close":11}]}');

test('independently authored fictional inputs agree without claiming authenticity',()=>{
  const result=compareSyntheticFixtures(a,b);
  assert.equal(result.matched,3);
  assert.equal(result.status,'FIXTURES_AGREE');
  assert.equal(result.independentlyAuthenticated,false);
  assert.equal(result.realMarketEvidence,false);
  assert.equal(result.sources[0].sha256,createHash('sha256').update(a).digest('hex'));
  assert.notEqual(result.sources[0].sha256,result.sources[1].sha256);
});
test('missing records and value differences are distinguished explicitly',()=>{
  const result=compareSyntheticFixtures(a,encode('fixture-b',[row(0,10),row(7200),row(10800)]));
  assert.equal(result.matched,1);
  assert.equal(result.comparedTimestamps,4);
  assert.deepEqual(result.differences,[{timestamp:0,kind:'VALUE_DISAGREEMENT',fields:['close']},{timestamp:3600,kind:'MISSING_RIGHT'},{timestamp:10800,kind:'MISSING_LEFT'}]);
  assert.equal(result.status,'REVIEW_REQUIRED');
});
test('corrupt, duplicate, reversed, and nonfictional input fails closed',()=>{
  for(const invalid of [Buffer.from('{'),encode('fixture-b',[row(0),row(0)]),
    encode('fixture-b',[row(3600),row(0)]),encode('fixture-b',[row(0,13)]),
    Buffer.from(JSON.stringify({schema:'synthetic-candle-fixture-v1',fictional:false,source:'fixture-b',rows:[row(0)]}))]){
    assert.throws(()=>compareSyntheticFixtures(a,invalid));
  }
  assert.throws(()=>compareSyntheticFixtures(a,a),/Distinct fixture labels/);
});
test('byte changes alter fingerprint without fabricating data differences',()=>{
  const pretty=Buffer.from(JSON.stringify(JSON.parse(b.toString()),null,2));
  const first=compareSyntheticFixtures(a,b), second=compareSyntheticFixtures(a,pretty);
  assert.equal(second.status,first.status);
  assert.notEqual(second.sources[1].sha256,first.sources[1].sha256);
});
test('fresh processes produce identical serialized evidence',()=>{
  const moduleUrl=new URL('../src/synthetic-fixture-comparison.mjs',import.meta.url).href;
  const script='import {compareSyntheticFixtures} from '+JSON.stringify(moduleUrl)+'; console.log(JSON.stringify(compareSyntheticFixtures(Buffer.from(process.argv[1],"base64"),Buffer.from(process.argv[2],"base64"))));';
  const run=()=>spawnSync(process.execPath,['--input-type=module','-e',script,a.toString('base64'),b.toString('base64')],{encoding:'utf8',timeout:10000});
  const first=run(),second=run();
  assert.equal(first.status,0,first.stderr);
  assert.equal(second.status,0,second.stderr);
  assert.equal(first.stdout,second.stdout);
  assert.deepEqual(JSON.parse(first.stdout),compareSyntheticFixtures(a,b));
});
