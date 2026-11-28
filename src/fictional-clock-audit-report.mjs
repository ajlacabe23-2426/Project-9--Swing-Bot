// Offline, script-free classroom report. No market data or transaction features.
import {inspectClockEvidence} from './fictional-clock-evidence-audit.mjs';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statuses=new Map([
  ['VERIFIED_FIXTURE','Verified fixture'],
  ['INVALID_EVIDENCE','Invalid evidence'],
  ['INTERRUPTED_OR_ACTIVE_WRITE','Interrupted or active write'],
  ['UNEXPECTED_ENTRY','Unexpected entry']
]);
export async function renderClockAuditReport(directory){
  const audit=await inspectClockEvidence(directory);
  const count=state=>audit.records.filter(r=>r.status===state).length;
  const rows=audit.records.map(r=>'<tr><td><code>'+escape(r.name)+'</code></td><td>'+
    escape(statuses.get(r.status)??'Unknown')+'</td></tr>').join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">'+
    '<title>Classroom replay evidence audit</title><style>'+
    'body{font:16px system-ui,sans-serif;max-width:64rem;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#16232c;background:#fafafa}'+
    'h1,h2{line-height:1.25}dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(8rem,1fr));gap:1rem}'+
    'dl div{padding:1rem;background:white;border:1px solid #bac5cc;border-radius:.5rem}dd{margin:0;font-size:1.5rem;font-weight:700}'+
    'table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{text-align:left;border-bottom:1px solid #bac5cc;padding:.65rem;overflow-wrap:anywhere}'+
    'caption{text-align:left}code{overflow-wrap:anywhere} .notice{border-left:4px solid #657581;padding-left:1rem}'+
    '</style></head><body><main><h1>Classroom replay evidence audit</h1>'+
    '<p class="notice">Invented non-financial sensor observations only. Read-only inspection; no external connections or transactions.</p>'+
    '<h2>Integrity: '+(audit.reviewRequired?'Review required':'Observed records match fixtures')+'</h2>'+
    '<dl><div><dt>Verified</dt><dd>'+audit.verified+'</dd></div>'+
    '<div><dt>Invalid</dt><dd>'+count('INVALID_EVIDENCE')+'</dd></div>'+
    '<div><dt>Pending</dt><dd>'+count('INTERRUPTED_OR_ACTIVE_WRITE')+'</dd></div>'+
    '<div><dt>Unexpected</dt><dd>'+count('UNEXPECTED_ENTRY')+'</dd></div></dl>'+
    '<p>Verified scenario coverage: '+audit.verified+' of 4 built-in fixtures. Record integrity does not establish full scenario coverage.</p>'+
    '<h2>Observed files</h2><table><caption>Local inspection results</caption><thead><tr><th scope="col">File</th><th scope="col">Status</th></tr></thead>'+
    '<tbody>'+(rows||'<tr><td colspan="2">No evidence found.</td></tr>')+'</tbody></table>'+
    '<p>Inspection is not an atomic snapshot. Pending writes are preserved; a pending file may belong to an active process. Hashes do not authenticate authors or prove power-loss durability.</p>'+
    '</main></body></html>\n';
}
