/**
 * Reproducible, non-overlapping historical paper setup outcomes.
 * Classify at completed close i; observe next completed session open;
 * mark an entirely hypothetical exit at completed close i + holdingBars.
 * Neither prices nor modeled costs are executable brokerage quotes.
 */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateSwingSetup,isStrictISODate,normalizeMarketDataset} from '../src/market-intelligence.mjs';

const rounded=(n)=>Number(n.toFixed(4));

export function auditPaperForward(input,{asOf,holdingBars=5,feeBps=10,slippageBps=10}={}){
  if(!isStrictISODate(asOf))throw new Error('A strict --as-of YYYY-MM-DD is required');
  if(!Number.isSafeInteger(holdingBars)||holdingBars<1||holdingBars>30)
    throw new Error('holdingBars must be 1–30 completed sessions');
  if(!Number.isFinite(feeBps)||feeBps<0||feeBps>250||
     !Number.isFinite(slippageBps)||slippageBps<0||slippageBps>250)
    throw new Error('Modeled fee and slippage must each be 0–250 basis points');
  const dataset=normalizeMarketDataset(input);
  const bars=dataset.bars;
  const end=bars.findLastIndex(bar=>bar.date<=asOf);
  if(end<51)throw new Error('Need at least 52 completed bars through --as-of');

  const observations=[];
  let evaluatedSignals=0;
  for(let i=50;i+holdingBars<=end;){
    // No price after this completed signal date enters the classifier.
    // evaluateSwingSetup validates its input itself. Never send it the
    // normalized dataset with the internal provenance.contract field.
    const signal=evaluateSwingSetup(input,{asOfIndex:i});
    evaluatedSignals+=1;
    if(signal.classification==='NO_PAPER_SETUP'){
      i+=1;continue;
    }
    const enter=bars[i+1],exit=bars[i+holdingBars];
    const modeledEntry=enter.open*(1+slippageBps/10_000);
    const modeledExit=exit.close*(1-slippageBps/10_000);
    const netPct=100*(modeledExit*(1-feeBps/10_000)-
      modeledEntry*(1+feeBps/10_000))/modeledEntry;
    observations.push({
      symbol:dataset.symbol,
      signalDate:bars[i].date,
      simulatedEntryDate:enter.date,
      simulatedExitDate:exit.date,
      classificationAtSignal:signal.classification,
      scoreAtSignal:signal.score,
      simulatedEntryReference:rounded(modeledEntry),
      simulatedExitReference:rounded(modeledExit),
      modeledNetChangePct:rounded(netPct),
      successfulModeledOutcome:netPct>0
    });
    // No overlapping hypothetical positions in this symbol.
    i+=holdingBars;
  }
  const mean=observations.length?
    rounded(observations.reduce((a,o)=>a+o.modeledNetChangePct,0)/observations.length):null;
  const wins=observations.filter(o=>o.successfulModeledOutcome).length;
  return {
    schema:'project9-paper-forward-audit-v1',
    symbol:dataset.symbol,
    source:dataset.source,
    sourceAsOf:dataset.sourceAsOf,
    reviewDate:asOf,
    lastCompletedBarUsed:bars[end].date,
    holdingBars,
    modeledCosts:{feeBpsEachSide:feeBps,adverseSlippageBpsEachSide:slippageBps},
    evaluatedSignalDates:evaluatedSignals,
    closedHypotheticalObservations:observations.length,
    meanModeledNetChangePct:mean,
    positiveOutcomeRatePct:observations.length?rounded(100*wins/observations.length):null,
    outcomes:observations,
    safety:{
      analysis:'RETROSPECTIVE_OFFLINE_PAPER_RESEARCH',
      dataAuthenticityIndependentlyVerified:false,
      outOfSampleStrategyAccuracyVerified:false,
      transactionPricesExecutable:false,
      brokerConnected:false,
      realOrdersCreated:false,
      outcomeDataUsedInSignalClassification:false
    }
  };
}

export async function auditLocalPaperForwardFiles(files,options){
  if(!Array.isArray(files)||files.length<1||files.length>20)
    throw new Error('Supply 1–20 permitted market-data JSON files');
  const symbols=new Set(),results=[];
  for(const file of files){
    const bytes=await readFile(resolve(file));
    if(bytes.length>2_500_000)throw new Error('Market-data JSON exceeds audit size limit');
    const input=JSON.parse(bytes.toString('utf8'));
    const output=auditPaperForward(input,options);
    if(symbols.has(output.symbol))throw new Error('Duplicate market symbol');
    symbols.add(output.symbol);
    results.push({...output,fileSha256:createHash('sha256').update(bytes).digest('hex')});
  }
  return {
    schema:'project9-paper-forward-batch-v1',
    datasetCount:results.length,
    researchOnly:true,
    realOrdersCreated:false,
    results
  };
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  let cursor=0;
  const options={};
  const map=new Map([['--as-of','asOf'],['--hold-bars','holdingBars'],
    ['--fee-bps','feeBps'],['--slippage-bps','slippageBps']]);
  while(cursor<args.length&&args[cursor].startsWith('--')){
    const property=map.get(args[cursor]);
    if(!property||cursor+1>=args.length){console.error('Invalid audit option');process.exit(2);}
    options[property]=property==='asOf'?args[cursor+1]:Number(args[cursor+1]);
    cursor+=2;
  }
  if(!options.asOf||cursor>=args.length){
    console.error('Usage: npm run research:paper-forward -- --as-of YYYY-MM-DD [--hold-bars 5] [--fee-bps 10] [--slippage-bps 10] file.json [...]');
    process.exitCode=2;
  }else{
    try{
      const report=await auditLocalPaperForwardFiles(args.slice(cursor),options);
      process.stdout.write(JSON.stringify(report,null,2)+'\n');
    }catch(error){
      console.error('Paper-forward research failed:',error.message);
      process.exitCode=1;
    }
  }
}
