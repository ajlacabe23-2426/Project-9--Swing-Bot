import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateScenario} from '../src/engine.mjs';
import {evaluateSwingSetup,MARKET_DATA_SCHEMA} from '../src/market-intelligence.mjs';
import {WorkstationStore,evaluatePaperTicket,normalizeWatchlist} from '../src/workstation-store.mjs';

function dataset(symbol='TEST'){
  const bars=generateScenario(91,120).map(bar=>({...bar}));
  return {schema:MARKET_DATA_SCHEMA,symbol,currency:'USD',source:'Permitted test data',mode:'HISTORICAL',sourceAsOf:bars.at(-1).date,priceAdjustment:'VENDOR_ADJUSTED',bars};
}
function forceWatchEvaluation(input){
  const evaluation=evaluateSwingSetup(input);
  if(evaluation.classification==='NO_PAPER_SETUP'){
    evaluation.classification='PAPER_SETUP_WATCH';
    evaluation.score=60;
  }
  return evaluation;
}

test('normalizes a bounded unique watchlist',()=>{
  assert.deepEqual(normalizeWatchlist([' aapl ','MSFT']),['AAPL','MSFT']);
  assert.throws(()=>normalizeWatchlist(['AAPL','AAPL']),/unique/);
  assert.throws(()=>normalizeWatchlist(['bad symbol']),/invalid/);
});

test('workstation persists scans and freezes paper tickets without broker state',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'project9-workstation-'));
  try{
    const store=new WorkstationStore(join(dir,'workstation.json'));await store.init();
    await store.setWatchlist(['TEST']);
    const input=dataset(),evaluation=forceWatchEvaluation(input);
    await store.applyRefresh([{dataset:input,evaluation}],{refreshedAt:'2026-10-05T15:00:00.000Z'});
    const units=Math.min(1,evaluation.paperRiskPlan.maxPaperUnits);
    assert.ok(units>0);
    const state=await store.createTicket('TEST',units,{createdAt:'2026-10-05T15:01:00.000Z'});
    assert.equal(state.tickets.length,1);
    assert.equal(state.tickets[0].symbol,'TEST');
    assert.equal(state.tickets[0].outcome.status,'OPEN_PAPER_OBSERVATION');
    assert.equal('broker' in state.tickets[0],false);
    const restored=new WorkstationStore(join(dir,'workstation.json'));await restored.init();
    assert.deepEqual(restored.snapshot(),state);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('classification changes create explicit alerts',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'project9-alerts-'));
  try{
    const store=new WorkstationStore(join(dir,'workstation.json'));await store.init();await store.setWatchlist(['TEST']);
    const input=dataset(),first=forceWatchEvaluation(input);
    await store.applyRefresh([{dataset:input,evaluation:first}],{refreshedAt:'2026-10-05T15:00:00.000Z'});
    const second=structuredClone(first);second.classification=first.classification==='PAPER_SETUP_STRONG'?'PAPER_SETUP_WATCH':'PAPER_SETUP_STRONG';second.score=second.classification==='PAPER_SETUP_STRONG'?85:65;
    const state=await store.applyRefresh([{dataset:input,evaluation:second}],{refreshedAt:'2026-10-06T15:00:00.000Z'});
    assert.equal(state.alerts.length,1);
    assert.equal(state.alerts[0].from,first.classification);
    assert.equal(state.alerts[0].to,second.classification);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('paper outcome distinguishes target, stop and ambiguous same-bar observations',()=>{
  const base=dataset();
  const evaluation=forceWatchEvaluation(base);
  const ticket={
    id:'P9-0001',symbol:'TEST',createdAt:'x',openedAsOf:base.bars[80].date,paperUnits:1,
    entryReference:base.bars[80].close,stopReference:base.bars[80].close-2,targetReference:base.bars[80].close+4,
    classificationAtOpen:'PAPER_SETUP_WATCH',scoreAtOpen:60
  };
  const target=structuredClone(base);target.bars=target.bars.slice(0,82);target.sourceAsOf=target.bars.at(-1).date;
  target.bars[81].high=ticket.targetReference+1;target.bars[81].low=Math.max(ticket.stopReference+0.5,target.bars[81].low);
  assert.equal(evaluatePaperTicket(ticket,target).status,'TARGET_REFERENCE_TOUCHED');

  const stop=structuredClone(base);stop.bars=stop.bars.slice(0,82);stop.sourceAsOf=stop.bars.at(-1).date;
  stop.bars[81].low=ticket.stopReference-1;stop.bars[81].high=Math.min(ticket.targetReference-0.5,Math.max(stop.bars[81].high,stop.bars[81].open,stop.bars[81].close));
  assert.equal(evaluatePaperTicket(ticket,stop).status,'STOP_REFERENCE_TOUCHED');

  const both=structuredClone(base);both.bars=both.bars.slice(0,82);both.sourceAsOf=both.bars.at(-1).date;
  both.bars[81].low=ticket.stopReference-1;both.bars[81].high=ticket.targetReference+1;
  assert.equal(evaluatePaperTicket(ticket,both).status,'AMBIGUOUS_SAME_BAR');
});
