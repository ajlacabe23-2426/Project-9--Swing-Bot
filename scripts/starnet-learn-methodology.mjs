/**
 * Offline, educational research-methodology watchlist.
 * --demo is engineered history. --as-of DATE FILE accepts an explicitly
 * permitted local historical JSON file. No provider/network or trade actions.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertPatchedNodeRuntime} from '../src/runtime-security.mjs';
import {isStrictISODate} from '../src/market-intelligence.mjs';
import {engineered,readLocalHistory} from './starnet-three-level-evidence.mjs';
import {buildStarNetMethodologyWatch,renderStarNetMethodologyLearningMarkdown} from '../src/starnet-methodology-learning.mjs';

const USAGE='Usage: node scripts/starnet-learn-methodology.mjs --demo [--markdown] OR --as-of YYYY-MM-DD permitted-history.json [--markdown]';
export function parseMethodologyLearningArgs(args){
  if(!Array.isArray(args))throw new TypeError(USAGE);
  if(args.length===1&&args[0]==='--demo')
    return {mode:'DEMO',markdown:false};
  if(args.length===2&&args[0]==='--demo'&&args[1]==='--markdown')
    return {mode:'DEMO',markdown:true};
  if((args.length===3||args.length===4)&&args[0]==='--as-of'&&
    isStrictISODate(args[1])&&typeof args[2]==='string'&&
    args[2].length>0&&!args[2].startsWith('--')&&
    (args.length===3||args[3]==='--markdown'))
    return {mode:'LOCAL_FILE',asOf:args[1],path:args[2],markdown:args.length===4};
  throw new TypeError(USAGE);
}
export async function runStarNetMethodologyLearningCli(args){
  assertPatchedNodeRuntime();
  const opts=parseMethodologyLearningArgs(args);
  const fixture=opts.mode==='DEMO'?engineered():null;
  const asOf=fixture?.asOf??opts.asOf;
  const marketBytes=fixture?.bytes??await readLocalHistory(opts.path);
  const sourceKind=opts.mode==='DEMO'
    ?'ENGINEERED_OFFLINE_FIXTURE':'USER_SUPPLIED_UNVERIFIED_JSON';
  const report=buildStarNetMethodologyWatch({marketBytes,asOf,sourceKind});
  if(report.safety.productionGate!=='NO_GO'||report.safety.realOrdersCreated!==0||
    report.study.independentPredictionEstablished!==false)
    throw new TypeError('Educational methodology report cannot promote trading');
  return opts.markdown?renderStarNetMethodologyLearningMarkdown(report):report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runStarNetMethodologyLearningCli(process.argv.slice(2))
    .then(result=>process.stdout.write(typeof result==='string'?result:JSON.stringify(result,null,2)+'\n'))
    .catch(err=>{process.stderr.write('Methodology learning refused: '+err.message+'\n');process.exitCode=1;});
}
