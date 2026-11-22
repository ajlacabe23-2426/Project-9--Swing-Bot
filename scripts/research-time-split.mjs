/**
 * Offline CLI for fixed, descriptive chronological research.
 * Reads a single explicitly specified permitted JSON file, or --demo's
 * built-in engineered data. Never writes files, opens orders or uses a provider.
 */
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {readFile,stat} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {generateScenario} from '../src/synthetic-fixtures.mjs';
import {auditChronologicalResearch} from '../src/chronological-research-audit.mjs';
import {isStrictISODate} from '../src/market-intelligence.mjs';
import {assertPatchedNodeRuntime} from '../src/runtime-security.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const command=promisify(execFile);
const MAX_INPUT=2_500_000;
const usage='Usage: npm run research:time-split -- --demo OR --as-of YYYY-MM-DD path/to/permitted-market.json';

export function parseTimeSplitArgs(args){
  if(Array.isArray(args)&&args.length===1&&args[0]==='--demo')
    return {mode:'DEMO'};
  if(Array.isArray(args)&&args.length===3&&args[0]==='--as-of'&&
     isStrictISODate(args[1])&&typeof args[2]==='string'&&
     args[2]&&!args[2].startsWith('--'))
    return {mode:'LOCAL_FILE',asOf:args[1],file:args[2]};
  throw new Error(usage);
}

function engineeredFixture(){
  const bars=generateScenario(73,190);
  return {
    schema:'project9-market-data-v1',symbol:'SYNTH',
    currency:'USD',
    source:'Project 9 ENGINEERED SYNTHETIC RESEARCH - NOT REAL MARKET DATA',
    mode:'HISTORICAL',priceAdjustment:'RAW',
    sourceAsOf:bars.at(-1).date,bars
  };
}

export async function runTimeSplitCli(argv){
  assertPatchedNodeRuntime();
  const options=parseTimeSplitArgs(argv);
  let bytes,data;
  if(options.mode==='DEMO'){
    data=engineeredFixture();
    bytes=Buffer.from(JSON.stringify(data));
  }else{
    const path=resolve(options.file);
    const stats=await stat(path);
    if(!stats.isFile()||stats.size>MAX_INPUT)throw new Error('Research input must be a regular JSON file no larger than 2.5 MB');
    bytes=await readFile(path);
    if(bytes.byteLength>MAX_INPUT)throw new Error('Research input exceeds 2.5 MB');
    data=JSON.parse(bytes.toString('utf8'));
  }
  const {stdout}=await command('git',['rev-parse','HEAD'],{cwd:root,timeout:5000});
  const candidateSha=stdout.trim();
  if(!/^[a-f0-9]{40}$/.test(candidateSha))throw new Error('Cannot bind research report to a complete Git commit SHA');
  const study=auditChronologicalResearch(data,{asOf:options.asOf??null});
  return {
    ...study,
    inputIdentity:{
      inputByteSha256:createHash('sha256').update(bytes).digest('hex'),
      sourceKind:options.mode==='DEMO'?'ENGINEERED_FICTIONAL_FIXTURE':'USER_SUPPLIED_UNVERIFIED_LOCAL_JSON',
      fullCandidateCommitSha:candidateSha,
      workingTreeCleanlinessIndependentlyVerified:false,
      rawInputEchoed:false
    }
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runTimeSplitCli(process.argv.slice(2))
    .then(report=>process.stdout.write(JSON.stringify(report,null,2)+'\n'))
    .catch(error=>{console.error('Chronological research audit FAILED:',error.message);process.exitCode=1;});
}
