/**
 * StarNet Phase 3: offline evidence coordinator, NOT a paper-cycle operator.
 *
 * This command never calls the existing write-capable StarNet mission, scans
 * the user's saved workstation, contacts a market vendor, or enables scheduling.
 * It delegates only to the fully isolated synthetic acceptance harness.
 */
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {promisify} from 'node:util';

import {runPaperLifecycleAcceptance} from './accept-paper-lifecycle.mjs';
import {buildDemoDataset} from '../src/synthetic-demo-fixture.mjs';
import {evaluateSwingSetup} from '../src/market-intelligence.mjs';
import {assertPatchedNodeRuntime} from '../src/runtime-security.mjs';

const command=promisify(execFile);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const SHA=/^[a-f0-9]{40}$/;

export function parsePhase3Args(args){
  if(!Array.isArray(args))throw new Error('Arguments must be a list');
  let reportDir=null;
  for(let i=0;i<args.length;i++){
    if(args[i]!=='--report-dir'||reportDir!==null||!args[i+1]||args[i+1].startsWith('--'))
      throw new Error('Usage: npm run starnet:phase3 -- [--report-dir /private/local/path]. No --paper-auto or scheduling options.');
    reportDir=args[++i];
  }
  return {reportDir};
}

async function currentCommit(){
  const {stdout}=await command('git',['rev-parse','HEAD'],{cwd:root,timeout:5000});
  return stdout.trim();
}

function syntheticResearchChecks(){
  const checks=[];
  const fingerprints={};
  for(const [symbol,expected] of [['SIM09','PAPER_SETUP_STRONG'],['SIM10','NO_PAPER_SETUP']]){
    const dataset=buildDemoDataset(symbol);
    const classification=evaluateSwingSetup(dataset).classification;
    assert.equal(dataset.symbol,symbol);
    assert.equal(dataset.mode,'HISTORICAL');
    assert.match(dataset.source,/ENGINEERED SYNTHETIC DEMO - NOT REAL MARKET DATA/);
    assert.equal(classification,expected);
    fingerprints[symbol]=hash(dataset);
    checks.push({id:'RESEARCH_'+symbol,status:'PASS',classification,fixtureSha256:fingerprints[symbol]});
  }
  return {checks,fingerprints};
}

export function verifyAcceptance(report){
  if(!report||typeof report!=='object'||Array.isArray(report))
    throw new Error('Missing structured synthetic lifecycle evidence');
  const checks=[
    ['ISOLATED_SYNTHETIC',report.mode==='OFFLINE_ENGINEERED_SYNTHETIC_ONLY'],
    ['FIXTURE_SYMBOLS',JSON.stringify(report.fixtureSymbols)===JSON.stringify(['SIM09','SIM10'])],
    ['DEFAULT_NO_AUTO_TICKETS',report.defaultCycleTickets===0],
    ['NO_SETUP_DENIAL',report.noSetupDenialStatus===409],
    ['MISSING_REVIEW_DENIAL',report.missingReviewDenialStatus===409],
    ['FORGED_REVIEW_DENIAL',report.forgedReviewDenialStatus===409],
    ['CONCURRENT_DUPLICATE_STOP',JSON.stringify(report.simultaneousCreateStatuses)==='[200,409]'],
    ['RESTART_DUPLICATE_STOP',report.duplicateAfterRestartStatus===409],
    ['LIFECYCLE_PRESERVED',JSON.stringify(report.lifecycle)===
      '["OPEN_PAPER_OBSERVATION","OPEN_PAPER_OBSERVATION","TARGET_REFERENCE_TOUCHED"]'],
    ['RESTART_STATE_EQUAL',report.journalRestoredIdentically===true],
    ['LEGACY_PAPER_UNCHANGED',report.legacyPaperStateUnchanged===true],
    ['ORIGINAL_FIXTURES_UNCHANGED',report.fixtureFilesUnchanged===true],
    ['PROVIDER_NOT_CALLED',report.realProviderCalls===0],
    ['NO_REAL_ORDERS',report.realOrdersCreated===0],
    ['JOURNAL_HASH_RECORDED',typeof report.finalJournalSha256==='string'&&
      /^[a-f0-9]{64}$/.test(report.finalJournalSha256)]
  ].map(([id,ok])=>({id,status:ok?'PASS':'FAIL'}));
  const failed=checks.filter(c=>c.status!=='PASS').map(c=>c.id);
  if(failed.length)throw new Error('Phase 3 synthetic acceptance failed: '+failed.join(', '));
  return checks;
}

function humanReport(report){
  return [
    '# Project 9 / StarNet Phase 3 verification packet',
    '',
    'Generated UTC: '+report.generatedAt,
    'Node.js: '+report.nodeRuntime.version,
    'Node executable: '+report.nodeRuntime.executable,
    'Runtime policy: '+report.nodeRuntime.policy,
    'Git commit: '+report.sourceCommit,
    'Run ID: '+report.runId,
    'Data mode: ENGINEERED SYNTHETIC ONLY',
    '',
    '## Crew findings',
    '- Research analyst: PASS — SIM09 qualifies within engineered fixtures; SIM10 does not.',
    '- QA engineer: PASS — isolated ticket creation, duplicate denial, cold restart, HOLD and TARGET were checked.',
    '- Risk auditor: PASS — no external provider calls, no broker orders, fixture and legacy state unchanged.',
    '- Chief orchestrator: SOFTWARE_GATES_PASS — these checks do not establish trading readiness.',
    '',
    '## Gate details',
    ...report.checks.map(c=>'- '+c.id+': '+c.status),
    '',
    '## Decision',
    '- Phase 3 software exercise: '+report.softwareGate,
    '- Real trading / broker activation: '+report.productionGate,
    '- Paper auto-ticket creation on the saved workstation: DISABLED / NOT ATTEMPTED',
    '- Scheduling or monitoring: NOT ENABLED BY THIS COMMAND',
    '- Human review of the stacked PRs and real-device acceptance: REQUIRED',
    '',
    '## Evidence limits',
    '- The synthetic HOLD and TARGET are constructed educational outcomes, never actual AAPL or market fills.',
    '- This runner does not prove data rights, out-of-sample performance, broker readiness, or power-loss durability.',
    '- StarNet Workbench must execute this command locally; this code does not connect to or run the StarNet app itself.',
    ''
  ].join('\n');
}

export async function runStarNetPhase3({
  reportDir=join(root,'.data/starnet/phase3'),
  now=new Date(),
  acceptanceRunner=runPaperLifecycleAcceptance,
  commitReader=currentCommit
}={}){
  // A synthetic PASS on an unpatched Node build is not acceptance.
  // Check before reading the candidate, running fixtures or writing evidence.
  assertPatchedNodeRuntime();
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new Error('Invalid verification timestamp');
  if(typeof acceptanceRunner!=='function'||typeof commitReader!=='function')
    throw new Error('Invalid verifier dependency');
  const sourceCommit=await commitReader();
  if(typeof sourceCommit!=='string'||!SHA.test(sourceCommit))
    throw new Error('Cannot verify exact Git candidate SHA');

  // Run checks BEFORE creating any output directory. Nothing reads the user's
  // local .data or modifies the workstation; the acceptance harness owns only
  // a fresh OS temporary directory and closes its loopback server.
  const research=syntheticResearchChecks();
  const raw=await acceptanceRunner();
  const qa=verifyAcceptance(raw);
  const report={
    schema:'project9-starnet-phase3-evidence-v1',
    runId:randomUUID(),generatedAt:now.toISOString(),sourceCommit,
    nodeRuntime:{version:process.versions.node,executable:process.execPath,policy:'PASS'},
    sourceMode:'ENGINEERED_SYNTHETIC_ONLY',
    operation:'READ_ONLY_EVIDENCE_REPORT_AFTER_ISOLATED_SYNTHETIC_TEST',
    softwareGate:'PASS',
    productionGate:'NO_GO',
    roles:{
      researcher:{status:'PASS',checks:research.checks},
      qaEngineer:{status:'PASS',checks:qa},
      riskAuditor:{status:'PASS',note:'No real provider calls, no broker orders, and unchanged user state are asserted by the isolated test.'},
      chiefOrchestrator:{status:'SOFTWARE_GATES_PASS',humanAcceptanceRequired:true}
    },
    checks:[...research.checks,...qa],
    syntheticFixtureSha256:research.fingerprints,
    isolatedAcceptance:raw,
    sideEffects:{realOrdersCreated:0,providerCalls:0,scheduledTasksCreated:0,
      existingWorkstationTouched:false,paperAutoOnSavedWorkstation:false},
    limitations:'Local synthetic offline checks only. StarNet desktop has not been operated, real market validation and live Mac acceptance are not established.'
  };
  const destination=resolve(reportDir||join(root,'.data/starnet/phase3'));
  const base='phase3-'+report.generatedAt.replace(/[:.]/g,'-')+'-'+report.runId;
  const jsonPath=join(destination,base+'.json'),markdownPath=join(destination,base+'.md');
  await mkdir(destination,{recursive:true,mode:0o700});
  try{
    await writeFile(jsonPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
    await writeFile(markdownPath,humanReport(report),{flag:'wx',mode:0o600});
  }catch(error){
    await Promise.all([rm(jsonPath,{force:true}),rm(markdownPath,{force:true})]);
    throw error;
  }
  return {schema:report.schema,runId:report.runId,
    softwareGate:report.softwareGate,productionGate:report.productionGate,
    sourceCommit,nodeRuntime:report.nodeRuntime,checksPassed:report.checks.length,
    deliverables:{json:jsonPath,markdown:markdownPath},
    sideEffects:report.sideEffects};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const args=parsePhase3Args(process.argv.slice(2));
    runStarNetPhase3(args).then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
      .catch(error=>{console.error('StarNet Phase 3 verification FAILED:',error.message);process.exitCode=1;});
  }catch(error){
    console.error(error.message);
    process.exitCode=2;
  }
}
