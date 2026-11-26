/** Read-only US equity published-core-session preflight. No orders or imports. */
import {readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertPatchedNodeRuntime} from '../src/runtime-security.mjs';
import {reviewNYSEHistoricalSessions} from '../src/nyse-session-preflight.mjs';

const USAGE='Usage: node scripts/review-nyse-sessions.mjs --as-of-utc YYYY-MM-DDTHH:MM:SS.mmmZ historical.json';
export async function runSessionReviewCli(args){
  assertPatchedNodeRuntime();
  if(!Array.isArray(args)||args.length!==3||
     args[0]!=='--as-of-utc'||typeof args[1]!=='string'||
     typeof args[2]!=='string'||!args[2]||args[2].startsWith('--'))
    throw new TypeError(USAGE);
  const path=resolve(args[2]);
  const info=await stat(path);
  if(!info.isFile()||info.size<1||info.size>2_000_000)
    throw new TypeError('Historical JSON must be a regular local file up to 2 MB');
  const bytes=await readFile(path);
  if(bytes.length>2_000_000)throw new TypeError('Historical source exceeds limit');
  let value;
  try{value=JSON.parse(bytes.toString('utf8'));}
  catch{throw new TypeError('Historical source is not valid JSON');}
  return reviewNYSEHistoricalSessions(value,{asOfUtc:args[1]});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runSessionReviewCli(process.argv.slice(2))
    .then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
    .catch(error=>{process.stderr.write('NYSE source preflight refused: '+error.message+'\n');process.exitCode=1;});
}
