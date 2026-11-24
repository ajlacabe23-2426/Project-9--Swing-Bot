import test from 'node:test';
import assert from 'node:assert/strict';
import {runColdProcessRecoveryAcceptance} from '../scripts/accept-cold-process-recovery.mjs';

test('separate OS processes survive SIGKILL across synthetic ticket, HOLD, TARGET and incomplete rename',async()=>{
  const result=await runColdProcessRecoveryAcceptance();
  assert.equal(result.schema,'project9-cold-process-recovery-v1');
  assert.equal(result.mode,'ENGINEERED_SYNTHETIC_ONLY');
  assert.ok(result.separateChildProcesses>=5);
  assert.equal(result.uniqueChildPids,true);
  assert.equal(result.realSigkillAfterTicket,true);
  assert.equal(result.realSigkillAfterHold,true);
  assert.equal(result.realSigkillAfterTarget,true);
  assert.equal(result.sigkillBeforeAtomicRename,true);
  assert.equal(result.originalTicketPreserved,true);
  assert.equal(result.duplicateRejectedAfterColdRestart,true);
  assert.equal(result.terminalOutcomeRecovered,true);
  assert.equal(result.interruptedSavePreservedCommittedBytes,true);
  assert.ok(result.ignoredStagedTempFiles>=1);
  assert.equal(result.seedFilesUnchanged,true);
  assert.equal(result.externalMarketProviderAllowed,false);
  assert.equal(result.brokerEndpointStatus,404);
  assert.equal(result.realOrdersCreated,0);
  assert.match(result.originalJournalSha256,/^[a-f0-9]{64}$/);
  assert.match(result.finalJournalSha256,/^[a-f0-9]{64}$/);
  assert.notEqual(result.originalJournalSha256,result.finalJournalSha256);
});
