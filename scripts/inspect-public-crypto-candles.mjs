/** One-shot read-only public crypto candle quality inspection; no data writes. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fetchKrakenPublicOHLC} from '../src/providers/kraken-public-ohlc.mjs';

export async function inspectPublicCryptoCommand(args,{fetchImpl=globalThis.fetch,now=()=>new Date()}={}){
  if(!Array.isArray(args)||args.length!==2||
     !['BTC/USD','ETH/USD'].includes(args[0])||
     !['1','5','15','30','60','240','1440'].includes(args[1]))
    throw new TypeError('Usage: npm run crypto:inspect -- BTC/USD 60');
  const analysis=await fetchKrakenPublicOHLC({
    pair:args[0],intervalMinutes:Number(args[1]),fetchImpl,now
  });
  // Summarize quality without storing raw exchange samples on disk.
  const {completedCandles,...summary}=analysis;
  return {...summary,firstCompletedStartUtc:completedCandles[0].startUtc,
    latestCompletedClose:completedCandles.at(-1).close,
    storedResearchData:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  inspectPublicCryptoCommand(process.argv.slice(2))
    .then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
    .catch(error=>{process.stderr.write('Crypto research inspection refused: '+error.message+'\n');process.exitCode=1;});
}
