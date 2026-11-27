import {createHash} from 'node:crypto';

// Educational lab measurements only; no financial series or decisions.
export function summarizeFictionalLab(input){
  const timed=input?.schema==='educational-lab-v2';
  const timestamp=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
  const fail=()=>{throw new TypeError('Invalid fictional lab experiment');};
  const keys=(o,k)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===k.length&&k.every(x=>Object.hasOwn(o,x));
  const label=s=>typeof s==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(s);
  if(!keys(input,['schema','fictional','experimentId','instrument','plannedCount','observations',...(timed?['recordedAt']:[])])||
     !['educational-lab-v1','educational-lab-v2'].includes(input.schema)||input.fictional!==true||
     !label(input.experimentId)||input.instrument!=='FICTIONAL_LENGTH_MM'||
     !Number.isSafeInteger(input.plannedCount)||input.plannedCount<1||input.plannedCount>1000||
     !Array.isArray(input.observations)||input.observations.length>input.plannedCount)fail();
  if(timed&&!timestamp(input.recordedAt))fail();
  const records=[];
  let priorTime='';
  let prev=0;
  for(const o of input.observations){
    if(!keys(o,['index','status','value',...(timed?['observedAt']:[])])||!Number.isSafeInteger(o.index)||
       o.index<=prev||o.index>input.plannedCount||
       !['OBSERVED','FAILED'].includes(o.status))fail();
    if(o.status==='OBSERVED'&&(!Number.isSafeInteger(o.value)||o.value<0||o.value>1000000))fail();
    if(o.status==='FAILED'&&o.value!==null)fail();
    if(timed&&(!timestamp(o.observedAt)||o.observedAt<=priorTime||o.observedAt>input.recordedAt))fail();
    if(timed)priorTime=o.observedAt;
    prev=o.index;
    records.push({index:o.index,status:o.status,value:o.value,...(timed?{observedAt:o.observedAt}:{})});
  }
  const values=records.filter(o=>o.status==='OBSERVED').map(o=>o.value);
  const failed=records.filter(o=>o.status==='FAILED').map(o=>o.index);
  const present=new Set(records.map(o=>o.index));
  const missing=Array.from({length:input.plannedCount},(_,i)=>i+1).filter(i=>!present.has(i));
  const normalized={schema:input.schema,fictional:true,experimentId:input.experimentId,instrument:input.instrument,plannedCount:input.plannedCount,observations:records,...(timed?{recordedAt:input.recordedAt}:{})};
  const mean=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  const sorted=[...values].sort((a,b)=>a-b);
  const median=values.length?(sorted[Math.floor((values.length-1)/2)]+sorted[Math.floor(values.length/2)])/2:null;
  const sampleVariance=values.length>1?values.reduce((sum,x)=>sum+(x-mean)**2,0)/(values.length-1):null;
  return {schema:'educational-lab-summary-v1',experimentId:input.experimentId,fictional:true,
    fingerprint:createHash('sha256').update(JSON.stringify(normalized)).digest('hex'),
    plannedCount:input.plannedCount,observedCount:values.length,failed,missing,
    mean,median,sampleVariance,sampleStandardDeviation:sampleVariance===null?null:Math.sqrt(sampleVariance),
    completionFraction:values.length/input.plannedCount,recordedAt:timed?input.recordedAt:null,
    limitations:['FICTIONAL_DATA_ONLY','INDEPENDENCE_NOT_ESTABLISHED','NO_POPULATION_OR_CAUSAL_INFERENCE',...(values.length<2?['INSUFFICIENT_OBSERVATIONS_FOR_SAMPLE_VARIANCE']:[]),...(failed.length||missing.length?['INCOMPLETE_OBSERVATIONS_MAY_BIAS_SUMMARY']:[]),...(!timed?['OBSERVATION_TIMES_NOT_RECORDED']:[])],
    min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null,
    status:failed.length||missing.length?'INCOMPLETE_RECORD':'COMPLETE_RECORD',
    scientificValidityEstablished:false,scope:'NON_FINANCIAL_FICTIONAL_LAB'};
}
