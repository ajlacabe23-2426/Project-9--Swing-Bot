import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {auditPaperForward,auditLocalPaperForwardFiles} from '../scripts/paper-forward-audit.mjs';

function synthetic(symbol='UP',drift=0.01,count=130){
  const bars=[],day=new Date('2026-01-01T00:00:00.000Z');
  let previous=100;
  while(bars.length<count){
    day.setUTCDate(day.getUTCDate()+1);
    if([0,6].includes(day.getUTCDay()))continue;
    const close=Number((previous*(1+drift)).toFixed(6));
    const open=previous;
    bars.push({date:day.toISOString().slice(0,10),open,
      high:Number((Math.max(open,close)*1.005).toFixed(6)),
      low:Number((Math.min(open,close)*0.995).toFixed(6)),
      close,volume:100_000});
    previous=close;
  }
  return {schema:'project9-market-data-v1',symbol,currency:'USD',
    source:'Authored artificial research fixture',mode:'HISTORICAL',
    sourceAsOf:bars.at(-1).date,priceAdjustment:'RAW',bars};
}

test('historical scans generate only nonoverlapping, hypothetical outcomes',()=>{
  const data=synthetic(),report=auditPaperForward(data,{asOf:data.sourceAsOf,holdingBars:5});
  assert.ok(report.closedHypotheticalObservations>0);
  assert.equal(report.safety.realOrdersCreated,false);
  assert.equal(report.safety.brokerConnected,false);
  assert.equal(report.safety.outcomeDataUsedInSignalClassification,false);
  for(let i=0;i<report.outcomes.length;i++){
    const o=report.outcomes[i];
    assert.ok(o.signalDate<o.simulatedEntryDate);
    assert.ok(o.simulatedEntryDate<=o.simulatedExitDate);
    if(i>0)assert.ok(report.outcomes[i-1].simulatedExitDate<=o.signalDate);
    assert.ok(Number.isFinite(o.modeledNetChangePct));
  }
});

test('negative trend may produce no setups without fabricated winning rate',()=>{
  const data=synthetic('FALL',-0.01);
  const report=auditPaperForward(data,{asOf:data.sourceAsOf});
  assert.equal(report.closedHypotheticalObservations,0);
  assert.equal(report.positiveOutcomeRatePct,null);
  assert.equal(report.meanModeledNetChangePct,null);
});

test('later completed bars do not change earlier research outcomes',()=>{
  const data=synthetic();
  const asOf=data.bars[99].date;
  const baseline=auditPaperForward(data,{asOf});
  const modified=structuredClone(data);
  for(let i=100;i<modified.bars.length;i++){
    const b=modified.bars[i];
    b.open*=1.4;b.high*=1.4;b.low*=1.4;b.close*=1.4;
  }
  assert.deepEqual(auditPaperForward(modified,{asOf}),baseline);
});

test('explicit data and cost bounds reject unsafe or incomplete input',()=>{
  const data=synthetic();
  assert.throws(()=>auditPaperForward(data,{asOf:'2026-01-20'}),/52 completed bars/);
  assert.throws(()=>auditPaperForward(data,{asOf:data.sourceAsOf,holdingBars:0}),/holdingBars/);
  assert.throws(()=>auditPaperForward(data,{asOf:data.sourceAsOf,feeBps:-1}),/basis points/);
  assert.throws(()=>auditPaperForward(data,{asOf:data.sourceAsOf,slippageBps:500}),/basis points/);
});

test('local audit links output to exact input byte SHA without writing to disk',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'paper-forward-'));
  try{
    const data=synthetic(),file=join(dir,'up.json'),bytes=JSON.stringify(data);
    await writeFile(file,bytes);
    const report=await auditLocalPaperForwardFiles([file],{asOf:data.sourceAsOf});
    assert.equal(report.datasetCount,1);
    assert.equal(report.realOrdersCreated,false);
    assert.equal(report.results[0].fileSha256,createHash('sha256').update(bytes).digest('hex'));
    await assert.rejects(
      auditLocalPaperForwardFiles([file,file],{asOf:data.sourceAsOf}),
      /Duplicate market symbol/
    );
  }finally{await rm(dir,{recursive:true,force:true});}
});
