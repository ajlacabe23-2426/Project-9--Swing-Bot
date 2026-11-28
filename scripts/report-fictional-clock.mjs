// Generate a standalone local classroom evidence report on stdout.
import {renderClockAuditReport} from '../src/fictional-clock-audit-report.mjs';
import {resolve} from 'node:path';
try{
  if(process.argv.length!==2)throw new Error('Usage: node scripts/report-fictional-clock.mjs');
  process.stdout.write(await renderClockAuditReport(resolve('.data/fictional-clock-replay')));
}catch(error){console.error(error.message);process.exitCode=1;}
