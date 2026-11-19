# Project 9 — Issue / PR reconciliation checkpoint (2026-11-18)

## Exact integration strategy

This is an **isolated, review-only candidate** combining four currently unmerged branches.
No source branch or `main` has been rewritten, merged or deployed.

1. **PR #60** `99603fd25dc008b24cd7693d59b1c9d917fc7e73`: base for the
   candidate; fictional replay, accounting, identity, negative tests.
2. **PR #61** `db7d380ecf0399e696a91a4fcbed08162474dd4b`: read-only
   market-audit comparison files, added without overwriting any #60 file.
3. **PR #64** `38fe43e226852a6fc2eb8d8c54fad6e9ae008841`: immutable
   StarNet mission input snapshots and as-of negative tests. Applied to
   existing research modules only.
4. **PR #65** `60b5a3bd07d8ed89bd5467ea84358a6a8d4327f5`: defensive
   alert / unattended-paper side-effect quarantine. Workstation, UI and
   operational cycle modifications were manually reconciled against
   #60's replay/frozen-review protections, **not replaced wholesale**.
   Associated tests and the operator note are integrated.

This branch is a combined verification harness, **not independent approval** of
the source PRs or their merge order. Each original PR retains its frozen SHA.

## Issue inventory and disposition

| Issue | Current disposition | Why it is not all done |
| --- | --- | --- |
| #16 — old #12/#13/#15 integration | CLOSED, historical work merged via PR #17 | Personal-device acceptance and market-source verification remain separate |
| #42 — return/window identity | CLOSED, merged PR #50 | Synthetic arithmetic accuracy is not real-data accuracy/efficacy |
| #38 — legacy cache/import | OPEN, PR #28 closed unmerged | Unique old enhancements need component-level review; current v2 writer must remain authoritative |
| #43 — PIT evidence / corporate actions | OPEN, partial offline sidecar from merged PR #58 | No independently accepted rights, vintage chain, split/dividend reconciliation or PIT universe |
| #44 — exchange sessions/provider completeness | OPEN | No certified venue-local calendar, provider pagination/finality or all-session completeness |
| #45 — alerts/side effects | OPEN, partial defense in PR #65 | No real-source eligibility, opt-in alert delivery/idempotence, or complete pre-refresh gate; manual paper path unchanged |
| #46 — untouched holdouts/baselines | OPEN | No preregistered authentic-source holdouts and exposure/NAV proof |
| #47 — fresh verification/routine attribution | OPEN | No run-bound independent verifier including native task IDs and stale evidence negative tests |
| #53 — research product acceptance | OPEN | G1–G6 remain release checks, demo-only alert preview from merged PR #59 not a live notification |
| #62 — StarNet PR #60/#61 acceptance | OPEN | GitHub CI pass != per-head StarNet local execution and review evidence |

## What this combined branch can establish

- That the four branches can coexist and pass full tests/security/Chromium on
  **one exact Git commit SHA** once CI finishes.
- That older classification-change alerts are no longer implicitly created
  by refresh from unknown datasets; archived records remain accessible.
- That unattended virtual paper creation for external/unverified source names
  is blocked, but local explicitly synthetic opt-in demonstrations remain.
- That immutable snapshot research and read-only comparison operate alongside
  the synthetic replay code without overwriting frozen local replay state.

## What the combined branch cannot establish

- No independently verified market data provenance, rights, point-in-time
  snapshots, corporate actions, venue calendars or trading usefulness.
- No live notification or alert schedule, broker, real order, real transaction,
  real-money performance, hosted deploy, paid service or external user contact.
- No Mac/Lenovo manual GUI acceptance just because Linux Chromium CI passes.
- StarNet's native multi-agent review packet per exact PR #60/#61 still requires
  its own evidence under issue #62.
- Existing `.codex/CURRENT_TASK.md` is an unrelated task in VERIFYING state.
  It must remain owned and unchanged; `.data` remains untouched.

## Release sequence

1. Review this combined diff, exact SHA and every CI/Chromium/security result;
   keep the branch draft and **do not merge** pending owner acceptance.
2. Reconcile and accept source PRs individually, or curate a small reviewed
   final integration branch without cherry-picking stale patches blindly.
3. Complete independent real-source, rights, corporate-action, calendar,
   alert-delivery, recovery, holdout, and owner-device gates documented in
   issues #43–#47 and #53 before any production/real information release.
