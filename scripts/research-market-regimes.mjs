import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeMarketRegimeWindows} from '../src/market-regime-research.mjs';

export async function analyzeLocalRegimeFiles(files,reviewDate,windowBars=20){
  if(!Array.isArray(files)||files.length<1||files.length>100)
    throw new Error('Provide 1–100 local market-data JSON files');
  const entries=[];
  for(const path of files){
    const bytes=await readFile(resolve(path));
    if(bytes.length>2_000_000)throw new Error('Local dataset exceeds 2 MB: '+basename(path));
    entries.push({
      filename:basename(path),
      sha256:createHash('sha256').update(bytes).digest('hex'),
      data:JSON.parse(bytes.toString('utf8'))
    });
  }
  return analyzeMarketRegimeWindows(entries,{reviewDate,windowBars});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  if(args.length<3||args[0]!=='--as-of'){
    console.error('Usage: npm run research:regimes -- --as-of YYYY-MM-DD [--window-bars 20] path/to/SYMBOL.json ...');
    process.exitCode=2;
  }else{
    try{
      const reviewDate=args[1];let cursor=2,windowBars=20;
      if(args[cursor]==='--window-bars'){
        windowBars=Number(args[cursor+1]);
        cursor+=2;
      }
      const output=await analyzeLocalRegimeFiles(args.slice(cursor),reviewDate,windowBars);
      process.stdout.write(JSON.stringify(output,null,2)+'\n');
    }catch(error){
      console.error('Retrospective market regime research failed:',error.message);
      process.exitCode=1;
    }
  }
}
