// Interpret Node's explicit TAP summary for non-financial classroom QA.
const fields=['tests','pass','fail','cancelled','skipped','todo'];
export function assessClassroomTestResult(run){
  const counts={};
  for(const line of String(run.stdout??'').split(/\r?\n/)){
    const m=/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/.exec(line);
    if(!m)continue;
    const key=m[1],value=Number(m[2]);
    if(Object.hasOwn(counts,key)||!Number.isSafeInteger(value))
      return {result:'FAIL',counts:null,reason:'Invalid or repeated TAP summary'};
    counts[key]=value;
  }
  if(run.error||run.status!==0||run.signal)
    return {result:'FAIL',counts:null,reason:'Test process did not exit successfully'};
  if(!fields.every(k=>Object.hasOwn(counts,k)))
    return {result:'INCOMPLETE',counts:null,reason:'Required TAP counts missing'};
  if(counts.tests!==counts.pass+counts.fail+counts.cancelled+counts.skipped+counts.todo)
    return {result:'FAIL',counts,reason:'Inconsistent TAP counts'};
  if(counts.fail||counts.cancelled)
    return {result:'FAIL',counts,reason:'Failed or cancelled tests'};
  if(!counts.tests||counts.skipped||counts.todo)
    return {result:'INCOMPLETE',counts,reason:'Required tests not executed'};
  return {result:'PASS',counts,reason:null};
}
