import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateScenario} from '../src/engine.mjs';
import {MARKET_DATA_SCHEMA,evaluateSwingSetup} from '../src/market-intelligence.mjs';
import {WorkstationStore} from '../src/workstation-store.mjs';

// Offline synthetic completed OHLCV data; no brokerage, API keys or external calls.
function dataset(){
  const bars=generateScenario(91,120).map(item=>({...item}));
  return {schema:MARKET_DATA_SCHEMA,symbol:'TEST',currency:'USD',
    source:'Synthetic paper-journal acceptance',mode:'HISTORICAL',
    sourceAsOf:bars.at(-1).date,priceAdjustment:'VENDOR_ADJUSTED',bars};
}
function nextTradingDate(last){
  const date=new Date(last+'T00:00:00.000Z');
  do{date.setUTCDate(date.getUTCDate()+1);}while([0,6].includes(date.getUTCDay()));
  return date.toISOString().slice(0,10);
}

test('paper entry, target observation and frozen journal survive actual store re-initialization',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-paper-acceptance-'));
  try{
    const filename=join(dir,'synthetic.json');
    const store=new WorkstationStore(filename);
    await store.init();
    await store.setWatchlist(['TEST']);
    const source=dataset();
    const evaluation=evaluateSwingSetup(source);
    if(evaluation.classification==='NO_PAPER_SETUP'){
      // Exercise the journal with a synthetic eligible research classification;
      // never misrepresent a real market scanner's result.
      evaluation.classification='PAPER_SETUP_WATCH';
      evaluation.score=65;
    }
    assert.ok(evaluation.paperRiskPlan.maxPaperUnits>=0.001);
    await store.applyRefresh([{dataset:source,evaluation}],{refreshedAt:'2026-10-16T12:00:00Z'});
    const initial=await store.createTicket('TEST',0.001,{createdAt:'2026-10-16T12:01:00Z'});
    const ticket=initial.tickets[0];
    assert.equal(ticket.outcome.status,'OPEN_PAPER_OBSERVATION');
    assert.equal('broker' in ticket,false);
    const frozen={entry:ticket.entryReference,stop:ticket.stopReference,target:ticket.targetReference,open:ticket.openedAsOf};

    const later=structuredClone(source);
    const date=nextTradingDate(source.bars.at(-1).date);
    later.bars.push({
      date,open:frozen.entry,high:frozen.target+1,
      low:frozen.entry-(frozen.entry-frozen.stop)/2,
      close:frozen.target+0.25,volume:200000
    });
    later.sourceAsOf=date;
    const newest=evaluateSwingSetup(later);
    const updated=await store.applyRefresh([{dataset:later,evaluation:newest}],{refreshedAt:'2026-10-16T12:02:00Z'});
    assert.equal(updated.tickets[0].outcome.status,'TARGET_REFERENCE_TOUCHED');
    assert.equal(updated.tickets[0].outcome.observedThrough,date);
    assert.equal(updated.tickets[0].entryReference,frozen.entry);
    assert.equal(updated.tickets[0].stopReference,frozen.stop);
    assert.equal(updated.tickets[0].targetReference,frozen.target);
    assert.equal(updated.tickets[0].openedAsOf,frozen.open);
    assert.equal('broker' in updated.tickets[0],false);
    assert.match(updated.tickets[0].outcome.note,/not an executable fill/);

    const restarted=new WorkstationStore(filename);
    await restarted.init();
    assert.deepEqual(restarted.snapshot(),updated,'Restart must preserve full frozen paper journal');
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});
