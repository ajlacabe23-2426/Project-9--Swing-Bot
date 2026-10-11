# Project 9 — Isolated integration acceptance task

Task ID: P9-PREMERGE-INTEGRATION-12-13-15-2026-10-10
Title: Validate paper workstation data and interaction safety across PRs #12, #13 and #15
Status: VERIFYING
Risk Tier: TIER_2
Base SHA: 6924d2bc5742a1d47ad3346508ae85a78530a68e

## Objective
Assemble a non-merged single-parent validation branch combining strict market calendar dates, fractional paper-ticket/UI controls, and stale refresh rejection. Preserve all existing independent PRs.

## Authorized implementation paths
- `src/market-intelligence.mjs`
- `src/providers/massive.mjs`
- `src/workstation-store.mjs`
- `public/workstation.js`
- `.github/workflows/verify.yml`
- `.codex/CURRENT_TASK.md`

## Authorized test paths
- `tests/market-intelligence.test.mjs`
- `tests/provider-massive.test.mjs`
- `tests/workstation-store.test.mjs`
- `tests/browser-workstation.test.mjs`

## Acceptance criteria
- Existing headless Chromium browser UI flow passes on the integration candidate with realistic loopback-only synthetic data.
- All existing offline research and security tests pass, including strict ISO dates, malformed date rejection, fractional paper units, and nonregressing workstation refresh.
- Source changes from PRs #12/#13/#15 coexist without either branch's shared-file changes lost.
- No remaining CI failures and one exact frozen candidate SHA is reported.

## Explicit non-goals
- Do not merge any PR, change main, deploy production, enable broker connections, place trades, activate paid data providers, or handle production secrets.

## Required gates
- GitHub offline verification and Security Monitor on exact candidate SHA.
- Headless Chrome loopback acceptance on exact candidate SHA.
- Manual Mac/Lenovo device-specific acceptance remains separate.

## Completion target
READY_FOR_AJ only once all checks pass. The branch is verification-only, not an authorization to merge.
