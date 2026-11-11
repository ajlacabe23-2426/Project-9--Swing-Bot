/** Repeatable one-command offline daily breakout screen + paper audit. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeDailyBreakout} from '../src/daily-breakout-research.mjs';
import {researchManifest} from '../src/research-manifest.mjs';

export async function inspectDailyBreakoutFiles(paths,{asOf=null}={}){
  if(!Array.isArray(paths)||paths.length===0||paths.length>20)
    throw new Error('Supply 1–20 local JSON datasets');
  const symbols=new Set(),results=[];
  for(const path of paths){
    const bytes=await readFile(resolve(path));
    if(bytes.length>2_500_000)throw new Error('Dataset exceeds 2.5 MB audit limit');
    const data=JSON.parse(bytes.toString('utf8'));
    const result=analyzeDailyBreakout(data,{asOf});
    if(symbols.has(result.symbol))throw new Error('Duplicate market symbol');
    symbols.add(result.symbol);
    const inputSha256=createHash('sha256').update(bytes).digest('hex');
    results.push({...result,inputSha256,...await researchManifest(result,inputSha256)});
  }
  return {
    schema:'project9-daily-breakout-multi-symbol-report-v2',
    mode:'OFFLINE_DAILY_CLOSE_PAPER_RESEARCH',
    datasetCount:results.length,
    realOrdersCreated:false,
    results
  };
}

function formatSummary(report){
  const lines=[
    'PROJECT 9 | DAILY 20-HIGH / 50-SMA | PAPER RESEARCH ONLY',
    'Symbol      Date         Above SMA50   Breakout   Closed paper tests   Positive rate   Mean change',
  ];
  for(const entry of report.results){
    const checks=entry.latestSetup.checks;
    const rate=entry.positiveOutcomeRatePct===null?'n/a':entry.positiveOutcomeRatePct+'%';
    const mean=entry.meanModeledAfterCostChangePct===null?'n/a':
      entry.meanModeledAfterCostChangePct+'%';
    lines.push([
      entry.symbol.padEnd(11),
      entry.latestCompletedBar.padEnd(12),
      String(checks.above50DayAverage).padEnd(13),
      String(checks.brokePrior20DayHigh).padEnd(10),
      String(entry.closedPaperObservations).padEnd(20),
      rate.padEnd(15),
      mean,
    ].join(' '));
    lines.push('  Latest: '+entry.latestSetup.signal+
      ' | Source: '+entry.source.name+' ('+entry.source.mode+')');
  }
  lines.push('Historical paper results only; not predicted returns, validated fills or broker orders.');
  return lines.join('\n')+'\n';
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  let asOf=null,json=false;
  const files=[];
  let invalid=false;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--as-of'&&i+1<args.length){asOf=args[++i];}
    else if(args[i]==='--json'){json=true;}
    else if(args[i].startsWith('--'))invalid=true;
    else files.push(args[i]);
  }
  if(invalid||!files.length){
    console.error('Usage: npm run research:daily -- [--as-of YYYY-MM-DD] [--json] file.json [file.json ...]');
    process.exitCode=2;
  }else{
    try{
      const report=await inspectDailyBreakoutFiles(files,{asOf});
      process.stdout.write(json?JSON.stringify(report,null,2)+'\n':formatSummary(report));
    }catch(error){
      console.error('Daily breakout research failed:',error.message);
      process.exitCode=1;
    }
  }
}
