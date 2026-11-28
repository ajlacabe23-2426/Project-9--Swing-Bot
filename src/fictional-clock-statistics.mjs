// Descriptive education using only the fixed invented sensor fixtures.
import {makeClockFixture,replayClockFixture} from './fictional-clock-replay.mjs';
export const classroomScenarios=Object.freeze(['complete','gap','duplicate','reversed']);

export function summarizeClockScenario(scenario){
  if(!classroomScenarios.includes(scenario))throw new TypeError('Unknown classroom scenario');
  const fixture=makeClockFixture(scenario);
  const quality=replayClockFixture(fixture);
  // Each timestamp contributes once. Do not invent readings for missing times.
  const unique=new Map();
  for(const row of fixture.rows)if(!unique.has(row.at))unique.set(row.at,row.reading);
  const values=[...unique.values()].sort((a,b)=>a-b);
  const n=values.length;
  const mean=values.reduce((sum,x)=>sum+x,0)/n;
  const variance=values.reduce((sum,x)=>sum+(x-mean)**2,0)/(n-1);
  const median=n%2?values[(n-1)/2]:(values[n/2-1]+values[n/2])/2;
  return {scenario,fictional:true,unit:fixture.unit,observedRows:quality.received,
    uniqueCount:n,expectedCount:72,missingCount:quality.missing,
    duplicateCount:quality.duplicates,reversedCount:quality.reversed,
    completeness:n/72,mean,median,min:values[0],max:values.at(-1),
    sampleVariance:variance,sampleStandardDeviation:Math.sqrt(variance),
    limitations:['DESCRIPTIVE_ONLY','NOT_INDEPENDENT_RANDOM_SAMPLES','NO_POPULATION_OR_CAUSAL_INFERENCE'],
    marketDataUsed:false,transactionsEnabled:false};
}
