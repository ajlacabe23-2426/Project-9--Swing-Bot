import {loadFictionalExperiment} from './educational-lab-registry.mjs';
import {compareFictionalExperiments} from './educational-lab-comparison.mjs';
import {reportFictionalExperiments} from './educational-lab-report.mjs';

// Standalone, local, script-free educational report. No network or account features.
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>value===null?'Not observed':esc(value);
const indexes=values=>values.length?esc(values.join(', ')):'None';

export function renderFictionalLabDashboard(root,comparisonFingerprints=[]){
  if(!Array.isArray(comparisonFingerprints)||![0,2].includes(comparisonFingerprints.length))throw new TypeError('Select exactly two versions');
  const comparison=comparisonFingerprints.length?compareFictionalExperiments(...comparisonFingerprints.map(h=>loadFictionalExperiment(root,h).record)):null;
  const r=reportFictionalExperiments(root);
  const cards=[
    ['Saved record versions',r.recordCount],['Complete versions',r.completeCount],
    ['Incomplete versions',r.incompleteCount],['Failed observations',r.failedObservationCount],
    ['Missing observations',r.missingObservationCount],['Unreadable entries',r.unreadable.length]
  ].map(([label,value])=>'<div class="card"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');
  const records=r.records.map(x=>'<details><summary>'+esc(x.experimentId)+' — '+esc(x.status)+'</summary>'+
    '<dl><dt>Observed / planned</dt><dd>'+esc(x.observedCount)+' / '+esc(x.plannedCount)+'</dd>'+
    '<dt>Mean length (mm)</dt><dd>'+number(x.mean)+'</dd><dt>Minimum (mm)</dt><dd>'+number(x.min)+'</dd>'+
    '<dt>Median (mm)</dt><dd>'+number(x.median)+'</dd><dt>Sample standard deviation (mm)</dt><dd>'+number(x.sampleStandardDeviation)+'</dd>'+
    '<dt>Evidence completeness</dt><dd><meter min="0" max="'+x.plannedCount+'" value="'+x.observedCount+'" aria-label="Observed measurements for '+esc(x.experimentId)+'"></meter> '+x.observedCount+' of '+x.plannedCount+'</dd>'+
    '<dt>Recorded at (declared UTC)</dt><dd>'+esc(x.recordedAt??'Not recorded (legacy schema)')+'</dd>'+
    '<dt>Maximum (mm)</dt><dd>'+number(x.max)+'</dd><dt>Failed indexes</dt><dd>'+indexes(x.failed)+'</dd>'+
    '<dt>Missing indexes</dt><dd>'+indexes(x.missing)+'</dd><dt>Record fingerprint</dt><dd class="hash">'+esc(x.fingerprint)+'</dd><dt>Limitations</dt><dd>'+x.limitations.map(esc).join(' · ')+'</dd></dl><div class="table-wrap"><table><caption>Saved observations</caption><thead><tr><th scope="col">Index</th><th scope="col">Status</th><th scope="col">Length (mm)</th><th scope="col">Declared UTC</th></tr></thead><tbody>'+x.observations.map(o=>'<tr><th scope="row">'+o.index+'</th><td>'+o.status+'</td><td>'+number(o.value)+'</td><td>'+esc(o.observedAt??'Not recorded')+'</td></tr>').join('')+'</tbody></table></div></details>').join('');
  const compareValue=o=>o?esc(o.status)+(o.value===null?'':' · '+number(o.value)+' mm')+(o.observedAt?' · '+esc(o.observedAt):''):'Absent';
  const comparisonHtml=comparison?'<h2>Selected version comparison</h2><p>A and B are caller-selected versions. Neither chronology nor scientific improvement is verified.</p><dl><dt>A fingerprint</dt><dd class="hash">'+esc(comparison.before.fingerprint)+'</dd><dt>B fingerprint</dt><dd class="hash">'+esc(comparison.after.fingerprint)+'</dd><dt>Planned count A / B</dt><dd>'+comparison.before.plannedCount+' / '+comparison.after.plannedCount+'</dd><dt>Schema changed</dt><dd>'+comparison.schemaChanged+'</dd><dt>Recorded time changed</dt><dd>'+comparison.recordedAtChanged+'</dd></dl><div class="table-wrap"><table><caption>Observation differences</caption><thead><tr><th scope="col">Index</th><th scope="col">Change</th><th scope="col">A</th><th scope="col">B</th></tr></thead><tbody>'+comparison.changes.map(c=>'<tr><th scope="row">'+c.index+'</th><td>'+c.kind+'</td><td>'+compareValue(c.before)+'</td><td>'+compareValue(c.after)+'</td></tr>').join('')+'</tbody></table></div><p>'+comparison.changes.length+' observation differences. Identical normalized content: '+comparison.identical+'.</p>':'<h2>Compare saved versions</h2><p>Render with --compare followed by two record fingerprints to inspect exact changes without modifying either version.</p>';
  const diagnostics=r.diagnostics.map(d=>'<li><code>'+esc(d.fingerprint)+'</code>: '+esc(d.code)+'</li>').join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">'+
    '<title>Fictional laboratory evidence</title><style>'+
    '*,*::before,*::after{box-sizing:border-box}body{margin:0;background:#101827;color:#e9eef7;font:16px/1.55 system-ui,sans-serif}main{max-width:960px;margin:auto;padding:24px}h1{font-size:clamp(24px,5vw,40px);line-height:1.2}h2{font-size:22px}.muted{color:#b5c3d9}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.card,details,.notice{background:#1b2940;border:1px solid #344562;border-radius:10px;padding:16px}.card strong{display:block;font-size:30px}.card span{color:#b5c3d9}details{margin:10px 0}summary{cursor:pointer;font-weight:650}summary:focus-visible{outline:2px solid #80c9ff}dt{font-weight:600;margin-top:8px}dd{margin-left:0;overflow-wrap:anywhere}.hash{font:13px monospace}.notice{border-color:#d6ad64}meter{display:block;width:100%;height:24px;accent-color:#80c9ff}table{width:100%;border-collapse:collapse}td,th{padding:10px;text-align:left;border-bottom:1px solid #344562;overflow-wrap:anywhere}.table-wrap{overflow:auto}code{overflow-wrap:anywhere}summary{min-height:44px;overflow-wrap:anywhere}dl{overflow-wrap:anywhere}</style></head><body><main>'+
    '<p class="muted">STARNET / EDUCATIONAL LAB</p><h1>Experiment evidence dashboard</h1>'+
    '<p>Fictional, non-financial length measurements. Record completeness does not establish scientific validity.</p>'+
    '<div class="notice"><strong>'+esc(r.status)+'</strong><p>Pending entries: '+r.pending.length+
    ' · Unrecognized entries: '+r.unrecognized.length+' · Unreadable entries: '+r.unreadable.length+'</p>'+
    '<p>Directory scans are not guaranteed to be point-in-time snapshots. Counts are saved versions, not independent experiments.</p></div>'+
    '<h2>Registry overview</h2><div class="grid">'+cards+'</div><h2>Saved records</h2>'+
    (records||'<p>No readable saved records.</p>')+comparisonHtml+
    '<h2>How to read the statistics</h2><p>Mean is the sum divided by the observed count; median is the middle of sorted values. Sample variance divides squared deviations from the mean by n − 1; standard deviation is its square root. With fewer than two observations, sample variation is not available. Failed and missing observations are excluded, never treated as zero.</p><p>These are descriptive calculations on invented measurements. Independence, sampling design, causal effects and population conclusions are not established. A complete record is not a statistically significant result.</p>'+
    '<h2>Error diagnostics and recovery</h2><ul>'+diagnostics+'</ul><p>Pending writes remain preserved for inspection; they are not committed evidence. Preserve damaged files and restore from an independently retained valid backup. Re-render after writers stop for a stable review. Fingerprints detect changes against a known identity; they cannot authenticate authors or detect deletion of every copy.</p></main></body></html>';
}
