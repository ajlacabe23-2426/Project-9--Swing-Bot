/**
 * Read-only StarNet three-level evidence packet.
 * --demo uses engineered bars and invented ledger balances.
 * --as-of DATE FILE reads an explicit local permitted JSON, never calls
 * providers, brokers, exchanges, chain RPCs or sends transactions.
 * Default JSON; append --markdown for a human-readable offline report.
 */
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {basename,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateScenario} from '../src/synthetic-fixtures.mjs';
import {isStrictISODate} from '../src/market-intelligence.mjs';
import {openFictionalExecutionJournal} from '../src/starnet-fictional-execution-journal.mjs';
import {buildStarNetEvidenceReadiness,renderStarNetEvidenceMarkdown} from '../src/starnet-evidence-readiness.mjs';
import {assertPatchedNodeRuntime} from '../src/runtime-security.mjs';

const M='MISSING',MAX_BYTES=2_500_000;
const usage='Usage: npm run research:evidence -- --demo [--markdown] OR --as-of YYYY-MM-DD permitted-local-history.json [--markdown]';
const policy=()=>({
  schema:'project9-fictional-risk-policy-v1',scope:'FICTIONAL_OFFLINE',
  startingCashTicks:10_000,maxOrderNotionalTicks:9_000,
  initialHoldings:[{rail:'LISTED_EQUITY',instrumentId:'SIM-EQUITY-ONE',units:5}]
});
const intent=()=>({
  schema:'project9-sim-order-intent-v1',scope:'FICTIONAL_OFFLINE',
  intentId:'SIM-ORDER-EVIDENCE',side:'BUY',orderType:'LIMIT',
  units:4,limitPriceTicks:1_000,
  railDescriptor:{
    schema:'project9-market-rail-descriptor-v1',scope:'FICTIONAL_OFFLINE',
    rail:'LISTED_EQUITY',instrumentId:'SIM-EQUITY-ONE',
    referenceInstrument:null,
    declaredEvidence:{listingIdentity:M,dataRights:M,exchangeCalendar:M,
      corporateActions:M,custodyAndOwnership:M}
  }
});
const event=(id,kind,filledUnits=0)=>({
  schema:'project9-sim-execution-event-v1',scope:'FICTIONAL_OFFLINE',
  eventId:'SIM-EVENT-'+id,intentId:'SIM-ORDER-EVIDENCE',kind,filledUnits
});
export function parseEvidenceArgs(args){
  if(!Array.isArray(args))throw new Error(usage);
  if(args.length===1&&args[0]==='--demo')return {mode:'DEMO',markdown:false};
  if(args.length===2&&args[0]==='--demo'&&args[1]==='--markdown')
    return {mode:'DEMO',markdown:true};
  const valid=(args.length===3||args.length===4)&&
    args[0]==='--as-of'&&isStrictISODate(args[1])&&
    typeof args[2]==='string'&&args[2].length>0&&!args[2].startsWith('--')&&
    (args.length===3||args[3]==='--markdown');
  if(!valid)throw new Error(usage);
  return {mode:'LOCAL_FILE',asOf:args[1],path:args[2],
    markdown:args.length===4};
}
function engineered(){
  const bars=generateScenario(73,190);
  const asOf=bars.at(-1).date;
  return {
    asOf,
    bytes:Buffer.from(JSON.stringify({
      schema:'project9-market-data-v2',
      symbol:'SIM09',currency:'USD',
      source:'PROJECT9 ENGINEERED SYNTHETIC HISTORY - NOT ACTUAL PRICES',
      mode:'HISTORICAL',sourceAsOf:asOf,priceAdjustment:'RAW',
      provenance:{
        retrievedAt:asOf+'T00:00:00.000Z',
        adjustmentMethod:'RAW_UNADJUSTED',
        corporateActions:'NOT_VERIFIED',
        survivorship:'NOT_ASSESSED',
        licensing:'NOT_VERIFIED'
      },bars
    }))
  };
}
async function fictionalLedger(){
  const dir=await mkdtemp(join(tmpdir(),'p9-execution-lab-'));
  let journal;
  try{
    journal=await openFictionalExecutionJournal(dir);
    await journal.initializeRiskPolicy(policy());
    await journal.submit(intent());
    await journal.recordEvent(event('ACK','ACK'));
    await journal.recordEvent(event('FILL','FILL',2));
    await journal.recordEvent(event('CANCEL','CANCEL'));
    const report=await journal.report();
    assert.equal(report.risk.cash.totalTicks,8000);
    assert.equal(report.risk.cash.reservedTicks,0);
    assert.equal(report.controls.productionGate,'NO_GO');
    return report;
  }finally{
    if(journal)await journal.close().catch(()=>{});
    await rm(dir,{recursive:true,force:true});
  }
}
export async function runEvidenceCli(args){
  assertPatchedNodeRuntime();
  const opts=parseEvidenceArgs(args);
  let asOf,bytes,sourceKind;
  if(opts.mode==='DEMO'){
    const fixture=engineered();
    asOf=fixture.asOf;bytes=fixture.bytes;
    sourceKind='ENGINEERED_OFFLINE_FIXTURE';
  }else{
    const path=resolve(opts.path);
    const info=await stat(path);
    if(!info.isFile()||info.size<=0||info.size>MAX_BYTES)
      throw new TypeError('Permitted local JSON must be a nonempty regular file no larger than 2.5 MB');
    bytes=await readFile(path);
    if(!bytes.length||bytes.length>MAX_BYTES)throw new Error('Local history exceeded size bound');
    asOf=opts.asOf;
    sourceKind='USER_SUPPLIED_UNVERIFIED_JSON';
  }
  const report=buildStarNetEvidenceReadiness({
    journalReport:await fictionalLedger(),
    marketBytes:bytes,asOf,sourceKind
  });
  assert.equal(report.overall.productionGate,'NO_GO');
  assert.equal(report.levels.engineering.providerExecutionsAuthenticated,false);
  assert.equal(report.levels.research.historicalAuthenticityIndependentlyVerified,false);
  return opts.markdown?renderStarNetEvidenceMarkdown(report):report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runEvidenceCli(process.argv.slice(2))
    .then(result=>process.stdout.write(typeof result==='string'?result:JSON.stringify(result,null,2)+'\n'))
    .catch(error=>{process.stderr.write('Offline evidence report refused: '+error.message+'\n');process.exitCode=1;});
}
