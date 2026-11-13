import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDemoDataset} from '../scripts/seed-workstation-demo.mjs';
import {analyzeDailyBreakout} from '../src/daily-breakout-research.mjs';
import {auditPaperForward} from '../scripts/paper-forward-audit.mjs';
import {inspectDailyBreakoutFiles} from '../scripts/research-daily-breakout.mjs';
import {auditLocalPaperForwardFiles} from '../scripts/paper-forward-audit.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const engines=[
  ['daily', (data,opts)=>analyzeDailyBreakout(data,opts),49],
  ['scanner', (data,opts)=>auditPaperForward(data,{asOf:data.sourceAsOf,...opts}),50]
];
function fixture(exit,index,h=5){
  const data=buildDemoDataset('SIM09');
  data.bars[index+1].open=100;
  data.bars[index+1].low=99;
  data.bars[index+h].close=exit;
  data.bars[index+h].low=Math.min(89,exit);
  data.bars[index+h].high=Math.max(140,exit);
  return data;
}
for(const [name,run,index] of engines){
  test(`${name}: actual engine exposes cash and reference returns for wins, losses, flat`,()=>{
    for(const [exit,net] of [[110,7.9],[90,-11.9],[100,-2]]){
      const report=run(fixture(exit,index),{feeBps:100,slippageBps:0});
      const o=report.outcomes[0];
      near(o.returns.netPLPerUnit,net);
      near(o.returns.referenceReturnPct,net);
      near(o.returns.cashOutlayReturnPct,100*net/101);
      assert.equal(report.returnContract.basis,'ENTRY_CASH_OUTLAY');
    }
  });
  test(`${name}: fee/slippage grid satisfies basis identity including losses`,()=>{
    for(const exit of [90,100,110])for(const feeBps of [0,10,20,40,250]){
      for(const slippageBps of [0,10,20,40,250]){
        const o=run(fixture(exit,index),{feeBps,slippageBps}).outcomes[0];
        const e=100*(1+slippageBps/10000),x=exit*(1-slippageBps/10000);
        const net=x*(1-feeBps/10000)-e*(1+feeBps/10000);
        near(o.returns.netPLPerUnit,net);
        near(o.returns.referenceReturnPct,(1+feeBps/10000)*o.returns.cashOutlayReturnPct);
      }
    }
  });
  test(`${name}: horizons, complete boundary, censored tail and invalid horizons`,()=>{
    for(const h of [1,3,5,30]){
      const data=buildDemoDataset('SIM09');
      const asOf=data.bars[index+h].date;
      const report=run(data,{holdingBars:h,asOf});
      assert.equal(report.outcomes.length,1);
      const o=report.outcomes[0];
      assert.deepEqual(o.window,{signalIndex:index,entryIndex:index+1,exitIndex:index+h,
        signalDate:data.bars[index].date,entryDate:data.bars[index+1].date,
        exitDate:asOf,holdingBars:h});
      assert.match(report.windowDefinition.exitReference,new RegExp(String(h)));
      if(index+h-1>=51||name==='daily'){
        assert.equal(run(data,{holdingBars:h,asOf:data.bars[index+h-1].date}).outcomes.length,0);
      }
    }
    for(const holdingBars of [0,31,1.5,NaN]){
      assert.throws(()=>run(buildDemoDataset('SIM09'),{holdingBars}),/holdingBars/);
    }
  });
  test(`${name}: empty results stay null; metadata does not hide provenance`,()=>{
    const report=run(buildDemoDataset('SIM10'),{});
    assert.equal(report.outcomes.length,0);
    assert.equal(report.meanCashOutlayReturnPct,null);
    assert.equal(report.meanEntryReferenceReturnPct,null);
    assert.equal(report.dataQuality.verification.dataAuthenticityVerified,false);
    assert.ok(report.dataQuality.provenanceReview.reasons.length>0);
  });
}

test('identities preserve distinct rules/start offsets and expose real window tuples',()=>{
  const data=buildDemoDataset('SIM09');
  const daily=analyzeDailyBreakout(data),scanner=auditPaperForward(data,{asOf:data.sourceAsOf});
  assert.notEqual(daily.strategy,scanner.strategy);
  assert.equal(daily.windowDefinition.firstSignalIndex,49);
  assert.equal(scanner.windowDefinition.firstSignalIndex,50);
  assert.equal(daily.outcomes.length,14);
  assert.equal(scanner.outcomes.length,13);
  assert.notDeepEqual(daily.outcomes.map(o=>o.window),scanner.outcomes.map(o=>o.window));
});

test('both research seams reject reviews after declared source availability',()=>{
  const data=buildDemoDataset('SIM09');
  for(const [,run] of engines){
    assert.throws(()=>run(data,{asOf:'2026-02-17'}),/source-as-of/);
  }
});

test('actual tuple intersection separates arithmetic from unmatched strategy windows',()=>{
  const data=buildDemoDataset('SIM09');
  for(const h of [1,3,5,30]){
    const daily=analyzeDailyBreakout(data,{holdingBars:h});
    const scanner=auditPaperForward(data,{asOf:data.sourceAsOf,holdingBars:h});
    const key=o=>JSON.stringify(o.window);
    const byTuple=new Map(daily.outcomes.map(o=>[key(o),o]));
    const common=scanner.outcomes.filter(o=>byTuple.has(key(o)));
    for(const o of common)assert.deepEqual(o.returns,byTuple.get(key(o)).returns);
    if(h===1)assert.ok(common.length>0);
    if(h===5)assert.equal(common.length,0);
  }
});

test('both file entry points bind deterministic manifests to input bytes and engine identity',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-return-identity-'));
  try{
    const data=buildDemoDataset('SIM09'),path=join(dir,'input.json');
    const bytes=JSON.stringify(data);
    await writeFile(path,bytes);
    for(const run of [inspectDailyBreakoutFiles,auditLocalPaperForwardFiles]){
      const first=(await run([path],{asOf:data.sourceAsOf})).results[0];
      const second=(await run([path],{asOf:data.sourceAsOf})).results[0];
      assert.equal(first.manifestSha256,second.manifestSha256);
      assert.equal(first.manifestSha256,createHash('sha256').update(JSON.stringify(first.manifest)).digest('hex'));
      assert.equal(first.manifest.inputSha256,createHash('sha256').update(bytes).digest('hex'));
      assert.match(first.manifest.sourceSha,/^[a-f0-9]{40}$/);
      assert.ok(first.manifest.engineSha256['src/research-return-contract.mjs']);
      assert.deepEqual(first.manifest.windows,first.outcomes.map(o=>o.window));
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});

// These are fail-closed checks: JSON must never silently serialize NaN/Infinity as null.
for(const [name,run] of engines){
  test(`${name}: overflowing upstream indicators fail before classification`,()=>{
    const data=buildDemoDataset('SIM09');
    for(const bar of data.bars){
      bar.open=1e308;bar.high=1.1e308;bar.low=9e307;bar.close=1e308;
    }
    assert.throws(()=>run(data,{}),/indicators must remain finite/);
  });
}

test('return helper rejects invalid values and unrepresentable arithmetic', async()=>{
  const {modeledReturns,meanReturn}=await import('../src/research-return-contract.mjs');
  for(const value of [NaN,Infinity,-Infinity,0,-1,'100',null]){
    assert.throws(()=>modeledReturns(value,110,{feeBps:10,slippageBps:10}),/finite|positive/);
    assert.throws(()=>modeledReturns(100,value,{feeBps:10,slippageBps:10}),/finite|positive/);
  }
  for(const value of [NaN,Infinity,-1,251,'10',null]){
    assert.throws(()=>modeledReturns(100,110,{feeBps:value,slippageBps:10}),/basis points/);
    assert.throws(()=>modeledReturns(100,110,{feeBps:10,slippageBps:value}),/basis points/);
  }
  assert.throws(()=>modeledReturns(Number.MIN_VALUE,Number.MAX_VALUE,{feeBps:0,slippageBps:0}),/finite/);
  assert.throws(()=>modeledReturns(Number.MAX_VALUE,100,{feeBps:250,slippageBps:250}),/finite/);
  // Divide before scaling: a representable return must not fail due to 100 * PL overflow.
  near(modeledReturns(1e307,2e307,{feeBps:0,slippageBps:0}).cashOutlayReturnPct,100);
  assert.throws(()=>meanReturn([{returns:{x:NaN}}],'x'),/finite/);
  assert.equal(meanReturn([{returns:{x:1e308}},{returns:{x:1e308}}],'x'),1e308);
});

for(const [name,run,index] of engines){
  test(`${name}: actual engine refuses an overflowing outcome instead of emitting null`,()=>{
    const data=fixture(Number.MAX_VALUE,index);
    data.bars[index+5].high=Number.MAX_VALUE;
    data.bars[index+1].open=Number.MIN_VALUE;
    data.bars[index+1].low=Number.MIN_VALUE;
    assert.throws(()=>run(data,{feeBps:0,slippageBps:0}),/finite/);
  });
}

test('file manifests retain full dataset declarations and report schema',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p9-manifest-declarations-'));
  try{
    const data=buildDemoDataset('SIM09'),path=join(dir,'input.json');
    await writeFile(path,JSON.stringify(data));
    for(const run of [inspectDailyBreakoutFiles,auditLocalPaperForwardFiles]){
      const result=(await run([path],{asOf:data.sourceAsOf})).results[0];
      assert.equal(result.manifest.reportSchema,result.schema);
      assert.deepEqual(result.manifest.datasetIdentity,{
        symbol:data.symbol,currency:data.currency,source:data.source,mode:data.mode,
        sourceAsOf:data.sourceAsOf,priceAdjustment:data.priceAdjustment
      });
      assert.deepEqual(result.manifest.dataQuality,result.dataQuality);
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('manifest commit identity detects dirty, untracked and ignored engine bytes',async()=>{
  const {execFileSync}=await import('node:child_process');
  const {committedEngineMatches}=await import('../src/research-manifest.mjs');
  const dir=await mkdtemp(join(tmpdir(),'p9-commit-identity-'));
  const digest=value=>createHash('sha256').update(value).digest('hex');
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  try{
    git('init');
    await writeFile(join(dir,'engine.mjs'),'original');
    await writeFile(join(dir,'.gitignore'),'ignored.mjs\n');
    git('add','.');
    git('-c','user.name=Test','-c','user.email=test@example.invalid','-c','commit.gpgsign=false','commit','-m','fixture');
    const sha=git('rev-parse','HEAD');
    assert.equal(committedEngineMatches(dir,sha,{'engine.mjs':digest('original')}),true);
    await writeFile(join(dir,'engine.mjs'),'changed');
    assert.equal(committedEngineMatches(dir,sha,{'engine.mjs':digest('changed')}),false);
    for(const path of ['untracked.mjs','ignored.mjs']){
      await writeFile(join(dir,path),'new');
      assert.equal(committedEngineMatches(dir,sha,{[path]:digest('new')}),false);
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});
