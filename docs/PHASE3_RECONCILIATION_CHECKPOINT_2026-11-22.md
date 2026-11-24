# Project 9 — Phase 3 reconciliation checkpoint (2026-11-22)

**Candidate purpose:** Forward-port the narrowly scoped PR #64 immutable StarNet research inputs and PR #65 P0 unverified source side-effect quarantine on the verified StarNet Phase 3 runtime branch **without merging any original PR or altering local workstation data**.

## Exact dependency chain

- Base: draft PR #71 `568f76b6316c1fec729e6348218baeb3e5f692ae`.
- Its ancestry: #70 → #69 → #68 → #67 → #60 → `main`.
- Forward-port source: draft #64 `38fe43e226852a6fc2eb8d8c54fad6e9ae008841` (seven scoped source/doc/test paths).
- Forward-port source: draft #65 `60b5a3bd07d8ed89bd5467ea84358a6a8d4327f5` (selectively adapted to the newer frozen ticket review, synthetic binding and decision-map UI).
- Historical draft #66 remains a prior integration **review reference**, not a safe merge/replacement for the newer Phase 3 ancestry.
- Draft #61 read-only audit comparator is still an independent PR. No unreviewed wholesale cherry-pick, branch rewrite, or merge has been performed.

## Reconciled changes and invariants

| Control | Old risk / gap | Candidate behavior |
| --- | --- | --- |
| Immutable research input | Three StarNet mission stages reopened mutable JSON files | Capture each permitted input once, bind SHA-256, recursively freeze, verify byte hashes at stage boundaries and before report publication |
| Source metadata validation | A label/hash might be mistaken for provider authorization | Metadata is research evidence only. Snapshot cannot authenticate usage rights or point-in-time availability |
| New classification alerts | A score change on unverified data created a stored opportunity alert | No new persistent classification-change alerts from any scan; historical notes are preserved and marked archived/unverified in the existing UI |
| Automated external-source virtual tickets | `--paper-auto` could create observations from an unverified external source | Fail closed with `UNVERIFIED_SOURCE_AUTO_PAPER_BLOCKED`, before ticket POST, regardless of `--demo` flag |
| Synthetic label spoofing | A claimed source string containing `synthetic` might bypass the external-source branch | Only reserved `SIM09` or `SIM10`, with the existing 64-character replay binding and explicit demo opt-in, may enter the intentional fictional auto-ticket path; others are denied |
| Newer Phase 3 constraints | An old branch could discard reviewed-scan revision, source identity, market session policy, duplicate/atomic save, or patched Node floors | Preserve newer branch exact implementation and stage/negative tests; do not backport old `server.mjs` or `src/workstation-store.mjs` wholesale |

## Explicit limitations

- The legacy `starnet:mission --paper-auto` path is *separate* from the newer evidence-only `starnet:phase3` command. This patch narrows eligibility but does not enable or schedule the write-capable mission.
- Direct/manual paper observations still exist, guarded by reviewed scan/session policies. This P0 quarantine does not certify real provider provenance.
- A 64-character synthetic replay binding is internal fictional identity evidence, not an authenticated commercial data source, an executed fill, or an operational readiness credential.
- Existing persisted alerts are not retroactively authenticated or deleted.
- The protected Node floor remains unchanged: 24.x requires 24.22.3+.
- No real market provider, live broker, deployment, paper-auto scheduler, migration, cost, Mac workstation, or hosted state is modified.
- **Do not merge** this draft or the prior PR stack without separate owner action-specific approval.

## Required acceptance

1. Exact candidate full Node suite, including PR #64 snapshot negatives, PR #65 quarantine negatives, modern reviewed-ticket and synthetic binding regressions, and StarNet patched-runtime negative cases.
2. Security baseline, secret-history scanner and dependency verification on the frozen SHA.
3. Headless Chromium UI acceptance on that same SHA; ensure archived alert messaging does not impair the decision map.
4. One explicit `npm run starnet:phase3` synthetic evidence CLI smoke on the exact SHA; software PASS with production NO_GO.
5. An explicit review of the retrofitted research mission `starnet:mission`, keeping non-demo, historic and live provider results unverified.
6. Independent Mac/StarNet operator acceptance after code review. Green GitHub CI alone does not certify saved-state preservation or real provider data.

Next separate priorities: a **cold-process** recovery test (SIGKILL before/after atomic file replacement and restart under a new PID) and a read-only time-split, cost/slippage-sensitive historical evaluation of permitted, independently sourced records.
