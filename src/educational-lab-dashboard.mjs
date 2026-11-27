import {reportFictionalExperiments} from './educational-lab-report.mjs';

// Standalone, local, script-free educational report. No network or account features.
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>value===null?'Not observed':esc(value);
const indexes=values=>values.length?esc(values.join(', ')):'None';

export function renderFictionalLabDashboard(root){
  const r=reportFictionalExperiments(root);
  const cards=[
    ['Saved record versions',r.recordCount],['Complete versions',r.completeCount],
    ['Incomplete versions',r.incompleteCount],['Failed observations',r.failedObservationCount],
    ['Missing observations',r.missingObservationCount],['Unreadable entries',r.unreadable.length]
  ].map(([label,value])=>'<div class="card"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');
  const records=r.records.map(x=>'<details><summary>'+esc(x.experimentId)+' — '+esc(x.status)+'</summary>'+
    '<dl><dt>Observed / planned</dt><dd>'+esc(x.observedCount)+' / '+esc(x.plannedCount)+'</dd>'+
    '<dt>Mean length (mm)</dt><dd>'+number(x.mean)+'</dd><dt>Minimum (mm)</dt><dd>'+number(x.min)+'</dd>'+
    '<dt>Maximum (mm)</dt><dd>'+number(x.max)+'</dd><dt>Failed indexes</dt><dd>'+indexes(x.failed)+'</dd>'+
    '<dt>Missing indexes</dt><dd>'+indexes(x.missing)+'</dd><dt>Record fingerprint</dt><dd class="hash">'+esc(x.fingerprint)+'</dd></dl></details>').join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">'+
    '<title>Fictional laboratory evidence</title><style>'+
    'body{margin:0;background:#101827;color:#e9eef7;font:16px/1.55 system-ui,sans-serif}main{max-width:960px;margin:auto;padding:24px}h1{font-size:clamp(24px,5vw,40px);line-height:1.2}h2{font-size:22px}.muted{color:#b5c3d9}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.card,details,.notice{background:#1b2940;border:1px solid #344562;border-radius:10px;padding:16px}.card strong{display:block;font-size:30px}.card span{color:#b5c3d9}details{margin:10px 0}summary{cursor:pointer;font-weight:650}summary:focus-visible{outline:2px solid #80c9ff}dt{font-weight:600;margin-top:8px}dd{margin-left:0;overflow-wrap:anywhere}.hash{font:13px monospace}.notice{border-color:#d6ad64}</style></head><body><main>'+
    '<p class="muted">STARNET / EDUCATIONAL LAB</p><h1>Experiment evidence dashboard</h1>'+
    '<p>Fictional, non-financial length measurements. Record completeness does not establish scientific validity.</p>'+
    '<div class="notice"><strong>'+esc(r.status)+'</strong><p>Pending entries: '+r.pending.length+
    ' · Unrecognized entries: '+r.unrecognized.length+' · Unreadable entries: '+r.unreadable.length+'</p>'+
    '<p>Directory scans are not guaranteed to be point-in-time snapshots. Counts are saved versions, not independent experiments.</p></div>'+
    '<h2>Registry overview</h2><div class="grid">'+cards+'</div><h2>Saved records</h2>'+
    (records||'<p>No readable saved records.</p>')+'</main></body></html>';
}
