/** Reproducible, fully invented workstation demonstration. Never market history. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {normalizeMarketDataset,evaluateSwingSetup} from '../src/market-intelligence.mjs';
import {WorkstationStore} from '../src/workstation-store.mjs';
import {buildDemoDataset,DEMO_SYMBOLS,LABEL} from '../src/synthetic-demo-fixture.mjs';
export {buildDemoDataset,DEMO_SYMBOLS};

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function seedWorkstationDemo({dataDir=join(root,'.data')}={}){
  dataDir=resolve(dataDir);
  const store=new WorkstationStore(join(dataDir,'workstation.json'));
  await store.init();
  const existing=store.snapshot().watchlist;
  if(new Set([...existing,...DEMO_SYMBOLS]).size>20)
    throw new Error('Watchlist is full; demo seeding will not remove saved symbols');
  // Preflight all demo symbols before writing either dataset. An existing
  // conflicting second symbol must not leave the first symbol half-seeded.
  for(const symbol of DEMO_SYMBOLS){
    const file=join(dataDir,symbol+'.json');
    let contents;
    try{contents=await readFile(file,'utf8');}
    catch(error){if(error.code==='ENOENT')continue;throw error;}
    let existingDataset;
    try{existingDataset=JSON.parse(contents);}
    catch{throw new Error('Existing demo data '+symbol+' is unreadable; preserving it');}
    if(existingDataset.source!==LABEL||existingDataset.symbol!==symbol)
      throw new Error('Refusing to overwrite existing local data for '+symbol);
    normalizeMarketDataset(existingDataset);
  }
  const summaries=[];
  await mkdir(dataDir,{recursive:true,mode:0o700});
  for(const symbol of DEMO_SYMBOLS){
    const file=join(dataDir,symbol+'.json');
    const expected=buildDemoDataset(symbol);
    let dataset=expected;
    try{
      await writeFile(file,JSON.stringify(expected,null,2)+'\n',{flag:'wx',mode:0o600});
    }catch(error){
      if(error.code!=='EEXIST')throw error;
      try{dataset=JSON.parse(await readFile(file,'utf8'));}catch{
        throw new Error('Existing demo data '+symbol+' is unreadable; preserving it');
      }
      if(dataset.source!==LABEL||dataset.symbol!==symbol)
        throw new Error('Refusing to overwrite existing local data for '+symbol);
      normalizeMarketDataset(dataset);
    }
    const evaluation=evaluateSwingSetup(dataset);
    summaries.push({symbol,asOf:evaluation.asOf,classification:evaluation.classification});
  }
  await store.setWatchlist([...existing,...DEMO_SYMBOLS.filter(s=>!existing.includes(s))]);
  return {symbols:summaries,watchlist:store.snapshot().watchlist,
    location:dataDir,synthetic:true,networkRequests:false,orders:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  seedWorkstationDemo().then(result=>{
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    process.stdout.write('Next: npm start ; open http://127.0.0.1:4179/workstation.html and click Refresh completed bars.\n');
  }).catch(error=>{console.error(error.message);process.exitCode=1;});
}
