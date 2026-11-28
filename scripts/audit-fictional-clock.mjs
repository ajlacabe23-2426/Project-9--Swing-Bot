// Read-only audit of the local fictional classroom replay directory.
import {inspectClockEvidence} from '../src/fictional-clock-evidence-audit.mjs';
import {resolve} from 'node:path';
try{
  if(process.argv.length!==2)throw new Error('Usage: node scripts/audit-fictional-clock.mjs');
  const report=await inspectClockEvidence(resolve('.data/fictional-clock-replay'));
  console.log(JSON.stringify(report,null,2));
  if(report.reviewRequired)process.exitCode=2;
}catch(error){console.error(error.message);process.exitCode=1;}
