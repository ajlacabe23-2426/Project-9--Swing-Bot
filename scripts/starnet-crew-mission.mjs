/**
 * StarNet crew mission bridge: one deterministic research run and an optional
 * write-capable paper journal cycle, with private machine-readable deliverables.
 * This is invoked by a trusted StarNet Workbench or an ordinary local terminal.
 * AI agents do not choose or route market orders.
 */
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {auditLocalMarketFiles} from './audit-watchlist-data.mjs';
import {analyzeLocalRegimeFiles} from './research-market-regimes.mjs';
import {auditLocalPaperForwardFiles} from './paper-forward-audit.mjs';
import {runOperationalCycle,validatePort} from './agent-operational-cycle.mjs';
import {isStrictISODate} from '../src/market-intelligence.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const symbolPattern=/^[A-Z][A-Z0-9.\\-]{0,14}$/;
const syntheticName=/synthetic|fictitious|simulated|engineered demo/i;

export function parseMissionArgs(args){
  const options={symbols:['SIM09','SIM10'],demo:false,paperAuto:false,windowBars:20};
  const inputKeys=new Set();
  for(let i=0;i<args.length;i++){
    const argument=args[i];
    if(['--demo','--paper-auto'].includes(argument)){
      if(inputKeys.has(argument))throw new Error('Repeated option '+argument);
      options[argument==='--demo'?'demo':'paperAuto']=true;
      inputKeys.add(argument);
      continue;
    }
    if(!['--as-of','--symbols','--window-bars'].includes(argument)||inputKeys.has(argument)||!args[i+1])
      throw new Error('Usage: npm run starnet:mission -- --as-of YYYY-MM-DD [--symbols SIM09,SIM10] [--window-bars 20] [--demo] [--paper-auto]');
    inputKeys.add(argument);
    const value=args[++i];
    if(argument==='--as-of')options.asOf=value;
    else if(argument==='--symbols')options.symbols=value.split(',').map(s=>s.trim().toUpperCase());
    else options.windowBars=Number(value);
  }
  if(!isStrictISODate(options.asOf))throw new Error('Specify a valid --as-of YYYY-MM-DD');
  if(!Array.isArray(options.symbols)||options.symbols.length===0||options.symbols.length>20||
     options.symbols.some(s=>!symbolPattern.test(s)||s.includes('..'))||
     new Set(options.symbols).size!==options.symbols.length)
    throw new Error('Specify 1–20 unique simple market symbols');
  if(!Number.isInteger(options.windowBars)||options.windowBars<10||options.windowBars>60)
    throw new Error('Window length must be 10–60');
  return options;
}

function summarize(audit,regimes,paperForward,cycle){
  return {
    inputDatasetCount:audit.datasetCount,
    datasetsNeedingReview:audit.reviewRequiredCount,
    historicalWindowCount:regimes.results.reduce((n,item)=>n+item.historicalWindowCount,0),
    closedHypotheticalObservations:paperForward.results.reduce((n,item)=>n+item.closedHypotheticalObservations,0),
    virtualTicketsCreated:cycle?.mutations?.virtualTicketsCreated??0,
    refreshErrors:cycle?.refreshErrors?.length??0
  };
}
export function renderMissionMarkdown(report){
  const lines=[
    '# Project 9 / StarNet — mission report',
    '',
    'Generated (UTC): '+report.generatedAt,
    'Research as-of: '+report.asOf,
    'Mode: '+report.mode,
    'Run: '+report.runId,
    '',
    '## What ran',
    '- Data-quality and provenance audit: completed',
    '- Historical-condition research: completed',
    '- Retrospective hypothetical outcome audit: completed',
    '- Workstation refresh / paper-ticket write: '+(report.operations.paperCycle?'requested and completed':'not requested'),
    '',
    '## Data quality',
  ];
  for(const item of report.audit.datasets){
    lines.push('- '+item.symbol+' | '+item.researchReadiness+
      ' | '+item.observedBars+' completed bars | SHA-256 '+item.fileSha256+
      ' | '+(item.reviewReasons.length?item.reviewReasons.join(', '):'No configured review flags'));
  }
  lines.push('','## Historical research');
  for(const item of report.regimes.results)
    lines.push('- '+item.symbol+': '+item.historicalWindowCount+' retrospective windows ('+
      Object.entries(item.conditionCounts).map(([name,n])=>name+' '+n).join('; ')+')');
  lines.push('','## Hypothetical outcomes');
  for(const item of report.paperForward.results)
    lines.push('- '+item.symbol+': '+item.closedHypotheticalObservations+
      ' hypothetical completed observations; mean modeled change '+
      (item.meanModeledNetChangePct===null?'not available':item.meanModeledNetChangePct+'%')+
      '; modeled positive rate '+(item.positiveOutcomeRatePct===null?'not available':item.positiveOutcomeRatePct+'%'));
  lines.push('','## Paper journal actions');
  if(report.paperCycle){
    for(const action of report.paperCycle.actions)
      lines.push('- '+action.symbol+': '+action.status+(action.ticketId?' ('+action.ticketId+')':''));
    for(const issue of report.paperCycle.refreshErrors)
      lines.push('- REFRESH ERROR '+issue.symbol+': '+String(issue.message).slice(0,140));
  }else lines.push('- No journal mutation requested.');
  lines.push('','## Mandatory limits',
    '- Synthetic demonstrations do not represent real price performance.',
    '- Historical data provenance, corporate actions, market regimes and out-of-sample validity need independent review.',
    '- All fills and outcomes are hypothetical; no brokerage accounts or real-money orders.',
    '- Read the full machine report in latest.json before making research decisions.',
    '');
  return lines.join('\n');
}
async function persistReport(outputDir,report){
  await mkdir(outputDir,{recursive:true,mode:0o700});
  const id=randomUUID();
  const destinations=[
    {path:join(outputDir,'latest.json'),body:JSON.stringify(report,null,2)+'\n'},
    {path:join(outputDir,'latest.md'),body:renderMissionMarkdown(report)}
  ];
  for(const target of destinations){
    const temp=target.path+'.'+id+'.tmp';
    await writeFile(temp,target.body,{encoding:'utf8',mode:0o600,flag:'wx'});
    await rename(temp,target.path);
  }
  return Object.fromEntries(destinations.map(target=>[target.path.endsWith('.json')?'json':'markdown',target.path]));
}

export async function runStarNetMission({
  asOf,symbols=['SIM09','SIM10'],windowBars=20,demo=false,paperAuto=false,
  dataDir=join(root,'.data'),reportDir=null,port=4179,
  now=new Date(),cycleRunner=runOperationalCycle
}={}){
  if(!isStrictISODate(asOf))throw new Error('Valid as-of date required');
  if(!Array.isArray(symbols)||symbols.length<1||symbols.length>20||
     symbols.some(s=>typeof s!=='string'||!symbolPattern.test(s)||s.includes('..'))||
     new Set(symbols).size!==symbols.length)
    throw new Error('Invalid or duplicate symbols');
  if(!Number.isInteger(windowBars)||windowBars<10||windowBars>60)
    throw new Error('Invalid windowBars');
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new Error('Invalid run timestamp');
  if(typeof paperAuto!=='boolean'||typeof demo!=='boolean')throw new Error('Invalid mission mode');
  port=validatePort(port);
  dataDir=resolve(dataDir);
  const paths=[];
  for(const symbol of symbols){
    const path=join(dataDir,symbol+'.json');
    const bytes=await readFile(path);
    if(bytes.byteLength>2_000_000)throw new Error('Dataset exceeds 2 MB: '+symbol);
    const dataset=JSON.parse(bytes.toString('utf8'));
    if(dataset.symbol!==symbol)throw new Error('Dataset symbol does not match local filename: '+symbol);
    if(demo&&!syntheticName.test(dataset.source||''))
      throw new Error('Explicit demo mode accepts labeled synthetic datasets only: '+symbol);
    paths.push(path);
  }
  // Run every independent research verification BEFORE write-capable cycle.
  // If any input or historical evaluation fails, no paper ticket is created.
  const audit=await auditLocalMarketFiles(paths,asOf);
  const regimes=await analyzeLocalRegimeFiles(paths,asOf,windowBars);
  const paperForward=await auditLocalPaperForwardFiles(paths,{asOf,holdingBars:5,feeBps:10,slippageBps:10});
  const paperCycle=paperAuto?await cycleRunner({port,autoPaper:true,allowSyntheticDemo:demo,now}):null;
  const report={
    schema:'project9-starnet-crew-mission-v1',
    runId:randomUUID(),generatedAt:now.toISOString(),
    asOf,mode:demo?'SYNTHETIC_RESEARCH_DEMO':'UNVERIFIED_HISTORICAL_RESEARCH',
    symbols,operations:{audit:true,regimeResearch:true,hypotheticalOutcomeAudit:true,
      paperCycle:paperAuto},
    summary:summarize(audit,regimes,paperForward,paperCycle),
    audit,regimes,paperForward,paperCycle,
    guardrails:{brokerConnected:false,realOrdersCreated:false,
      syntheticCannotEstablishProfitability:true,executionAllowed:false}
  };
  const deliverables=await persistReport(resolve(reportDir||join(dataDir,'starnet')),report);
  return {schema:report.schema,runId:report.runId,mode:report.mode,
    summary:report.summary,deliverables,
    paperActions:paperCycle?.actions||[],
    realOrdersCreated:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const options=parseMissionArgs(process.argv.slice(2));
    runStarNetMission({...options,port:process.env.PORT||4179})
      .then(value=>process.stdout.write(JSON.stringify(value,null,2)+'\n'))
      .catch(error=>{console.error('Project 9 StarNet mission failed:',error.message);process.exitCode=1;});
  }catch(error){console.error(error.message);process.exitCode=2;}
}
