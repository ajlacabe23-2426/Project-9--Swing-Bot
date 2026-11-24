# Project 9 — Phase 3 cold-process recovery acceptance

**Status:** Draft verification candidate. No real-market or brokerage operations. This exercises simulated observations exclusively against a newly created temporary OS directory and ephemeral loopback server port. It does not touch the operator's saved workstation `.data`.

## What this test adds

The previous Phase 3 acceptance recreated `createApp()` within the same Node process. That demonstrates store reopening, but not OS-process lifecycle or abrupt termination. This acceptance launches **separate Node child processes** with independently observed PIDs, sends `SIGKILL`, and then launches replacement child processes reading the same disposable journal.

The test intentionally retains the existing SHA-reviewed fictional SIM09 ticket and verifies each step:

1. Seed built-in fictional SIM09/SIM10 datasets in a new OS temporary directory. Start a **new process** on loopback with a fail-closed external-provider stub.
2. Refresh the fictional fixtures, create exactly one reviewed SIM09 paper observation, and record its committed journal bytes/hash.
3. **SIGKILL** process #1 after the ticket has committed. Start process #2, assert exact JSON state equality and HTTP 409 for an identical ticket request.
4. Advance fictional SIM09 to HOLD, SIGKILL process #2, restart under another PID and verify exactly one still-open ticket.
5. Advance fictional SIM09 to TARGET; SIGKILL that process and restart, verifying the same ticket ID, terminal reference status and duplicate denial.
6. Launch a separate **fault-injected** process that pauses before the atomic `workstation.json` rename during a watchlist mutation. Confirm the pre-rename event was emitted, SIGKILL that process and assert the previous committed journal's **exact bytes** remain unchanged.
7. Restart under another PID. Assert exact saved-state equality, no duplicate ticket and ignored orphan `.tmp` staging file; original fictional seed JSON files and broker route remain unchanged.

No scheduling, real-order endpoint, downloaded market-data API, current AAPL classification, existing StarNet report or user state is part of this test.

## Commands

From the matching branch and a repository-supported patched Node version:

```bash
npm run accept:cold-recovery
node --test tests/cold-process-recovery.test.mjs
npm run check
npm run security:baseline
npm run security:secrets
```

The first command prints a machine-readable synthetic recovery report. The dedicated test and default suite run the actual child-process scenario and fail if any assertion fails.

## Boundaries

- This is real `SIGKILL` and new-PID state recovery, but **NOT** a physical power interruption, filesystem `fsync` durability audit, cross-process simultaneous writer lock, external provider reconciliation, or broker reliability test.
- Staged temporary files left by an interrupted rename are ignored by normal store initialization, not auto-removed from a user's workstation. The entire test-created directory is deleted at test completion.
- The test depends on the unmerged PR #72 reconciliation stack, itself based on #71 → #70 → #69 → #68 → #67 → #60. No claim of `main` integration is made.
- Operator Mac acceptance is independent of GitHub CI. All real trading, paper automation scheduling, release or merge gates remain **NO_GO** pending separate decisions.
