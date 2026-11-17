import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assessMarketEvidence} from '../src/market-evidence-sidecar.mjs';

export async function auditEvidenceFiles(dataPath,sidecarPath,decisionAt){
  const raw=await readFile(resolve(dataPath));
  if(raw.length>2_000_000)throw new Error('Dataset exceeds 2 MB limit');
  const evidence=sidecarPath==='-'?null:JSON.parse(await readFile(resolve(sidecarPath),'utf8'));
  return assessMarketEvidence({datasetBytes:raw,sidecar:evidence,decisionAt});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [decisionAt,dataPath,sidecarPath]=process.argv.slice(2);
  if(!decisionAt||!dataPath||!sidecarPath){
    console.error('Usage: node scripts/audit-market-evidence.mjs YYYY-MM-DDTHH:MM:SS.mmmZ dataset.json sidecar.json|-');
    process.exitCode=2;
  }else{
    try{
      const result=await auditEvidenceFiles(dataPath,sidecarPath,decisionAt);
      console.log(JSON.stringify(result,null,2));
      if(result.status!=='EVIDENCE_REVIEW_PENDING')process.exitCode=1;
    }catch(e){console.error('Evidence preflight failed:',e.message);process.exitCode=1;}
  }
}
