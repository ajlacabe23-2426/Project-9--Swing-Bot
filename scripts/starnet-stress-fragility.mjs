/** Read-only CLI for a synthetic or permitted local cost-stress lesson. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {engineered,readLocalHistory} from './starnet-three-level-evidence.mjs';
import {parseMethodologyLearningArgs} from './starnet-learn-methodology.mjs';
import {assertPatchedNodeRuntime} from '../src/runtime-security.mjs';
import {auditStarNetStressFragility} from '../src/starnet-stress-fragility.mjs';

export async function runStressFragilityCli(args){
  assertPatchedNodeRuntime();
  const options=parseMethodologyLearningArgs(args);
  if(options.markdown)throw new TypeError('This bounded audit supports JSON only');
  const fixture=options.mode==='DEMO'?engineered():null;
  const marketBytes=fixture?.bytes??await readLocalHistory(options.path);
  return auditStarNetStressFragility({
    marketBytes,asOf:fixture?.asOf??options.asOf,
    sourceKind:fixture?'ENGINEERED_OFFLINE_FIXTURE':'USER_SUPPLIED_UNVERIFIED_JSON'
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runStressFragilityCli(process.argv.slice(2))
    .then(r=>process.stdout.write(JSON.stringify(r,null,2)+'\n'))
    .catch(e=>{process.stderr.write('Offline fragility audit refused: '+e.message+'\n');process.exitCode=1;});
}
