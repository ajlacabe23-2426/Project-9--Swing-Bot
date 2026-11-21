import test from 'node:test';
import assert from 'node:assert/strict';
import {runPaperLifecycleAcceptance} from '../scripts/accept-paper-lifecycle.mjs';

test('Phase 3: isolated synthetic lifecycle proves denied, persisted, restarted, and closed states',async()=>{
  const report=await runPaperLifecycleAcceptance();
  assert.equal(report.schema,'project9-phase3-paper-lifecycle-acceptance-v1');
  assert.equal(report.mode,'OFFLINE_ENGINEERED_SYNTHETIC_ONLY');
  assert.deepEqual(report.fixtureSymbols,['SIM09','SIM10']);
  assert.equal(report.defaultCycleTickets,0);
  assert.equal(report.noSetupDenialStatus,400);
  assert.equal(report.missingReviewDenialStatus,409);
  assert.equal(report.forgedReviewDenialStatus,409);
  assert.deepEqual(report.simultaneousCreateStatuses,[200,409]);
  assert.equal(report.duplicateAfterRestartStatus,409);
  assert.deepEqual(report.lifecycle,[
    'OPEN_PAPER_OBSERVATION','OPEN_PAPER_OBSERVATION','TARGET_REFERENCE_TOUCHED'
  ]);
  assert.equal(report.journalRestoredIdentically,true);
  assert.equal(report.legacyPaperStateUnchanged,true);
  assert.equal(report.fixtureFilesUnchanged,true);
  assert.equal(report.realProviderCalls,0);
  assert.equal(report.realOrdersCreated,0);
  assert.match(report.finalJournalSha256,/^[a-f0-9]{64}$/);
});
