import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {MARKET_DATA_SCHEMA} from '../src/market-intelligence.mjs';
import {analyzeMarketRegimeWindows} from '../src/market-regime-research.mjs';
import {analyzeLocalRegimeFiles} from '../scripts/research-market-regimes.mjs';

function syntheticDataset(symbol='SIMX',drift=0.01,count=130){
  const bars=[];const day=new Date('2026-01-01T00:00:00.000Z');
  let prev=100;
  while(bars.length<count){
    day.setUTCDate(day.getUTCDate()+1);
    if(day.getUTCDay()===0||day.getUTCDay()===6)continue;
    const close=Number((prev*(1+drift)).toFixed(6));
    const open=prev;
    bars.push({date:day.toISOString().slice(0,10),open,
      high:Number((Math.max(open,close)*1.005).toFixed(6)),
      low:Number((Math.min(open,close)*0.995).toFixed(6)),
      close,volume:100000});
    prev=close;
  }
  return {schema:MARKET_DATA_SCHEMA,symbol,currency:'USD',
    source:'Authored synthetic historical fixture',mode:'HISTORICAL',
    sourceAsOf:bars.at(-1).date,priceAdjustment:'RAW',bars};
}
const entry=data=>({data,filename:data.symbol+'.json',sha256:'a'.repeat(64)});
test('synthetic upward/downward/flat regimes are deterministic and non-executable',()=>{
  const up=syntheticDataset('UP',0.01),down=syntheticDataset('DOWN',-0.01),flat=syntheticDataset('FLAT',0);
  const report=analyzeMarketRegimeWindows([entry(up),entry(down),entry(flat)],{reviewDate:up.sourceAsOf});
  assert.equal(report.datasetCount,3);
  assert.equal(report.tradeOrdersCreated,false);
  assert.equal(report.realWorldAccuracyVerified,false);
  assert.equal(report.results.find(r=>r.symbol==='UP').conditionCounts.HISTORICAL_RISING,4);
  assert.equal(report.results.find(r=>r.symbol==='DOWN').conditionCounts.HISTORICAL_FALLING,4);
  assert.equal(report.results.find(r=>r.symbol==='FLAT').conditionCounts.HISTORICAL_RANGE_LIKE,4);
  const windows=report.results[0].windows;
  assert.ok(windows.every(w=>w.startDate<=w.endDate&&w.scannerAtWindowEnd.asOf===w.endDate));
  assert.equal(report.results[0].excludedTrailingCompletedBars,0);
});
test('a historical window is prefix-stable as later synthetic bars are added',()=>{
  const full=syntheticDataset(),short={...full,bars:full.bars.slice(0,90)};
  short.sourceAsOf=short.bars.at(-1).date;
  const left=analyzeMarketRegimeWindows([entry(full)],{reviewDate:full.sourceAsOf});
  const right=analyzeMarketRegimeWindows([entry(short)],{reviewDate:short.sourceAsOf});
  assert.deepEqual(left.results[0].windows.slice(0,2),right.results[0].windows);
});
test('insufficient full research windows are explicitly labeled, not fabricated',()=>{
  const data=syntheticDataset('SHORT',0.001,60);
  const report=analyzeMarketRegimeWindows([entry(data)],{reviewDate:data.sourceAsOf});
  assert.equal(report.results[0].historicalWindowCount,0);
  assert.ok(report.results[0].reviewReasons.includes('INSUFFICIENT_FULL_HISTORICAL_WINDOWS'));
});
test('invalid review dates, future source data and window sizes are rejected',()=>{
  const data=syntheticDataset();
  assert.throws(()=>analyzeMarketRegimeWindows([entry(data)],{reviewDate:'2026-01-01'}),/after review date/);
  assert.throws(()=>analyzeMarketRegimeWindows([entry(data)],{reviewDate:data.sourceAsOf,windowBars:0}),/Window length/);
  assert.throws(()=>analyzeMarketRegimeWindows([entry(data)],{reviewDate:data.sourceAsOf,windowBars:12.5}),/Window length/);
});
test('CLI reader keeps source bytes unchanged and records their SHA-256',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-regimes-'));
  try{
    const data=syntheticDataset(),file=join(dir,'test.json'),bytes=JSON.stringify(data);
    await writeFile(file,bytes);
    const result=await analyzeLocalRegimeFiles([file],data.sourceAsOf,20);
    assert.equal(result.results[0].fileSha256,createHash('sha256').update(bytes).digest('hex'));
    assert.equal(result.results[0].historicalWindowCount,4);
  }finally{await rm(dir,{recursive:true,force:true});}
});
