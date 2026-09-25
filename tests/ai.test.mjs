import test from 'node:test';
import assert from 'node:assert/strict';
import {evidencePacket,modelCommentary} from '../src/ai.mjs';
import {initialState,report} from '../src/engine.mjs';
const research=report(initialState(73));
test('optional AI adapter is off without credentials',async()=>{
  const result=await modelCommentary(research,{apiKey:''});assert.equal(result.enabled,false);
});
test('model receives only synthetic as-of evidence and never changes a paper order',async()=>{
  const original=structuredClone(research),packet=evidencePacket(research);
  assert.equal(packet.dataType,'SYNTHETIC_Generated_Demonstration_NOT_REAL_MARKET_DATA');
  let calls=0;
  const output=await modelCommentary(research,{apiKey:'FAKE_TEST_KEY',fetcher:async(_url,options)=>{
    calls++;const body=JSON.parse(options.body);
    assert.match(body.messages[1].content,/SYNTHETIC_Generated_Demonstration/);
    assert.doesNotMatch(body.messages[1].content,/brokerageCredentials/);
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({explanation:'The simulated short moving average is above the long mean.',limitations:'Generated prices and modeled fills do not demonstrate predictive validity.'})}}]})};
  }});
  assert.equal(calls,1);assert.equal(output.enabled,true);assert.deepEqual(research,original);
});
test('invalid AI response fails closed',async()=>{
  await assert.rejects(()=>modelCommentary(research,{apiKey:'FAKE_TEST_KEY',fetcher:async()=>({ok:true,json:async()=>({choices:[{message:{content:'bad'}}]})})}),/invalid explanation/);
});
