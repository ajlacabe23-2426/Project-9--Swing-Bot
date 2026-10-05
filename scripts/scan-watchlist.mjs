import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {rankWatchlist} from '../src/market-intelligence.mjs';

function usage(){
  console.error('Usage: node scripts/scan-watchlist.mjs <market-dataset.json> [more-datasets.json ...]');
}
const files=process.argv.slice(2);
if(!files.length||files.length>100){usage();process.exitCode=2;}
else{
  try{
    const inputs=[];
    for(const file of files){
      const text=await readFile(resolve(file),'utf8');
      const parsed=JSON.parse(text);
      inputs.push(parsed);
    }
    const ranked=rankWatchlist(inputs);
    const output={
      schema:'project9-watchlist-scan-v1',
      generatedAt:new Date().toISOString(),
      mode:'RESEARCH_DECISION_SUPPORT',
      count:ranked.length,
      results:ranked.map(result=>({
        symbol:result.symbol,
        asOf:result.asOf,
        score:result.score,
        classification:result.classification,
        source:result.source,
        observed:result.observed,
        checks:result.checks,
        paperRiskPlan:result.paperRiskPlan,
        safety:result.safety
      }))
    };
    process.stdout.write(JSON.stringify(output,null,2)+'\n');
  }catch(error){
    console.error('Market scan failed:',error.message);
    process.exitCode=1;
  }
}
