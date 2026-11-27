import {createHash} from 'node:crypto';

// Educational lab measurements only; no financial series or decisions.
export function summarizeFictionalLab(input){
  const fail=()=>{throw new TypeError('Invalid fictional lab experiment');};
  const keys=(o,k)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===k.length&&k.every(x=>Object.hasOwn(o,x));
  const label=s=>typeof s==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(s);
  if(!keys(input,['schema','fictional','experimentId','instrument','plannedCount','observations'])||
     input.schema!=='educational-lab-v1'||input.fictional!==true||
     !label(input.experimentId)||input.instrument!=='FICTIONAL_LENGTH_MM'||
     !Number.isSafeInteger(input.plannedCount)||input.plannedCount<1||input.plannedCount>1000||
     !Array.isArray(input.observations)||input.observations.length>input.plannedCount)fail();
  const records=[];
  let prev=0;
  for(const o of input.observations){
    if(!keys(o,['index','status','value'])||!Number.isSafeInteger(o.index)||
       o.index<=prev||o.index>input.plannedCount||
       !['OBSERVED','FAILED'].includes(o.status))fail();
    if(o.status==='OBSERVED'&&(!Number.isSafeInteger(o.value)||o.value<0||o.value>1000000))fail();
    if(o.status==='FAILED'&&o.value!==null)fail();
    prev=o.index;
    records.push({index:o.index,status:o.status,value:o.value});
  }
  const values=records.filter(o=>o.status==='OBSERVED').map(o=>o.value);
  const failed=records.filter(o=>o.status==='FAILED').map(o=>o.index);
  const present=new Set(records.map(o=>o.index));
  const missing=Array.from({length:input.plannedCount},(_,i)=>i+1).filter(i=>!present.has(i));
  const normalized={schema:input.schema,fictional:true,experimentId:input.experimentId,instrument:input.instrument,plannedCount:input.plannedCount,observations:records};
  return {schema:'educational-lab-summary-v1',experimentId:input.experimentId,fictional:true,
    fingerprint:createHash('sha256').update(JSON.stringify(normalized)).digest('hex'),
    plannedCount:input.plannedCount,observedCount:values.length,failed,missing,
    mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,
    min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null,
    status:failed.length||missing.length?'INCOMPLETE_RECORD':'COMPLETE_RECORD',
    scientificValidityEstablished:false,scope:'NON_FINANCIAL_FICTIONAL_LAB'};
}
