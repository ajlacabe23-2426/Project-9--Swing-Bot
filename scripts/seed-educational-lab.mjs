import {saveFictionalExperiment} from '../src/educational-lab-registry.mjs';
const args=process.argv.slice(2);
if(args.length!==1){console.error('Usage: node scripts/seed-educational-lab.mjs <trusted-local-fictional-registry-directory>');process.exitCode=2;}
else{
  try{
    const input={schema:'educational-lab-v2',fictional:true,experimentId:'invented-ruler-demo',instrument:'FICTIONAL_LENGTH_MM',plannedCount:4,recordedAt:'2026-01-01T01:00:00.000Z',observations:[
      {index:1,status:'OBSERVED',value:10,observedAt:'2026-01-01T00:01:00.000Z'},
      {index:2,status:'FAILED',value:null,observedAt:'2026-01-01T00:02:00.000Z'}]};
    const a=saveFictionalExperiment(args[0],input);
    input.recordedAt='2026-01-01T02:00:00.000Z';
    input.observations.push({index:4,status:'OBSERVED',value:14,observedAt:'2026-01-01T00:04:00.000Z'});
    const b=saveFictionalExperiment(args[0],input);
    console.log(JSON.stringify({fictional:true,versions:[a.fingerprint,b.fingerprint],note:'Invented examples, not verified scientific results.'},null,2));
  }catch{console.error('Fictional demo could not be saved. Preserve the registry and inspect its integrity.');process.exitCode=1;}
}
