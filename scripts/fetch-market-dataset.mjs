import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fetchMassiveDailyDataset} from '../src/providers/massive.mjs';

const [symbol,from,to,output]=process.argv.slice(2);
if(!symbol||!from||!to){
  console.error('Usage: MASSIVE_API_KEY=... npm run fetch:market -- SYMBOL YYYY-MM-DD YYYY-MM-DD [output.json]');
  process.exitCode=2;
}else if(!process.env.MASSIVE_API_KEY){
  console.error('MASSIVE_API_KEY is required and must stay local. Do not commit it.');
  process.exitCode=2;
}else{
  try{
    const dataset=await fetchMassiveDailyDataset({symbol,from,to,apiKey:process.env.MASSIVE_API_KEY});
    const json=JSON.stringify(dataset,null,2)+'\n';
    if(output){
      const path=resolve(output);
      await writeFile(path,json,{encoding:'utf8',mode:0o600});
      console.error('Saved validated read-only market dataset to '+path);
    }else process.stdout.write(json);
  }catch(error){
    console.error('Market-data fetch failed:',error.message);
    process.exitCode=1;
  }
}
