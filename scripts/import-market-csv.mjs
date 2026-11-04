import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {convertAuthorizedMarketCSV} from '../src/market-csv-import.mjs';

export async function importLocalMarketCSV({
  input,output,symbol,source,retrievedAt,confirmedResearchPermission=false
}={}){
  if(!input||!output)throw new Error('Input CSV and new output JSON paths are required');
  const bytes=await readFile(resolve(input));
  if(bytes.length>750000)throw new Error('Input CSV exceeds 750 KB');
  const csv=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const dataset=convertAuthorizedMarketCSV(csv,{symbol,source,retrievedAt,confirmedResearchPermission});
  const json=JSON.stringify(dataset,null,2)+'\n';
  await writeFile(resolve(output),json,{encoding:'utf8',mode:0o600,flag:'wx'});
  return {
    schema:'project9-offline-csv-import-receipt-v1',
    researchOnly:true,providerAuthenticityVerified:false,networkRequests:false,
    outputFile:resolve(output),symbol:dataset.symbol,rows:dataset.bars.length,
    sourceCsvSha256:createHash('sha256').update(bytes).digest('hex'),
    generatedJsonSha256:createHash('sha256').update(json).digest('hex'),
    warning:'Research permission is user-declared; source, adjustments and corporate actions remain unverified.'
  };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),values={};
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(key==='--confirm-permitted'){values.confirmedResearchPermission=true;continue;}
    if(!['--input','--output','--symbol','--source','--retrieved-at'].includes(key)||
       !args[i+1]||args[i+1].startsWith('--')){
      console.error('Usage: npm run import:market-csv -- --input bars.csv --output .data/SYMBOL.json --symbol SYMBOL --source "Provider description" --retrieved-at 2026-11-04T00:00:00Z --confirm-permitted');
      process.exitCode=2;break;
    }
    const name={'--input':'input','--output':'output','--symbol':'symbol','--source':'source','--retrieved-at':'retrievedAt'}[key];
    if(values[name]){console.error('Duplicate CLI field: '+key);process.exitCode=2;break;}
    values[name]=args[++i];
  }
  if(!process.exitCode){
    try{
      const receipt=await importLocalMarketCSV(values);
      process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
    }catch(error){
      console.error('Historical CSV import rejected:',error.message);
      process.exitCode=1;
    }
  }
}
