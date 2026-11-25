/**
 * StarNet Phase 15 — local claim registry, optional review notes and reports.
 *
 * Examples:
 *   node scripts/starnet-review-claims.mjs --demo --markdown
 *   node scripts/starnet-review-claims.mjs --demo --note SIM-CLAIM-BAR-COUNT ACKNOWLEDGE_LOCAL_CALCULATION LOCAL_CALCULATION_RECHECKED --ledger-only > notes.json
 *   node scripts/starnet-review-claims.mjs --demo --reviews notes.json --markdown
 *
 * No writes unless the operator explicitly redirects output in their shell.
 * The original input files, local reviewer labels and notes are NOT
 * independently authenticated, and cannot enable live trading.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  loadStarNetOfflineResearchInputs,readLocalHistory
} from './starnet-reproduce-research.mjs';
import {
  buildStarNetResearchReproducibility
} from '../src/starnet-offline-reproducibility.mjs';
import {
  buildStarNetResearchClaimRegistry,newStarNetResearchReviewLedger,
  replayStarNetResearchReviewLedger,appendStarNetResearchReviewNote,
  buildStarNetResearchClaimReviewReport,renderStarNetClaimReviewMarkdown
} from '../src/starnet-research-claim-registry.mjs';

const fail=why=>{throw new TypeError('StarNet local claims command refused: '+why);};
const validPath=x=>typeof x==='string'&&x.length>0&&!x.startsWith('--');
export function parseStarNetClaimCliArgs(args){
  if(!Array.isArray(args)||args.length===0)
    fail('--demo or permitted --as-of DATE FILE required');
  let recordPath=null,reviewsPath=null,note=null,reviewerLabel='LOCAL-REVIEWER-UNVERIFIED';
  let markdown=false,ledgerOnly=false;
  const base=[],seen=new Set();
  for(let i=0;i<args.length;i++){
    const x=args[i];
    if(['--record','--reviews','--note','--reviewer','--markdown','--ledger-only'].includes(x)){
      if(seen.has(x))fail('duplicate claim CLI flag');
      seen.add(x);
      if(x==='--markdown'){markdown=true;continue;}
      if(x==='--ledger-only'){ledgerOnly=true;continue;}
      if(x==='--note'){
        const parts=args.slice(i+1,i+4);
        if(parts.length!==3||parts.some(p=>!validPath(p)))
          fail('--note requires CLAIM_ID ACTION REASON_CODE');
        note={claimId:parts[0],action:parts[1],reasonCode:parts[2]};
        i+=3;continue;
      }
      if(!validPath(args[i+1]))fail(x+' requires a value');
      if(x==='--record')recordPath=args[++i];
      else if(x==='--reviews')reviewsPath=args[++i];
      else reviewerLabel=args[++i];
    }else base.push(x);
  }
  if(markdown&&ledgerOnly)fail('--markdown and --ledger-only cannot be combined');
  if(seen.has('--reviewer')&&!note)fail('--reviewer requires --note');
  return {base,recordPath,reviewsPath,note,reviewerLabel,markdown,ledgerOnly};
}
async function loadLocalJson(path){
  const bytes=await readLocalHistory(path);
  try{return JSON.parse(bytes.toString('utf8'));}
  catch{fail('review/record JSON file is malformed');}
}
export async function runStarNetClaimReviewCli(args){
  const cfg=parseStarNetClaimCliArgs(args);
  const originalInputs=await loadStarNetOfflineResearchInputs(cfg.base);
  const reproductionRecord=cfg.recordPath===null
    ?buildStarNetResearchReproducibility(originalInputs)
    :await loadLocalJson(cfg.recordPath);
  const registry=buildStarNetResearchClaimRegistry({
    reproductionRecord,originalInputs
  });
  let ledger=cfg.reviewsPath===null
    ?newStarNetResearchReviewLedger(registry)
    :await loadLocalJson(cfg.reviewsPath);
  replayStarNetResearchReviewLedger(registry,ledger);
  if(cfg.note){
    ledger=appendStarNetResearchReviewNote(registry,ledger,{
      noteId:'SIM-NOTE-'+String(ledger.entries.length+1).padStart(3,'0'),
      claimId:cfg.note.claimId,action:cfg.note.action,
      reviewerLabel:cfg.reviewerLabel,reasonCode:cfg.note.reasonCode
    });
  }
  const report=buildStarNetResearchClaimReviewReport(registry,ledger);
  if(cfg.markdown)return renderStarNetClaimReviewMarkdown(report);
  if(cfg.ledgerOnly)return ledger;
  return Object.freeze({
    schema:'project9-offline-claim-review-packet-v1',
    scope:'UNTRUSTED_LOCAL_RESEARCH_ONLY',
    registry,reviewLedger:ledger,report,
    productionGate:'NO_GO'
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runStarNetClaimReviewCli(process.argv.slice(2))
    .then(out=>process.stdout.write(typeof out==='string'?out:JSON.stringify(out,null,2)+'\n'))
    .catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
}
