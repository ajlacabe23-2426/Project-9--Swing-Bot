# Offline continuous-stream reliability exercise

This is a non-financial classroom module using fixed invented sensor observations. It does not import real observations, calculate trade performance, communicate with providers, or enable transactions.

Run `node --test tests/fictional-clock-replay.test.mjs` and `node scripts/replay-fictional-clock.mjs gap` locally. The other built-in scenarios are complete, duplicate and reversed. Reports preserve arrival order, distinguish provisional and final missing intervals, and are published to `.data/fictional-clock-replay` under content hashes. Existing differing evidence is rejected; repeated identical saves are idempotent.

Acceptance requires exact-candidate CI, macOS verification, independent reruns, and separately designed process-interruption tests. Trusted local filesystem only: directory sync and hard-link behavior vary by filesystem; hostile concurrent directory replacement, hardware power failure, and ancestor symlink races are not covered. No claim of full storage durability or real-market readiness.

## Recovery and report inspection

Run `node --test tests/fictional-clock-crash.test.mjs tests/fictional-clock-evidence-audit.test.mjs tests/fictional-clock-audit-report.test.mjs`. The isolated process tests terminate the actual writer immediately before and after publication. A process interruption is not a power-loss test. Pending files must remain visible and must not be removed automatically.

Use `node scripts/audit-fictional-clock.mjs` for JSON inspection and `node scripts/report-fictional-clock.mjs > /tmp/classroom-clock-report.html` for a script-free local report. Keep generated reports outside the evidence directory. The report separates integrity of observed files from coverage of all four fictional scenarios. No browser or physical-device acceptance is claimed by the renderer tests.

## Standalone workflow acceptance

The descriptive statistics examples are fixed non-financial classroom fixtures. Their results are displayed separately from verified stored evidence. Run `node --test tests/fictional-clock-statistics.test.mjs tests/fictional-clock-cli-acceptance.test.mjs` to check the arithmetic and complete command-line workflow. The CLI test uses two disposable directories and separate Node processes, verifies record hashes, byte-identical HTML, duplicate-safe replay, and negative audit exit codes. The macOS CI job runs these tests and a dedicated sandboxed browser test. Hosted CI is not an independent external reviewer or a physical Mac test; no market data, execution, or financial performance claim is established.
