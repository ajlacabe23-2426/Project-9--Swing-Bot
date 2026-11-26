/**
 * Offline comparison of two permitted historical source snapshots.
 * No network, broker, account, trade, writes, or data download.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertPatchedNodeRuntime} from '../src/runtime-security.mjs';
import {isStrictISODate} from '../src/market-intelligence.mjs';
import {engineered,readLocalHistory} from './starnet-three-level-evidence.mjs';
import {auditStarNetResearchRevision} from '../src/starnet-research-revision-audit.mjs';

const usage='Usage: node scripts/starnet-revision-audit.mjs --demo OR --as-of YYYY-MM-DD baseline.json candidate.json';
export function parseRevisionAuditArgs(args){
  if(args?.length===1&&args[0]==='--demo')
    return {mode:'DEMO'};
  if(args?.length===4&&args[0]==='--as-of'&&
     isStrictISODate(args[1])&&
     args[2]&&!args[2].startsWith('--')&&
     args[3]&&!args[3].startsWith('--'))
    return {mode:'LOCAL',asOf:args[1],first:args[2],second:args[3]};
  throw new TypeError(usage);
}
export async function runRevisionAuditCli(args){
  assertPatchedNodeRuntime();
  const opts=parseRevisionAuditArgs(args);
  if(opts.mode==='DEMO'){
    const fixture=engineered(),raw=JSON.parse(fixture.bytes.toString('utf8'));
    const revised=structuredClone(raw);
    revised.bars[90].volume+=25;
    return auditStarNetResearchRevision({
      baselineBytes:fixture.bytes,candidateBytes:Buffer.from(JSON.stringify(revised)),
      asOf:fixture.asOf,sourceKind:'ENGINEERED_OFFLINE_FIXTURE'
    });
  }
  const baselineBytes=await readLocalHistory(opts.first);
  const candidateBytes=await readLocalHistory(opts.second);
  return auditStarNetResearchRevision({
    baselineBytes,candidateBytes,asOf:opts.asOf,
    sourceKind:'USER_SUPPLIED_UNVERIFIED_JSON'
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runRevisionAuditCli(process.argv.slice(2))
    .then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
    .catch(error=>{process.stderr.write('Revision evidence refused: '+error.message+'\n');process.exitCode=1;});
}
