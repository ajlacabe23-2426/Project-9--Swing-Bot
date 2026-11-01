import {readFile,stat} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MarketCache} from '../src/market-cache.mjs';

const args=process.argv.slice(2);
if(args.length!==1){
  console.error('Usage: node scripts/import-market-dataset.mjs /absolute/path/to/market-dataset-v2.json');
  process.exitCode=2;
}else{
  try{
    const input=resolve(args[0]);
    if((await stat(input)).size>3_000_000)throw new Error('Import file exceeds 3 MB');
    const parsed=JSON.parse(await readFile(input,'utf8'));
    const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
    const cache=new MarketCache(resolve(root,'.data/market-cache'));
    const result=await cache.save(parsed);
    console.log(JSON.stringify({status:'IMPORTED_FOR_LOCAL_PAPER_RESEARCH',...result},null,2));
  }catch(error){
    console.error('Market dataset import rejected: '+error.message);
    process.exitCode=1;
  }
}
