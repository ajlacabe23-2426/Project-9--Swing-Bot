import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildDemoDataset,seedWorkstationDemo,DEMO_SYMBOLS} from '../scripts/seed-workstation-demo.mjs';
import {normalizeMarketDataset,evaluateSwingSetup} from '../src/market-intelligence.mjs';
import {WorkstationStore} from '../src/workstation-store.mjs';

test('workstation sample is obviously synthetic, deterministic, and supports two different rule outcomes',()=>{
  assert.deepEqual(DEMO_SYMBOLS,['SIM09','SIM10']);
  const strong=buildDemoDataset('SIM09'),weak=buildDemoDataset('SIM10');
  assert.deepEqual(strong,buildDemoDataset('SIM09'));
  for(const dataset of [strong,weak]){
    assert.equal(normalizeMarketDataset(dataset).bars.length,120);
    assert.match(dataset.source,/SYNTHETIC.*NOT REAL/);
    assert.equal(dataset.priceAdjustment,'RAW');
    assert.equal(dataset.provenance.licensing,'NOT_VERIFIED');
    assert.equal(evaluateSwingSetup(dataset).safety.realOrders,false);
  }
  assert.equal(evaluateSwingSetup(strong).classification,'PAPER_SETUP_STRONG');
  assert.equal(evaluateSwingSetup(weak).classification,'NO_PAPER_SETUP');
});

test('demo seed is idempotent and preserves existing watchlist and disk data',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-demo-'));
  try{
    const store=new WorkstationStore(join(dir,'workstation.json'));
    await store.init();await store.setWatchlist(['AAPL']);
    const first=await seedWorkstationDemo({dataDir:dir});
    assert.deepEqual(first.watchlist,['AAPL','SIM09','SIM10']);
    assert.equal(first.networkRequests,false);
    const original=await readFile(join(dir,'SIM09.json'),'utf8');
    const second=await seedWorkstationDemo({dataDir:dir});
    assert.deepEqual(second.watchlist,first.watchlist);
    assert.equal(await readFile(join(dir,'SIM09.json'),'utf8'),original);
    const read=new WorkstationStore(join(dir,'workstation.json'));
    await read.init();assert.deepEqual(read.snapshot().watchlist,first.watchlist);
    assert.equal(normalizeMarketDataset(JSON.parse(original)).symbol,'SIM09');
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('demo refuses to replace unrelated local data for the same symbol',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-demo-conflict-'));
  try{
    await writeFile(join(dir,'SIM09.json'),JSON.stringify({source:'My research'}));
    await assert.rejects(()=>seedWorkstationDemo({dataDir:dir}),/Refusing to overwrite/);
    assert.deepEqual(JSON.parse(await readFile(join(dir,'SIM09.json'),'utf8')),{source:'My research'});
  }finally{await rm(dir,{recursive:true,force:true});}
});
