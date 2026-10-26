import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizePaperJournal} from '../scripts/report-paper-journal.mjs';

const sample=()=>({
  version:1,watchlist:['TEST'],lastScans:{},alerts:[],tickets:[],
  lastRefresh:null,lastRefreshErrors:[]
});
const makeTicket=(id,status,paperPnl,rMultiple)=>({
  id,symbol:'TEST',openedAsOf:'2026-10-23',paperUnits:1,entryReference:100,
  stopReference:95,targetReference:110,classificationAtOpen:'PAPER_SETUP_WATCH',scoreAtOpen:65,
  outcome:{status,observedThrough:'2026-10-24',paperPnl,rMultiple}
});
test('a fresh workstation exports a zero-activity non-revenue report',()=>{
  const report=summarizePaperJournal(sample());
  assert.equal(report.paperTicketCount,0);
  assert.equal(report.sumHypotheticalReferencePnl,0);
  assert.equal(report.meanHypotheticalRMultiple,null);
  assert.equal(report.realMoneyPnlAvailable,false);
  assert.equal(report.brokerConnected,false);
});
test('only unambiguous closed paper observations contribute to reference totals',()=>{
  const state=sample();
  state.tickets=[
    makeTicket('P9-1','TARGET_REFERENCE_TOUCHED',10,2),
    makeTicket('P9-2','STOP_REFERENCE_TOUCHED',-5,-1),
    makeTicket('P9-3','AMBIGUOUS_SAME_BAR',null,null),
    makeTicket('P9-4','OPEN_PAPER_OBSERVATION',42,3)
  ];
  const report=summarizePaperJournal(state);
  assert.equal(report.completedUnambiguousReferences,2);
  assert.equal(report.sumHypotheticalReferencePnl,5);
  assert.equal(report.meanHypotheticalRMultiple,0.5);
  assert.equal(report.excludedFromTotals,2);
  assert.equal(report.observationCounts.AMBIGUOUS_SAME_BAR,1);
});
test('tampered state, duplicate ticket ID and unsupported outcomes fail closed',()=>{
  assert.throws(()=>summarizePaperJournal({}),/Invalid workstation/);
  const duplicate=sample();duplicate.tickets=[
    makeTicket('A','STOP_REFERENCE_TOUCHED',-5,-1),
    makeTicket('A','TARGET_REFERENCE_TOUCHED',10,2)
  ];
  assert.throws(()=>summarizePaperJournal(duplicate),/Duplicate/);
  const invalid=sample();invalid.tickets=[makeTicket('B','REAL_EXECUTED_FILL',900,900)];
  assert.throws(()=>summarizePaperJournal(invalid),/Unknown or missing/);
  const missing=sample();missing.tickets=[makeTicket('C','TARGET_REFERENCE_TOUCHED',null,null)];
  assert.throws(()=>summarizePaperJournal(missing),/finite paper/);
});
