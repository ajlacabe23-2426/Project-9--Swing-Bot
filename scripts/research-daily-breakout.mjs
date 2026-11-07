/** Repeatable one-command offline daily breakout screen + paper audit. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeDailyBreakout} from '../src/daily-breakout-research.mjs';

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
    results.push({...result,inputSha256:createHash('sha256').update(bytes).digest('hex')});
  }
  return {
    schema:'project9-daily-breakout-multi-symbol-report-v1',
    mode:'OFFLINE_DAILY_CLOSE_PAPER_RESEARCH',
    datasetCount:results.length,
    realOrdersCreated:false,
    results
  };
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  let asOf=null,files=args;
  if(args[0]==='--as-of'){
    if(args.length<3){console.error('Missing --as-of value or JSON file');process.exit(2);}
    asOf=args[1];files=args.slice(2);
  }
  if(!files.length||files.some(file=>file.startsWith('--'))){
    console.error('Usage: npm run research:daily -- [--as-of YYYY-MM-DD] file.json [file.json ...]');
    process.exitCode=2;
  }else{
    try{
      const report=await inspectDailyBreakoutFiles(files,{asOf});
      process.stdout.write(JSON.stringify(report,null,2)+'\n');
    }catch(error){
      console.error('Daily breakout research failed:',error.message);
      process.exitCode=1;
    }
  }
}
