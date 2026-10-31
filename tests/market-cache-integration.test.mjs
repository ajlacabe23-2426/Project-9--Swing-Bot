import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MarketCache} from '../src/market-cache.mjs';
import {generateScenario} from '../src/engine.mjs';
import {CURRENT_MARKET_DATA_SCHEMA,evaluateSwingSetup} from '../src/market-intelligence.mjs';
import {fetchWorkstationDataset} from '../server.mjs';
import {WorkstationStore} from '../src/workstation-store.mjs';

test('imported licensed-data contract loads through workstation refresh and paper ledger',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p9-e2e-'));
  try{
    const bars=generateScenario(91,120);
    const dataset={
      schema:CURRENT_MARKET_DATA_SCHEMA,
      symbol:'TEST',currency:'USD',source:'Local historical research fixture',
      mode:'HISTORICAL',sourceAsOf:bars.at(-1).date,
      priceAdjustment:'VENDOR_ADJUSTED',
      provenance:{
        retrievedAt:'2026-10-28T00:00:00.000Z',
        adjustmentMethod:'PROVIDER_ADJUSTED_UNVERIFIED',
        corporateActions:'PROVIDER_ADJUSTED_NOT_INDEPENDENTLY_VERIFIED',
        survivorship:'NOT_ASSESSED',
        licensing:'USER_ASSERTED_PERMITTED'
      },bars
    };
    await new MarketCache(join(root,'market-cache')).save(dataset);
    const fetched=await fetchWorkstationDataset({
      symbol:'TEST',from:'2024-01-01',to:'2026-10-27',dataDir:root,apiKey:''
    });
    assert.equal(fetched.symbol,'TEST');
    const evaluation=evaluateSwingSetup(fetched);
    evaluation.chartBars=fetched.bars.slice(-60);
    const workstation=new WorkstationStore(join(root,'workstation.json'));
    await workstation.init();
    await workstation.setWatchlist(['TEST']);
    const latest=await workstation.applyRefresh([{dataset:fetched,evaluation}],{
      refreshedAt:'2026-10-28T12:00:00.000Z'
    });
    assert.equal(latest.lastScans.TEST.symbol,'TEST');
    assert.equal(latest.lastScans.TEST.asOf,bars.at(-1).date);
    assert.equal(latest.lastScans.TEST.source.provenance.contract,'V2_DECLARED');
    assert.equal(latest.lastScans.TEST.executionReadiness.status,'NOT_EXECUTION_READY');
    const reloaded=new WorkstationStore(join(root,'workstation.json'));
    await reloaded.init();
    assert.deepEqual(reloaded.snapshot(),latest);
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});
