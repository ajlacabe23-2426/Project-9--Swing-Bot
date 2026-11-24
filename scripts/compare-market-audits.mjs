import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compareMarketAuditReports} from '../src/market-audit-change-report.mjs';

export async function compareMarketAuditFiles(previousPath,currentPath){
  async function readBounded(path){
    const raw=await readFile(resolve(path));
    if(raw.byteLength>2_000_000)throw new Error('Readiness report exceeds 2 MB');
    return JSON.parse(raw.toString('utf8'));
  }
  const [before,after]=await Promise.all([readBounded(previousPath),readBounded(currentPath)]);
  return compareMarketAuditReports(before,after);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [before,after]=process.argv.slice(2);
  if(!before||!after||process.argv.length!==4){
    console.error('Usage: node scripts/compare-market-audits.mjs previous-audit.json current-audit.json');
    process.exitCode=2;
  }else{
    try{
      console.log(JSON.stringify(await compareMarketAuditFiles(before,after),null,2));
    }catch(error){console.error('Market audit comparison rejected:',error.message);process.exitCode=1;}
  }
}
