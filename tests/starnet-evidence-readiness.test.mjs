import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openFictionalExecutionJournal} from '../src/starnet-fictional-execution-journal.mjs';
import {generateScenario} from '../src/synthetic-fixtures.mjs';
import {buildStarNetEvidenceReadiness,renderStarNetEvidenceMarkdown} from '../src/starnet-evidence-readiness.mjs';
import {runEvidenceCli,parseEvidenceArgs} from '../scripts/starnet-three-level-evidence.mjs';

const M='MISSING';
const baseMarket=(type='project9-market-data-v2')=>{
  const bars=generateScenario(73,190),date=bars.at(-1).date;
  return {
    schema:type,symbol:'SIM09',currency:'USD',
    source:'UNVERIFIED EXTERNALLY AUTHENTIC VENDOR CLAIM',
    mode:'HISTORICAL',sourceAsOf:date,priceAdjustment:'RAW',
    provenance:{
      retrievedAt:date+'T00:00:00.000Z',
      adjustmentMethod:'RAW_UNADJUSTED',
      corporateActions:'INDEPENDENTLY_REVIEWED',
      survivorship:'INDEPENDENTLY_REVIEWED',
      licensing:'COMMERCIAL_REDISTRIBUTION_VERIFIED'
    },
    bars
  };
};
const policy=()=>({
  schema:'project9-fictional-risk-policy-v1',scope:'FICTIONAL_OFFLINE',
  startingCashTicks:10000,maxOrderNotionalTicks:9000,
  initialHoldings:[{rail:'LISTED_EQUITY',instrumentId:'SIM-EQUITY-ONE',units:5}]
});
const intent=()=>({
  schema:'project9-sim-order-intent-v1',scope:'FICTIONAL_OFFLINE',
  intentId:'SIM-ORDER-A',side:'BUY',orderType:'LIMIT',units:4,
  limitPriceTicks:1000,
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
  eventId:'SIM-EVENT-'+id,intentId:'SIM-ORDER-A',kind,filledUnits
});
async function journalFixture(){
  const dir=await mkdtemp(join(tmpdir(),'p9-execution-lab-'));
  let journal;
  try{
    journal=await openFictionalExecutionJournal(dir);
    await journal.initializeRiskPolicy(policy());
    await journal.submit(intent());
    await journal.recordEvent(event('ACK','ACK'));
    await journal.recordEvent(event('FILL','FILL',1));
    await journal.recordEvent(event('CANCEL','CANCEL'));
    return await journal.report();
  }finally{if(journal)await journal.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
}
const create=(journalReport,dataset,asOf=dataset.sourceAsOf)=>
  buildStarNetEvidenceReadiness({
    journalReport,marketBytes:Buffer.from(JSON.stringify(dataset)),
    asOf,sourceKind:'USER_SUPPLIED_UNVERIFIED_JSON'
  });

test('three level demo recalculates hypothetical arithmetic and descriptive research, never authenticates source',async()=>{
  const report=await runEvidenceCli(['--demo']);
  assert.equal(report.schema,'project9-starnet-three-level-evidence-readiness-v1');
  assert.equal(report.overall.finding,'NO_GO');
  assert.equal(report.overall.levelsAreIndependent,true);
  assert.equal(report.overall.realOrdersCreated,0);
  assert.equal(report.overall.blockchainTransactionsBroadcast,0);
  assert.equal(report.overall.liveTradingEnabled,false);
  assert.equal(report.levels.engineering.level,1);
  assert.equal(report.levels.engineering.status,'PASS_FICTIONAL_ARITHMETIC_ONLY');
  assert.equal(report.levels.engineering.reviewedEvents,3);
  assert.equal(report.levels.engineering.reconstructedCashTicks,8000);
  assert.equal(report.levels.engineering.providerExecutionsAuthenticated,false);
  assert.equal(report.levels.research.level,2);
  assert.equal(report.levels.research.status,'PARTIAL_DESCRIPTIVE_CHECKS_ONLY');
  assert.equal(report.levels.research.sourceKind,'ENGINEERED_OFFLINE_FIXTURE');
  assert.equal(report.levels.research.historicalBars,190);
  assert.equal(report.levels.research.chronology.contiguousNoShuffle,true);
  assert.equal(report.levels.research.chronology.windowsContainedWithinOwnPartition,true);
  assert.equal(report.levels.research.chronology.hypotheticalCostsWorsenMean,true);
  assert.equal(report.levels.research.historicalAuthenticityIndependentlyVerified,false);
  assert.equal(report.levels.research.testedOutOfSampleEfficacy,false);
  assert.equal(report.levels.operations.level,3);
  assert.equal(report.levels.operations.status,'NOT_VERIFIED');
  assert.equal(report.levels.operations.localMacAcceptance,'NOT_RUN');
  assert.equal(report.overall.productionGate,'NO_GO');
  assert.equal(report.levels.research.inputByteSha256.length,64);
});

test('markdown and JSON preserve distinct evidence gates',async()=>{
  const json=await runEvidenceCli(['--demo']);
  const md=await runEvidenceCli(['--demo','--markdown']);
  assert.ok(md.startsWith('# StarNet — Three-Level Evidence Readiness'));
  assert.match(md,/PASS_FICTIONAL_ARITHMETIC_ONLY/);
  assert.match(md,/PARTIAL_DESCRIPTIVE_CHECKS_ONLY/);
  assert.match(md,/Historical source authenticity/);
  assert.match(md,/NO_GO/);
  assert.equal(renderStarNetEvidenceMarkdown(json),md);
  assert.equal((await runEvidenceCli(['--demo'])).levels.research.inputByteSha256,
    json.levels.research.inputByteSha256);
  assert.equal((await runEvidenceCli(['--demo'])).levels.engineering.journalHeadSha256,
    json.levels.engineering.journalHeadSha256);
});

test('self-declared externally reviewed provenance never becomes independent authentication',async()=>{
  const journal=await journalFixture(),data=baseMarket();
  const report=create(journal,data);
  assert.equal(report.levels.research.declaredProvenanceContract,'V2_DECLARED');
  assert.equal(report.levels.research.sourceKind,'USER_SUPPLIED_UNVERIFIED_JSON');
  assert.equal(report.levels.research.readinessReviewReasons.length,0);
  assert.equal(report.levels.research.dataReadinessStatus,'STRUCTURALLY_CLEAN_UNVERIFIED');
  assert.equal(report.levels.research.historicalAuthenticityIndependentlyVerified,false);
  assert.equal(report.levels.research.pointInTimeUniverseIndependentlyVerified,false);
  assert.equal(report.levels.research.corporateActionsIndependentlyVerified,false);
  assert.equal(report.levels.research.executableBidAskAndLiquidityVerified,false);
  assert.equal(report.overall.autoPromotionAllowed,false);
  assert.equal(report.overall.productionGate,'NO_GO');
});

test('historical source inputs remain correctly byte-identified, flagged when stale, and never echoed',async()=>{
  const data=baseMarket();
  const dir=await mkdtemp(join(tmpdir(),'p9-evidence-report-'));
  try{
    const contents=Buffer.from(JSON.stringify(data,null,2)+'\n');
    const path=join(dir,'permitted-local-history.json');
    await writeFile(path,contents);
    const date=new Date(data.sourceAsOf+'T00:00:00.000Z');
    date.setUTCDate(date.getUTCDate()+8);
    const cutoff=date.toISOString().slice(0,10);
    const report=await runEvidenceCli(['--as-of',cutoff,path]);
    assert.equal(report.levels.research.inputByteSha256,
      createHash('sha256').update(contents).digest('hex'));
    assert.equal(report.levels.research.reviewDate,cutoff);
    assert.ok(report.levels.research.readinessReviewReasons.includes('LAST_COMPLETED_BAR_OVER_FIVE_CALENDAR_DAYS_OLD'));
    assert.equal(report.levels.research.historicalAuthenticityIndependentlyVerified,false);
    assert.equal(report.levels.operations.status,'NOT_VERIFIED');
    const md=await runEvidenceCli(['--as-of',cutoff,path,'--markdown']);
    assert.match(md,/NO_GO/);
    assert.doesNotMatch(md,/permitted-local-history/);
    assert.deepEqual(await readFile(path),contents);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('invalid or conflicting engineering reports fail closed rather than elevating research levels',async()=>{
  const data=baseMarket(),journal=await journalFixture();
  for(const mutator of [
    report=>{report.controls.productionGate='GO';},
    report=>{report.risk.cash.totalTicks+=1;},
    report=>{report.risk.decisions[0].filledUnits=99;},
    report=>{report.risk.controls.externalCalls=1;},
    report=>{report.headHash='broken';},
    report=>{delete report.risk;},
    report=>{report.records[0].safety.realOrdersCreated=1;}
  ]){
    const tampered=structuredClone(journal);
    mutator(tampered);
    assert.throws(()=>create(tampered,data),/refused/i);
  }
});

test('historical date leakage, malformed OHLC, duplicate bars and unsupported scope fail closed',async()=>{
  const journal=await journalFixture(),data=baseMarket();
  const oldDate=new Date(data.sourceAsOf+'T00:00:00Z');
  oldDate.setUTCDate(oldDate.getUTCDate()-15);
  const cutoff=oldDate.toISOString().slice(0,10);
  assert.throws(()=>create(journal,data,cutoff),/after review date|refused/);
  const badOHLC=structuredClone(data);
  badOHLC.bars[30].high=0;
  assert.throws(()=>create(journal,badOHLC),/invalid|inconsistent/);
  const duplicate=structuredClone(data);
  duplicate.bars[80].date=duplicate.bars[79].date;
  assert.throws(()=>create(journal,duplicate),/strictly ascending/);
  assert.throws(()=>buildStarNetEvidenceReadiness({
    journalReport:journal,marketBytes:Buffer.from('{"live":true}'),
    asOf:data.sourceAsOf,sourceKind:'REAL_BROKER'}),/refused/);
  assert.throws(()=>buildStarNetEvidenceReadiness({
    journalReport:journal,marketBytes:Buffer.from('invalid json'),
    asOf:data.sourceAsOf,sourceKind:'USER_SUPPLIED_UNVERIFIED_JSON'}),/refused/);
  assert.throws(()=>buildStarNetEvidenceReadiness({
    journalReport:journal,marketBytes:Buffer.from(JSON.stringify(data)),
    asOf:'2026-02-30',sourceKind:'USER_SUPPLIED_UNVERIFIED_JSON'}),/refused/);
  assert.throws(()=>renderStarNetEvidenceMarkdown({
    schema:'project9-starnet-three-level-evidence-readiness-v1',
    overall:{productionGate:'GO'}}),/refused/);
});

test('strict CLI argument parsing refuses live mode and arbitrary extra fields',()=>{
  assert.deepEqual(parseEvidenceArgs(['--demo']),{mode:'DEMO',markdown:false});
  assert.deepEqual(parseEvidenceArgs(['--demo','--markdown']),{mode:'DEMO',markdown:true});
  for(const input of [
    [],['--live'],['--demo','--broker'],['--demo','--live'],
    ['--as-of','2026-02-30','history.json'],
    ['--as-of','2026-01-01','--broker'],
    ['--as-of','2026-01-01','history.json','--live'],
    ['--as-of','2026-01-01','history.json','--markdown','--broker']
  ])assert.throws(()=>parseEvidenceArgs(input),/Usage/);
});
