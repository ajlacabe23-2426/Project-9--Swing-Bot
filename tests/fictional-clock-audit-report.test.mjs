import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {saveClockEvidence} from '../src/fictional-clock-replay.mjs';
import {renderClockAuditReport} from '../src/fictional-clock-audit-report.mjs';

test('report separates observed integrity from complete fixture coverage',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'clock-report-'));
  try{
    let html=await renderClockAuditReport(dir);
    assert.match(html,/Review required/);
    assert.match(html,/0 of 4/);
    assert.match(html,/Descriptive statistics classroom examples/);
    for(const section of ['integrity','files','statistics']){
      assert.ok(html.includes('href="#'+section+'"'));
      assert.ok(html.includes('id="'+section+'"'));
    }
    assert.match(html,/aria-label="Report sections"/);
    assert.match(html,/70 of 72 unique readings/);
    assert.match(html,/independently of which local files are verified/);
    assert.match(html,/not independent random samples, forecasts or causal evidence/);
    await saveClockEvidence(dir,'complete');
    html=await renderClockAuditReport(dir);
    assert.match(html,/Observed records match fixtures/);
    assert.match(html,/1 of 4/);
    for(const scenario of ['gap','duplicate','reversed'])await saveClockEvidence(dir,scenario);
    html=await renderClockAuditReport(dir);
    assert.match(html,/4 of 4/);
    assert.match(html,/not an atomic snapshot/);
    assert.doesNotMatch(html,/<script|<iframe|<link|<img/i);
    assert.equal(html,await renderClockAuditReport(dir));
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('unexpected local filenames are escaped and evidence remains unchanged',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'clock-report-escape-'));
  try{
    const name='evil<img src=x onerror=alert(1)>';
    await writeFile(join(dir,name),'unchanged');
    await writeFile(join(dir,'.pending-example'),'partial');
    const before=await readdir(dir);
    const html=await renderClockAuditReport(dir);
    assert.match(html,/evil&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(html,/<img/i);
    assert.match(html,/Interrupted or active write/);
    assert.match(html,/Unexpected entry/);
    assert.deepEqual(await readdir(dir),before);
    assert.equal(await readFile(join(dir,name),'utf8'),'unchanged');
  }finally{await rm(dir,{recursive:true,force:true});}
});
