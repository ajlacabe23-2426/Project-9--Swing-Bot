import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildDemoDataset} from '../scripts/seed-workstation-demo.mjs';
import {writeReviewedMarketDataset} from '../src/reviewed-market-write.mjs';

function extend(source){
  const dataset=structuredClone(source);
  const previous=dataset.bars.at(-1),next=new Date(previous.date+'T00:00:00.000Z');
  do{next.setUTCDate(next.getUTCDate()+1);}while([0,6].includes(next.getUTCDay()));
  const close=Number((previous.close+0.20).toFixed(4));
  const open=Number((previous.close+0.05).toFixed(4));
  dataset.bars.push({
    date:next.toISOString().slice(0,10),
    open,high:close+0.1,low:open-0.1,close,volume:180000
  });
  dataset.sourceAsOf=dataset.bars.at(-1).date;
  return dataset;
}

test('new authorized local source is saved with content identity and canonical provenance',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-reviewed-market-'));
  try{
    const file=join(dir,'SIM09.json'),dataset=buildDemoDataset('SIM09');
    const receipt=await writeReviewedMarketDataset(file,dataset);
    assert.equal(receipt.previousBarCount,0);
    assert.equal(receipt.barCount,dataset.bars.length);
    assert.match(receipt.sha256,/^[0-9a-f]{64}$/);
    const saved=JSON.parse(await readFile(file,'utf8'));
    assert.deepEqual(saved,dataset);
    assert.equal('contract' in saved.provenance,false);
    assert.equal(receipt.paperResearchOnly,true);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('only strictly newer append-only bar history can replace a source file',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-reviewed-market-'));
  try{
    const file=join(dir,'SIM09.json'),first=buildDemoDataset('SIM09');
    await writeReviewedMarketDataset(file,first);
    const original=await readFile(file,'utf8');
    await assert.rejects(writeReviewedMarketDataset(file,first),/unchanged or older/);
    assert.equal(await readFile(file,'utf8'),original);
    const next=extend(first);
    const saved=await writeReviewedMarketDataset(file,next);
    assert.equal(saved.previousBarCount,first.bars.length);
    assert.equal(saved.barCount,first.bars.length+1);
    assert.deepEqual(JSON.parse(await readFile(file,'utf8')),next);
    const third=extend(next);
    third.bars[10].close+=0.01;
    await assert.rejects(writeReviewedMarketDataset(file,third),/revised or removed/);
    assert.deepEqual(JSON.parse(await readFile(file,'utf8')),next);
    third.bars[10].close=next.bars[10].close;
    third.symbol='WRONG';
    await assert.rejects(writeReviewedMarketDataset(file,third),/identity/);
    assert.deepEqual(JSON.parse(await readFile(file,'utf8')),next);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('locked or invalid prior source is preserved without partial writes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-reviewed-market-'));
  try{
    const file=join(dir,'SIM09.json'),dataset=buildDemoDataset('SIM09');
    await writeFile(file+'.lock','other local writer');
    await assert.rejects(writeReviewedMarketDataset(file,dataset),/locked/);
    await rm(file+'.lock');
    await writeFile(file,'{corrupt JSON');
    await assert.rejects(writeReviewedMarketDataset(file,dataset),/unreadable or invalid/);
    assert.equal(await readFile(file,'utf8'),'{corrupt JSON');
  }finally{await rm(dir,{recursive:true,force:true});}
});
