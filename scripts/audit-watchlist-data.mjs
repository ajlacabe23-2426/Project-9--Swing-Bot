import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditMarketDatasetBatch} from '../src/market-readiness-audit.mjs';

export async function auditLocalMarketFiles(files,reviewDate){
  if(!Array.isArray(files)||files.length<1||files.length>100)
    throw new Error('Provide 1–100 local market-data JSON files');
  const entries=[];
  for(const file of files){
    const bytes=await readFile(resolve(file));
    if(bytes.length>2_000_000)throw new Error('Dataset exceeds 2 MB local audit limit: '+basename(file));
    entries.push({
      filename:basename(file),
      sha256:createHash('sha256').update(bytes).digest('hex'),
      data:JSON.parse(bytes.toString('utf8'))
    });
  }
  return auditMarketDatasetBatch(entries,{reviewDate});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  if(args.length<3||args[0]!=='--as-of'){
    console.error('Usage: npm run audit:market -- --as-of YYYY-MM-DD path/to/SYMBOL.json [more.json ...]');
    process.exitCode=2;
  }else{
    try{
      const report=await auditLocalMarketFiles(args.slice(2),args[1]);
      process.stdout.write(JSON.stringify(report,null,2)+'\n');
    }catch(error){
      console.error('Offline market audit failed:',error.message);
      process.exitCode=1;
    }
  }
}
