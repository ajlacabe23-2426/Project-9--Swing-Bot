import {stdin,stdout,stderr,env} from 'node:process';
import {fetchMassiveDailyDataset} from '../src/providers/massive.mjs';
import {loadMarketDataKey,saveMarketDataKey,validateMassiveKey} from '../src/market-credentials.mjs';
import {MarketCache} from '../src/market-cache.mjs';

/** Hide credentials from terminal echo and shell command history. */
async function readPrivateKey(){
  if(!stdin.isTTY||typeof stdin.setRawMode!=='function'){
    throw new Error('An interactive terminal is required. Alternatively set MASSIVE_API_KEY in the environment.');
  }
  const initiallyRaw=!!stdin.isRaw;
  stdout.write('Paste your Massive Stocks API key (hidden), then press Enter: ');
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve,reject)=>{
    let value='';
    function complete(error){
      stdin.removeListener('data',onData);
      stdin.setRawMode(initiallyRaw);
      stdin.pause();
      stdout.write('\n');
      if(error)reject(error);else resolve(value.trim());
    }
    function onData(bytes){
      for(const char of bytes.toString('utf8')){
        if(char==='\u0003'){complete(new Error('Setup cancelled'));return;}
        if(char==='\r'||char==='\n'){complete();return;}
        if(char==='\u007f'||char==='\b'){value=value.slice(0,-1);continue;}
        if(char>=' '&&char<='\u007e'){
          if(value.length>=512){complete(new Error('API key exceeds length limit'));return;}
          value+=char;
        }
      }
    }
    stdin.on('data',onData);
  });
}

async function verifyKey(key){
  const yesterday=new Date();
  yesterday.setUTCDate(yesterday.getUTCDate()-1);
  const start=new Date(yesterday);
  start.setUTCDate(start.getUTCDate()-420);
  const to=yesterday.toISOString().slice(0,10);
  const from=start.toISOString().slice(0,10);
  const data=await fetchMassiveDailyDataset({symbol:'AAPL',from,to,apiKey:key});
  if(data.symbol!=='AAPL'||data.bars.length<60)throw new Error('AAPL market-data validation did not pass');
  return data;
}

async function main(){
  const action=process.argv[2]??'configure';
  if(!['configure','check'].includes(action))throw new Error('Use: npm run setup:market [-- check]');
  const existing=await loadMarketDataKey();
  if(action==='check'&&!existing)throw new Error('No provider key configured. Run: npm run setup:market');
  const key=validateMassiveKey(action==='check'?existing:env.MASSIVE_API_KEY||await readPrivateKey());
  stderr.write('Checking a real historical AAPL response from Massive (one API call)...\n');
  const data=await verifyKey(key);
  if(action==='configure')await saveMarketDataKey(key);
  // Preserve a validated snapshot to support an explicit offline cache fallback.
  const cache=new MarketCache();
  try{
    await cache.save(data);
  }catch(error){
    if(!/Conflicting same-date market history/.test(error.message))throw error;
    stderr.write('Existing AAPL history differs on the same date; preserving it for review.\n');
  }
  stdout.write('Massive Stocks connection VERIFIED for historical AAPL daily bars.\n');
  stdout.write('Dataset observations: '+data.bars.length+'; latest completed bar: '+data.bars.at(-1).date+'\n');
  stdout.write('Key saved privately in the local git-ignored .data folder. Key was not printed.\n');
  stdout.write('Next: npm start, open /workstation.html, add AAPL, click Refresh.\n');
}

main().catch(error=>{
  stderr.write('Market-data setup failed: '+String(error.message||error)+'\n');
  process.exitCode=1;
});
