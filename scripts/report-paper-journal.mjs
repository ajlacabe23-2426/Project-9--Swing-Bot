import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isValidWorkstationState} from '../src/workstation-store.mjs';

const OUTCOMES=new Set([
  'TARGET_REFERENCE_TOUCHED','STOP_REFERENCE_TOUCHED',
  'AMBIGUOUS_SAME_BAR','OPEN_PAPER_OBSERVATION'
]);
const CLOSED=new Set(['TARGET_REFERENCE_TOUCHED','STOP_REFERENCE_TOUCHED']);
const round=value=>Math.round((value+Number.EPSILON)*100)/100;

/**
 * Read-only paper research audit. Does not value any real holdings and does not
 * dispatch orders. Ambiguous or open observations are excluded from totals.
 */
export function summarizePaperJournal(state){
  if(!isValidWorkstationState(state))throw new Error('Invalid workstation state; report refused');
  const counts={TARGET_REFERENCE_TOUCHED:0,STOP_REFERENCE_TOUCHED:0,
    AMBIGUOUS_SAME_BAR:0,OPEN_PAPER_OBSERVATION:0};
  let referencePnl=0,referenceR=0;
  const seen=new Set();
  for(const ticket of state.tickets){
    if(seen.has(ticket.id))throw new Error('Duplicate paper-ticket ID');
    seen.add(ticket.id);
    const outcome=ticket.outcome;
    if(!outcome||!OUTCOMES.has(outcome.status))throw new Error('Unknown or missing paper outcome');
    counts[outcome.status]++;
    if(CLOSED.has(outcome.status)){
      if(!Number.isFinite(outcome.paperPnl)||!Number.isFinite(outcome.rMultiple))
        throw new Error('Closed observation requires finite paper P&L and R multiple');
      referencePnl+=outcome.paperPnl;
      referenceR+=outcome.rMultiple;
    }
  }
  const closed=counts.TARGET_REFERENCE_TOUCHED+counts.STOP_REFERENCE_TOUCHED;
  return {
    schema:'project9-paper-journal-audit-v1',
    researchOnly:true,
    brokerConnected:false,
    realMoneyPnlAvailable:false,
    watchlistCount:state.watchlist.length,
    lastRefresh:state.lastRefresh??null,
    refreshErrorCount:state.lastRefreshErrors.length,
    paperTicketCount:state.tickets.length,
    observationCounts:counts,
    completedUnambiguousReferences:closed,
    sumHypotheticalReferencePnl:round(referencePnl),
    meanHypotheticalRMultiple:closed?Math.round(referenceR/closed*1000)/1000:null,
    excludedFromTotals:counts.AMBIGUOUS_SAME_BAR+counts.OPEN_PAPER_OBSERVATION,
    interpretation:[
      'Computed from stored paper references only; no live orders, fills, positions or revenue.',
      'Same-bar stop/target ambiguity and open observations are excluded, not scored as wins.',
      'This is not a historically controlled out-of-sample profitability estimate.',
      'Validate licensed market data, point-in-time assumptions, costs and untouched holdouts independently.'
    ]
  };
}
export async function auditPaperJournal(file){
  const text=await readFile(resolve(file),'utf8');
  return summarizePaperJournal(JSON.parse(text));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  if(args.length>1){console.error('Usage: node scripts/report-paper-journal.mjs [local-workstation.json]');process.exitCode=2;}
  else auditPaperJournal(args[0]||'.data/workstation.json')
    .then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
    .catch(error=>{console.error('Paper journal audit failed:',error.message);process.exitCode=1;});
}
