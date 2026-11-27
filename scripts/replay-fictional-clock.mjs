// Classroom-only time-series replay. No external connections or financial inputs.
import {saveClockEvidence} from '../src/fictional-clock-replay.mjs';
import {resolve} from 'node:path';
const args=process.argv.slice(2);
try{
  if(args.length!==1||!['complete','gap','duplicate','reversed'].includes(args[0]))
    throw new Error('Usage: node scripts/replay-fictional-clock.mjs complete|gap|duplicate|reversed');
  const result=await saveClockEvidence(resolve('.data/fictional-clock-replay'),args[0]);
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
