import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MarketCache} from '../src/market-cache.mjs';
import {generateScenario} from '../src/engine.mjs';
import {evaluateSwingSetup,normalizeMarketDataset,CURRENT_MARKET_DATA_SCHEMA} from '../src/market-intelligence.mjs';

function dataset(){
  const bars=generateScenario(97,120);
  return {
    schema:CURRENT_MARKET_DATA_SCHEMA,symbol:'AAPL',currency:'USD',
    source:'Licensed historical dataset supplied locally',mode:'HISTORICAL',
    sourceAsOf:bars.at(-1).date,priceAdjustment:'VENDOR_ADJUSTED',
    provenance:{
      retrievedAt:'2026-10-28T00:00:00.000Z',
      adjustmentMethod:'PROVIDER_ADJUSTED_UNVERIFIED',
      corporateActions:'PROVIDER_ADJUSTED_NOT_INDEPENDENTLY_VERIFIED',
      survivorship:'NOT_ASSESSED',
      licensing:'USER_ASSERTED_PERMITTED'
    },
    bars
  };
}

test('validated v2 contracts survive repeated normalization and scoring',()=>{
  const once=normalizeMarketDataset(dataset());
  const twice=normalizeMarketDataset(once);
  assert.deepEqual(twice,once);
  assert.equal(evaluateSwingSetup(twice).symbol,'AAPL');
  const forged=structuredClone(once);
  forged.provenance.contract='VERIFIED_FOR_REAL_EXECUTION';
  assert.throws(()=>normalizeMarketDataset(forged),/provenance has invalid fields/);
});

test('market cache preserves real-data declarations and hash through restart',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p9-cache-'));
  try{
    const cache=new MarketCache(root);
    const meta=await cache.save(dataset());
    assert.equal(meta.symbol,'AAPL');
    assert.equal(meta.bars,120);
    assert.match(meta.sha256,/^[0-9a-f]{64}$/);
    assert.equal(meta.integrity,'LOCAL_DIGEST_MATCH_ONLY');
    const restarted=new MarketCache(root);
    assert.deepEqual(await restarted.read('AAPL'),normalizeMarketDataset(dataset()));
    assert.deepEqual((await restarted.inspect('AAPL')).sha256,meta.sha256);
    assert.deepEqual(await restarted.save(dataset()),meta);
    assert.throws(()=>cache.pathFor('../AAPL'),/Invalid market-cache symbol/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('market cache rejects rollback, same-date revisions and disk modification',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p9-corrupt-'));
  try{
    const cache=new MarketCache(root);
    await cache.save(dataset());
    const before=await readFile(cache.pathFor('AAPL'),'utf8');
    const older=dataset();
    older.bars.pop();
    older.sourceAsOf=older.bars.at(-1).date;
    await assert.rejects(()=>cache.save(older),/stale market dataset rollback/);
    const different=dataset();
    different.bars[25].volume+=1;
    await assert.rejects(()=>cache.save(different),/Conflicting same-date/);
    assert.equal(await readFile(cache.pathFor('AAPL'),'utf8'),before);
    const modified=JSON.parse(before);
    modified.dataset.bars[10].close+=0.001;
    await writeFile(cache.pathFor('AAPL'),JSON.stringify(modified));
    await assert.rejects(()=>cache.read('AAPL'),/integrity check failed/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('parallel saves serialize without corrupting the cache',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p9-race-'));
  try{
    const cache=new MarketCache(root);
    const a=dataset();
    const b=dataset();
    b.bars.push({...b.bars.at(-1),date:'2026-01-02'});
    b.sourceAsOf=b.bars.at(-1).date;
    const results=await Promise.allSettled([cache.save(a),cache.save(b)]);
    assert.ok(results.some(result=>result.status==='fulfilled'));
    assert.ok(results.every(result=>result.status==='fulfilled'||result.reason instanceof Error));
    assert.ok((await cache.read('AAPL')).bars.length>=120);
  }finally{await rm(root,{recursive:true,force:true});}
});
