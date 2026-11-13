import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const hash=value=>createHash('sha256').update(value).digest('hex');
const enginePaths=['src/daily-breakout-research.mjs','scripts/paper-forward-audit.mjs',
  'src/research-return-contract.mjs','src/market-intelligence.mjs','src/engine.mjs',
  'src/research-manifest.mjs','scripts/research-daily-breakout.mjs'];

/** Require every dependency byte to exist in the claimed commit, including new files. */
export function committedEngineMatches(directory,sha,engineSha256){
  return Object.entries(engineSha256).every(([path,digest])=>{
    try{
      return hash(execFileSync('git',['show',`${sha}:${path}`],{
        cwd:directory,stdio:['ignore','pipe','pipe']
      }))===digest;
    }catch{return false;}
  });
}

/** Byte identity and Git revision are reproducibility evidence, not authenticity. */
export async function researchManifest(result,inputSha256,input){
  let sourceSha=null,sourceRevisionStatus='GIT_UNAVAILABLE',workingDiffSha256=null;
  try{
    sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
    const diff=execFileSync('git',['diff','HEAD','--',...enginePaths],{cwd:root,stdio:['ignore','pipe','pipe']});
    workingDiffSha256=hash(diff);
    sourceRevisionStatus=diff.length?'WORKING_TREE_DIFF':'COMMITTED_TRACKED_ENGINE';
  }catch{/* An exported source tree can still carry exact engine byte hashes. */}
  const engineSha256={};
  for(const path of enginePaths)engineSha256[path]=hash(await readFile(new URL('../'+path,import.meta.url)));
  if(sourceSha&&!committedEngineMatches(root,sourceSha,engineSha256)){
    sourceRevisionStatus='WORKING_TREE_DIFF';
  }
  const manifest={schema:'project9-research-manifest-v2',sourceSha,sourceRevisionStatus,
    reportSchema:result.schema,
    datasetIdentity:{symbol:input.symbol,currency:input.currency,source:input.source,
      mode:input.mode,sourceAsOf:input.sourceAsOf,priceAdjustment:input.priceAdjustment},
    dataQuality:result.dataQuality,
    inputCoverage:{schema:input.schema,rows:input.bars.length,
      firstDate:input.bars[0].date,lastDate:input.bars.at(-1).date},
    effectiveParameters:result.parameters??{holdingBars:result.holdingBars,...result.modeledCosts},
    runtime:{node:process.version},
    workingDiffSha256,engineSha256,inputSha256,strategy:result.strategy,
    returnContract:result.returnContract,windowDefinition:result.windowDefinition,
    costs:result.modeledCosts??{
      feeBpsEachSide:result.parameters.feeBpsEachSide,
      adverseSlippageBpsEachSide:result.parameters.adverseSlippageBpsEachSide},
    reviewDate:result.reviewDate,symbol:result.symbol,
    source:result.source,provenance:result.provenance??result.source.provenance,
    windows:result.outcomes.map(o=>o.window),
    caveat:'Hashes do not authenticate data or establish point-in-time availability'};
  return {manifest,manifestSha256:hash(JSON.stringify(manifest))};
}
