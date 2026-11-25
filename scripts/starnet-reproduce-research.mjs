/**
 * Read-only research reproduction packet and verifier.
 * Example: npm run research:reproduce -- --demo > record.json
 *          npm run research:reproduce -- --verify-record record.json --demo
 *
 * No raw licensed history is embedded in the packet: retain input files.
 */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertPatchedNodeRuntime} from '../src/runtime-security.mjs';
import {engineered,parseEvidenceArgs,readLocalHistory} from './starnet-three-level-evidence.mjs';
import {
  buildStarNetResearchReproducibility,
  verifyStarNetResearchReproducibility
} from '../src/starnet-offline-reproducibility.mjs';

const SOURCE_FILES=[
  '../src/market-intelligence.mjs',
  '../src/chronological-research-audit.mjs',
  '../src/starnet-offline-research-quality.mjs',
  '../src/starnet-historical-source-comparison.mjs',
  '../src/starnet-offline-custody-evidence.mjs',
  '../src/starnet-offline-reproducibility.mjs',
  '../scripts/starnet-three-level-evidence.mjs',
  '../scripts/starnet-reproduce-research.mjs'
];

export async function methodologySha256(){
  const hash=createHash('sha256');
  for(const relative of SOURCE_FILES){
    const file=new URL(relative,import.meta.url);
    hash.update(relative,'utf8');
    hash.update('\n','utf8');
    hash.update(await readFile(file));
    hash.update('\n','utf8');
  }
  return hash.digest('hex');
}

function parseArgs(args){
  if(!Array.isArray(args)||args.length===0)
    throw new TypeError('Only --demo or explicit --as-of DATE FILE [--compare WITNESS] [--manifest CUSTODY] accepted');
  let recordPath=null,rest=args;
  if(args[0]==='--verify-record'){
    if(typeof args[1]!=='string'||args[1].startsWith('--')||args[1].length===0)
      throw new TypeError('--verify-record requires a local JSON record filepath');
    recordPath=args[1];rest=args.slice(2);
  }
  const opts=parseEvidenceArgs(rest);
  if(opts.markdown)throw new TypeError('Reproduction records use JSON only; omit --markdown');
  return {recordPath,opts};
}

async function collectOriginalResearchInputs(opts){
  let marketBytes,witnessMarketBytes=null,manifestBytes=null,asOf,sourceKind;
  if(opts.mode==='DEMO'){
    const fixture=engineered();
    marketBytes=fixture.bytes;
    witnessMarketBytes=fixture.witnessBytes;
    manifestBytes=fixture.manifestBytes;
    asOf=fixture.asOf;
    sourceKind='ENGINEERED_OFFLINE_FIXTURE';
  }else{
    marketBytes=await readLocalHistory(opts.path);
    if(opts.witnessPath)witnessMarketBytes=await readLocalHistory(opts.witnessPath);
    if(opts.manifestPath)manifestBytes=await readLocalHistory(opts.manifestPath);
    asOf=opts.asOf;
    sourceKind='USER_SUPPLIED_UNVERIFIED_JSON';
  }
  return {
    marketBytes,witnessMarketBytes,manifestBytes,asOf,sourceKind,
    methodologySha256:await methodologySha256()
  };
}

/** Return original local inputs; refuses saved-record mode and live flags. */
export async function loadStarNetOfflineResearchInputs(args){
  assertPatchedNodeRuntime();
  const {recordPath,opts}=parseArgs(args);
  if(recordPath!==null)throw new TypeError('Original evidence inputs only, not record replay');
  return collectOriginalResearchInputs(opts);
}
export async function runStarNetResearchReproduction(args){
  assertPatchedNodeRuntime();
  const {recordPath,opts}=parseArgs(args);
  const inputs=await collectOriginalResearchInputs(opts);
  const {asOf,sourceKind}=inputs;
  if(recordPath===null)return buildStarNetResearchReproducibility(inputs);
  const text=await readLocalHistory(recordPath);
  let record;
  try{record=JSON.parse(text.toString('utf8'));}
  catch{throw new TypeError('Recorded reproduction packet is not valid JSON');}
  if(record.asOf!==asOf||record.sourceKind!==sourceKind)
    throw new TypeError('Recorded research cutoff or source class conflicts with supplied inputs');
  return verifyStarNetResearchReproducibility(record,inputs);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runStarNetResearchReproduction(process.argv.slice(2))
    .then(report=>process.stdout.write(JSON.stringify(report,null,2)+'\n'))
    .catch(err=>{process.stderr.write('Offline research reproduction refused: '+err.message+'\n');process.exitCode=1;});
}
