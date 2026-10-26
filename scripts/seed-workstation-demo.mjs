/** Reproducible, fully invented workstation demonstration. Never market history. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {CURRENT_MARKET_DATA_SCHEMA,normalizeMarketDataset,evaluateSwingSetup} from '../src/market-intelligence.mjs';
import {WorkstationStore} from '../src/workstation-store.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const LABEL='Project 9 ENGINEERED SYNTHETIC DEMO - NOT REAL MARKET DATA';
export const DEMO_SYMBOLS=['SIM09','SIM10'];

export function buildDemoDataset(symbol,{retrievedAt='2026-10-24T00:00:00.000Z'}={}){
  if(!DEMO_SYMBOLS.includes(symbol))throw new Error('Unknown demo symbol');
  const upward=symbol==='SIM09';
  const bars=[],date=new Date('2025-09-01T00:00:00.000Z');
  while(bars.length<120){
    date.setUTCDate(date.getUTCDate()+1);
    if([0,6].includes(date.getUTCDay()))continue;
    const index=bars.length;
    const close=Number((upward?100+index*0.22:145-index*0.18).toFixed(4));
    const open=Number((close+(upward?-0.08:0.08)).toFixed(4));
    bars.push({date:date.toISOString().slice(0,10),open,
      high:Number((Math.max(open,close)+0.12).toFixed(4)),
      low:Number((Math.min(open,close)-0.12).toFixed(4)),
      close,volume:100_000+index*20});
  }
  if(upward){
    const last=bars.at(-1),previous=bars.at(-2);
    last.open=Number((previous.close+0.03).toFixed(4));
    last.close=Number((Math.max(...bars.slice(-21,-1).map(b=>b.high))*1.025).toFixed(4));
    last.high=Number((last.close+0.15).toFixed(4));
    last.low=Number((last.open-0.15).toFixed(4));
    last.volume=350_000;
  }
  const dataset={
    schema:CURRENT_MARKET_DATA_SCHEMA,symbol,currency:'USD',
    source:LABEL,mode:'HISTORICAL',sourceAsOf:bars.at(-1).date,
    priceAdjustment:'RAW',
    provenance:{retrievedAt,adjustmentMethod:'RAW_UNADJUSTED',
      corporateActions:'NOT_VERIFIED',survivorship:'NOT_ASSESSED',
      licensing:'NOT_VERIFIED'},
    bars
  };
  normalizeMarketDataset(dataset);
  return dataset;
}

export async function seedWorkstationDemo({dataDir=join(root,'.data')}={}){
  dataDir=resolve(dataDir);
  const store=new WorkstationStore(join(dataDir,'workstation.json'));
  await store.init();
  const existing=store.snapshot().watchlist;
  if(new Set([...existing,...DEMO_SYMBOLS]).size>20)
    throw new Error('Watchlist is full; demo seeding will not remove saved symbols');
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
