import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptFictionalEndurance} from '../scripts/accept-fictional-endurance.mjs';
import {performFictionalEnduranceStage} from '../scripts/starnet-fictional-endurance-worker.mjs';

test('endurance exercises many fictional orders and independently verifies all child-process replay checkpoints',async()=>{
  const r=await acceptFictionalEndurance(['--demo']);
  assert.equal(r.schema,'project9-fictional-endurance-acceptance-v1');
  assert.equal(r.scope,'ENGINEERED_FICTIONAL_OFFLINE');
  assert.equal(r.softwareGate,'PASS');
  assert.equal(r.productionGate,'NO_GO');
  assert.equal(r.recordedDecisions,25);
  assert.equal(r.fictionalEvents,48);
  assert.equal(r.messageReceipts,48);
  assert.equal(r.reviewDecisions,1);
  assert.equal(r.finalRevision,76);
  assert.equal(r.simulatedCashTicks,118000);
  assert.equal(r.simulatedEquityUnits,18);
  assert.equal(r.simulatedTokenUnits,0);
  assert.equal(r.stopState,'STOPPED_LATCHED');
  assert.equal(r.childTermination,'SIGKILL');
  assert.match(r.finalJournalHeadHash,/^[a-f0-9]{64}$/);
  assert.match(r.finalJournalDiskChecksum,/^[a-f0-9]{64}$/);
  for(const field of ['multiProcessScenarioReplays','initialReadByteStable',
    'simultaneousCashAndHoldingsReservations','quarantineAndExplicitRelease',
    'deterministicPartialFillsAndCancellations','SIGKILLIdleProcessCrash',
    'staleWriterLockNotAutoStolen','ownerReviewedDisposableLock',
    'unchangedStateAfterCrash','independentLedgerRecalculatedInEveryChild',
    'immutableStopAcrossRestarts','finalRepeatedReadsIdentical']){
    assert.equal(r.checks[field],true,'Failed: '+field);
  }
  assert.equal(r.checks.observedRealProviderExecutions,false);
  assert.equal(r.checks.macOperatorAcceptance,'NOT_RUN');
  assert.equal(r.checks.realOrdersCreated,0);
  assert.equal(r.checks.blockchainBroadcasts,0);
  assert.equal(r.checks.externalCalls,0);
});

test('the endurance worker and CLI do not accept real-trading flags or arbitrary stage names',async()=>{
  await assert.rejects(acceptFictionalEndurance(['--live']),/offline research only/);
  await assert.rejects(acceptFictionalEndurance([]),/offline research only/);
  await assert.rejects(acceptFictionalEndurance(['--demo','--broker']),/offline research only/);
  await assert.rejects(performFictionalEnduranceStage('live','/tmp'),/fixture stage only/);
  await assert.rejects(performFictionalEnduranceStage('init','/tmp'),/Only a direct|Private real directory|Private real|mode 0700|p9-execution-lab|not permitted/);
});
