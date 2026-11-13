import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {convertAuthorizedMarketCSV} from '../src/market-csv-import.mjs';
import {normalizeMarketDataset} from '../src/market-intelligence.mjs';
import {analyzeDailyBreakout} from '../src/daily-breakout-research.mjs';
import {importLocalMarketCSV} from '../scripts/import-market-csv.mjs';

const config={symbol:'SYN1',source:'Locally authored synthetic fixture',
  retrievedAt:'2026-11-04T00:00:00Z',confirmedResearchPermission:true};
function csv(count=65){
  const dates=[];const date=new Date('2026-01-01T00:00:00.000Z');
  while(dates.length<count){
    date.setUTCDate(date.getUTCDate()+1);
    if(date.getUTCDay()===0||date.getUTCDay()===6)continue;
    dates.push(date.toISOString().slice(0,10));
  }
  return 'date,open,high,low,close,volume\n'+
    dates.map((d,i)=>[d,100+i,102+i,99+i,101+i,100000+i].join(',')).join('\n')+'\n';
}
test('authorized synthetic CSV becomes conservative, auditable v2 contract',()=>{
  const d=convertAuthorizedMarketCSV(csv(),config);
  assert.equal(d.schema,'project9-market-data-v2');
  assert.equal(d.bars.length,65);
  assert.equal(d.priceAdjustment,'UNKNOWN');
  assert.equal(d.provenance.corporateActions,'NOT_VERIFIED');
  assert.equal(d.provenance.licensing,'USER_ASSERTED_PERMITTED');
  assert.equal(Object.hasOwn(d.provenance,'contract'),false);
  assert.doesNotThrow(()=>normalizeMarketDataset(d));
  assert.equal(analyzeDailyBreakout(d).schema,'project9-locked-daily-breakout-research-v2');
});
test('unknown rights, invalid prices and duplicate history are rejected',()=>{
  assert.throws(()=>convertAuthorizedMarketCSV(csv(),{...config,confirmedResearchPermission:false}),/permission/);
  assert.throws(()=>convertAuthorizedMarketCSV(csv().replace(',100,102,99,101,100000',',100,90,99,101,100000'),config),/inconsistent OHLC/);
  assert.throws(()=>convertAuthorizedMarketCSV(csv().replace('date,open,high,low,close,volume','date,open,high,low,close,close'),config),/columns/);
  const rows=csv().trim().split('\n');rows[2]=rows[1];
  assert.throws(()=>convertAuthorizedMarketCSV(rows.join('\n'),config),/unique and strictly ascending/);
  assert.throws(()=>convertAuthorizedMarketCSV(csv(),{...config,retrievedAt:'2025-01-01T00:00:00Z'}),/cannot precede/);
});
test('import produces private file with hashes and never overwrites previous output',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-csv-'));
  try{
    const input=join(dir,'bars.csv'),output=join(dir,'dataset.json');
    await writeFile(input,csv());
    const receipt=await importLocalMarketCSV({input,output,...config});
    const contents=await readFile(output,'utf8');
    assert.equal(receipt.symbol,'SYN1');
    const parsed=JSON.parse(contents);
    assert.equal(parsed.bars.length,65);
    assert.equal(Object.hasOwn(parsed.provenance,'contract'),false);
    assert.equal(analyzeDailyBreakout(parsed).symbol,'SYN1');
    assert.match(receipt.sourceCsvSha256,/^[0-9a-f]{64}$/);
    await assert.rejects(importLocalMarketCSV({input,output,...config}),{code:'EEXIST'});
    assert.equal(await readFile(output,'utf8'),contents);
  }finally{await rm(dir,{recursive:true,force:true});}
});
