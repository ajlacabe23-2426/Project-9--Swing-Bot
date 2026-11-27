import {summarizeFictionalLab} from './educational-lab-summary.mjs';

// Explicit caller-selected A/B comparison; hashes and file order imply no chronology.
export function compareFictionalExperiments(before,after){
  const a=summarizeFictionalLab(before),b=summarizeFictionalLab(after);
  if(a.experimentId!==b.experimentId)throw new TypeError('Comparison requires the same experiment identity');
  const left=new Map(before.observations.map(o=>[o.index,o]));
  const right=new Map(after.observations.map(o=>[o.index,o]));
  const changes=[];
  for(const index of [...new Set([...left.keys(),...right.keys()])].sort((x,y)=>x-y)){
    const x=left.get(index),y=right.get(index);
    if((!x||!y||x.status!==y.status||x.value!==y.value||x.observedAt!==y.observedAt))changes.push({index,before:x??null,after:y??null,
      kind:!x?'ADDED':!y?'REMOVED':'MODIFIED'});
  }
  return {schema:'educational-lab-comparison-v1',fictional:true,before:a,after:b,changes,
    plannedCountChanged:a.plannedCount!==b.plannedCount,
    schemaChanged:before.schema!==after.schema,
    recordedAtChanged:a.recordedAt!==b.recordedAt,
    identical:a.fingerprint===b.fingerprint,
    chronologicalOrderVerified:false,scientificImprovementEstablished:false};
}

// Typed assertions only: no natural-language claim classifier or inference engine.
export function reviewFictionalConclusion(input,claim){
  const summary=summarizeFictionalLab(input);
  if(!claim||Object.keys(claim).length!==2||!Object.hasOwn(claim,'kind')||!Object.hasOwn(claim,'value'))
    throw new TypeError('Invalid structured conclusion');
  const supported={OBSERVED_COUNT:summary.observedCount,OBSERVED_MEAN:summary.mean,OBSERVED_MEDIAN:summary.median};
  if(Object.hasOwn(supported,claim.kind))return {status:claim.value!==null&&typeof claim.value==='number'&&Number.isFinite(claim.value)&&claim.value===supported[claim.kind]?'SUPPORTED_DESCRIPTIVE_CALCULATION':'CONTRADICTED_OR_UNAVAILABLE',scientificValidityEstablished:false};
  if(!['CAUSAL_EFFECT','POPULATION_MEAN','STATISTICAL_SIGNIFICANCE','INDEPENDENT_REPLICATION'].includes(claim.kind))throw new TypeError('Unknown conclusion kind');
  return {status:'UNSUPPORTED_INFERENCE',scientificValidityEstablished:false};
}
