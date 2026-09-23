import test from 'node:test';
import assert from 'node:assert/strict';
import {generateScenario,initialState,step,run,report,signalAt,sma,rsi,INITIAL_CASH,MAX_WEIGHT,historicalExperiment,START_CURSOR} from '../src/engine.mjs';
const bars=generateScenario(73);
test('seeded synthetic OHLCV scenario is deterministic and internally plausible',()=>{
  assert.deepEqual(generateScenario(73),bars);assert.notDeepEqual(generateScenario(74),bars);assert.equal(bars.length,190);
  for(const bar of bars){assert.ok(bar.high>=Math.max(bar.open,bar.close));assert.ok(bar.low<=Math.min(bar.open,bar.close));assert.ok(bar.low>0);}
});
test('indicators and signal have no future-bar access',()=>{
  for(let i=START_CURSOR;i<bars.length-1;i++){
    const prefix=bars.slice(0,i+1),changedFuture=[...prefix,{...bars[i+1],close:1_000_000}];
    assert.equal(sma(prefix,i,5),sma(changedFuture,i,5));
    assert.equal(rsi(prefix,i),rsi(changedFuture,i));
    assert.equal(signalAt(prefix,i),signalAt(changedFuture,i));
  }
});
test('every virtual fill occurs after the signal and stays inside initial entry bounds',()=>{
  const end=run(run(run(initialState(73),60,bars).state,60,bars).state,60,bars).state;
  assert.ok(end.trades.length>0);
  for(const trade of end.trades){
    const signalIndex=bars.findIndex(bar=>bar.date===trade.signalDate),fillIndex=bars.findIndex(bar=>bar.date===trade.fillDate);
    assert.equal(fillIndex,signalIndex+1);
    assert.ok(trade.quantity>0&&trade.fee>=0.5&&trade.cashAfter>=0);
    const opening=bars[fillIndex].open;
    assert.ok(trade.side==='PAPER_BUY'?trade.price>opening:trade.price<opening);
  }
  assert.ok(end.quantity>=0&&end.cash>=0);
  const summary=report(end,bars);
  assert.equal(summary.bars.at(-1).date,bars[end.cursor].date);
  assert.ok(!summary.bars.some(bar=>bar.date===bars[end.cursor+1]?.date));
  assert.equal(summary.interpretation.engine,'DETERMINISTIC_EXPLANATION_NOT_GENERATIVE_AI');
  assert.equal(summary.safeguards.maxWeight,MAX_WEIGHT);
});
test('cash, fees and hypothetical units reconcile on each fill',()=>{
  let state=initialState(73);
  for(let i=0;i<100;i++){
    const previous=state;state=step(state,bars).state;
    if(state.trades.length>previous.trades.length){
      const t=state.trades.at(-1);
      const expected=t.side==='PAPER_BUY'?previous.cash-t.quantity*t.price-t.fee:previous.cash+t.quantity*t.price-t.fee;
      assert.ok(Math.abs(state.cash-expected)<0.02);
      assert.ok(Math.abs(state.quantity-(t.side==='PAPER_BUY'?t.quantity:0))<0.00001);
      if(t.side==='PAPER_BUY')assert.ok(t.quantity*t.price/(previous.cash+previous.quantity*bars[previous.cursor].close)<=MAX_WEIGHT+1e-8);
    }
  }assert.equal(INITIAL_CASH,10_000);
});
test('replay and synthetic in-sample experiment are reproducible',()=>{
  assert.deepEqual(run(initialState(91),20),run(initialState(91),20));
  assert.deepEqual(historicalExperiment(91),historicalExperiment(91));
  const end=run(run(run(initialState(91),60).state,60).state,60);
  assert.equal(end.finished,true);assert.deepEqual(step(end.state).state,end.state);
});
test('invalid scenario and replay inputs fail validation',()=>{
  assert.throws(()=>generateScenario(0));assert.throws(()=>generateScenario(1,5));
  assert.throws(()=>initialState(-1));assert.throws(()=>run(initialState(),61));
});
