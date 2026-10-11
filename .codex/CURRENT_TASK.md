# Project 9 — Current Task

Task ID: P9-WORKSTATION-NONREGRESSIVE-REFRESH-2026-10-10
Title: Prevent stale and mismatched market observations from overwriting current workstation research
Status: VERIFYING
Risk Tier: TIER_2
Base SHA: 6924d2bc5742a1d47ad3346508ae85a78530a68e

## Objective
Keep local paper-research scans and stored journal observations consistent when an out-of-order historical provider/cached response is passed to a workstation refresh.

## Authorized implementation paths
- `src/workstation-store.mjs`
- `.github/workflows/verify.yml`
- `.codex/CURRENT_TASK.md`

## Authorized test paths
- `tests/workstation-store.test.mjs`
- `tests/browser-workstation.test.mjs`

## Acceptance criteria
- Reject a refresh evaluation if its as-of date does not equal the most recent completed bar in the supplied, normalized dataset.
- Reject a refresh whose evidence date is older than the persisted scan's as-of date for the same symbol.
- Reject before persistence, retain original alerts/scans/journal/refresh metadata, including after reloading from disk.
- Existing successful refresh and classification alert behavior stays unchanged.
- Exact-head offline test verification, real headless Chromium loopback acceptance and Security Monitor succeed; negative-case tests added.

## Explicit non-goals
- No live orders, broker integration, external market-data calls, hosting, strategy tuning, monetization, Axiovela integration or production configuration.
- No changes to existing open PR #12 or PR #13.

## Required gates
- Node 22 `npm run check` or equivalent GitHub offline verification.
- GitHub Security Monitor and repository baseline.
- Regression tests and GitHub hosted-runner Chromium loopback acceptance on frozen candidate SHA; document separate untested Mac/Lenovo browser behavior.

## Final approval gate
Leave a draft PR for AJ. Do not merge to main or publish/deploy anything.
