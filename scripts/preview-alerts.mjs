import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildSyntheticAlertPreview} from '../src/synthetic-alert-preview.mjs';

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==2){
    console.error('Usage: npm run demo:alerts (no arguments; synthetic offline examples only)');
    process.exitCode=2;
  }else{
    try{process.stdout.write(JSON.stringify(buildSyntheticAlertPreview(),null,2)+'\n');}
    catch(error){console.error('Synthetic alert preview failed:',error.message);process.exitCode=1;}
  }
}
