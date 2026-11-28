# StarNet educational component acceptance

## Verified baseline

Candidate: 05117ef35721fe75296c151fe8da2554ff83b2ab.
- Linux Verify: run 46115244938 — success.
- Security Monitor: run 46115244913 — success.
- Hosted macOS classroom acceptance: run 46115244923 — success, including dedicated sandboxed report rendering.
- Scope: fixed fictional sensor replay, deterministic reports, local file integrity, and descriptive arithmetic.

## Physical-device and independent review checklist

Use a clean checkout of the candidate, not an existing working directory containing operator data. Check the commit with `git rev-parse HEAD` and compare against the intended revision. Check Node compatibility against package.json; record the actual version. Run the following offline tests:

```sh
node --test tests/fictional-clock-replay.test.mjs tests/fictional-clock-crash.test.mjs tests/fictional-clock-evidence-audit.test.mjs tests/fictional-clock-statistics.test.mjs tests/fictional-clock-audit-report.test.mjs tests/fictional-clock-cli-acceptance.test.mjs
```

The separate browser check requires an existing local Chrome installation and its normal security sandbox; if startup fails, record the failure rather than disabling the sandbox. Inspect the generated classroom report at a desktop and narrow viewport. Confirm that integrity, observed files and statistics navigation work, warnings are readable, and fictional examples are clearly separate from observed record coverage. Record OS, Node version, browser version, commit, test totals and findings. An independent reviewer should repeat these checks without depending on developer assertions.

## Data quality learning boundaries

A single source cannot establish independent corroboration. A second source is only useful for teaching source disagreement when the comparison is like-for-like and limitations are visible. Independent sources can differ legitimately. Coverage, missing observations, timing semantics, measurement definitions and provenance must be assessed separately from correctness. The classroom component intentionally uses no external financial feeds or accounts; no second provider is needed to complete its acceptance. Current source authenticity, actual service availability, licensing and historical completeness are not verified by these offline tests.

## Decision

Component CI passed on the baseline above. Physical Mac, independent external review, and whole-application acceptance remain outstanding. New changes require fresh exact-head CI. No deployment, private account connection or transaction capability is covered or enabled by this checklist.

## Local acceptance runner

From a clean checkout, run `node scripts/accept-fictional-clock-local.mjs --browser`. It reports the actual environment, revision, clean-checkout state, and offline component/browser test results. The command does not attest physical device identity or independent reviewer identity. A skipped browser or dirty checkout yields INCOMPLETE; a failing test yields FAIL. Record the JSON alongside the intended commit, not inside the evidence directory.

## Issue #108 — acceptance evidence hardening

The operator-supplied physical Mac screenshot for baseline `74485e5aca5777cd93ad5e94d8f0b473f347a054` showed exit zero and PASS_COMPONENTS_ONLY, but the default reporter produced empty test summaries on Node 24. The original result is retained as an operator-observed component pass, not cryptographic device or reviewer attestation. The QA follow-up forces TAP, removes inherited Node test context and NODE_OPTIONS for child test processes, validates count consistency, and refuses to promote missing, zero, skipped, cancelled, or todo test evidence. Local parser regression verification on Linux Node 22.16.0: 4 tests passed, 0 failed, 0 skipped. Both copied source/test files matched their repository Git blob hashes. An initial nested-run failure was corrected and rerun. Full checkout was unavailable due to DNS; hosted exact-head tests and physical Mac retesting remain separate gates. The revised macOS workflow exercises the acceptance runner itself, including browser testing. No new financial functionality is introduced.
