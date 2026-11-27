# Educational Research Intelligence Center — acceptance record

## Scope

This standalone subsystem describes invented laboratory length measurements. It does not analyze financial instruments, select investment strategies, access accounts, or execute transactions. The HTML renderer is intentionally isolated from the main application and has no external network dependencies.

## Verified baseline

Revision `ab80957e942f6d008606fe19844af77f1dd79a88` (PR #104).

- [Software verification](https://github.com/ajlacabe23-2426/Project-9--Swing-Bot/actions/runs/45924861489): success.
- [Security monitoring](https://github.com/ajlacabe23-2426/Project-9--Swing-Bot/actions/runs/45924861582): success.
- Main suite: 381 tests, 380 passed, zero failed, one skipped.
- Separate existing browser acceptance: one passed, zero failed. This existing acceptance test is not a dedicated test of the new dashboard.
- All three new dashboard renderer tests passed.

## Independent component browser smoke check

The five educational source and CLI files were copied from the reviewed revision, and each local Git blob hash matched the corresponding repository blob. Generated HTML was produced from one complete and one incomplete fictional record in disposable storage, using Node 22.16.0 (not the repository's approved runtime baseline). Chromium 144.0.7559.96 rendered the HTML in memory with network access disabled; direct file navigation was blocked by the test environment.

At 1280x800, 390x844 and 320x700: expected counts, zero-valued measurement display, keyboard expansion of a record, no document horizontal overflow, no observed page errors and no HTTP requests all passed. This is a component smoke check, not a full browser accessibility audit or main application integration test.

## New acceptance coverage

Revision `523d35b808f6daba2500d7f9ee82440754b6042c` adds three fresh-process CLI regression tests: deterministic read-only output, explicit review for corrupt records, and nonzero exit/no HTML for invalid invocation or unavailable input. CI at the new head must be checked before claiming these pass.

## Boundaries and remaining work

- Storage is trusted local storage, not multi-tenant; crash/power-loss durability has not been proven. Directory reports are not atomic snapshots.
- Counts are record versions, not independent scientific experiments.
- No main-application navigation, exchange connection, trading integration or deployment is introduced.
- GitHub comparison confirms the CLI-test revision is ten commits ahead of #101's verified head and zero behind; changes are confined to ten educational files. This confirms ancestry, not combined acceptance of other open PRs.
- Keep PR #104 in draft until exact-head verification and review. Do not assume individual PR success establishes integration of other branches.

## 2026-11-27 development checkpoint

Work continues on `feat/educational-experiment-records`, PR #104, starting at
`684ac373038ad80e088928f6c4f828bdd1b2c44e`. The actual local baseline on Node
24.22.3 was **384 tests: 383 passed, zero failed, one skipped**, superseding the
older 380-pass figure above. The existing VERIFYING task is preserved.

Implemented in this checkpoint:

- Backward-compatible v1 loading and strict v2 declared UTC timestamps, rejecting
  impossible dates, duplicate/reversed times and observations after record time.
  These are consistency checks, not authentication or wall-clock verification.
- Median, sample variance and standard deviation, explicit absent statistics,
  completeness and limitations. No confidence interval, causal inference or
  significance is inferred from these fictional measurements.
- Typed conclusion review: arithmetic assertions are checked against recomputed
  values; population, causality, significance and replication assertions remain
  unsupported. This is not a natural-language claim classifier.
- Selected A/B version comparison preserving both originals, with observation,
  planned-count, schema and declared-time changes. No inferred version ordering.
- File fsync before atomic no-overwrite publication and directory fsync afterward;
  symlinked roots/ancestors rejected, corrupted records never replaced. Pending
  writes stay visible. Reports are bounded to 2,000 entries / 20,000 observations.
- Standalone script-free dashboard with keyboard-native expandable records,
  observation tables, completeness meters, comparison, explanations and errors.
- Deterministic demo and comparison CLI; no external service or new dependency.

Local demonstration (use a separate output file, outside the evidence directory):

```sh
npm run lab:demo -- .data/fictional-lab
node scripts/render-educational-lab.mjs .data/fictional-lab > /tmp/fictional-lab.html
# Copy two fingerprints printed by lab:demo:
node scripts/render-educational-lab.mjs .data/fictional-lab --compare HASH_A HASH_B > /tmp/fictional-comparison.html
npm run test:lab
```

Open the generated HTML locally. Comparison selection happens in the CLI; the
page remains an offline read-only report, not an interactive record editor.

### Repository reconciliation

Ten open PRs were inspected. Verified ancestor stack:
`#97 -> #98 -> #99 -> #101 (draft) -> #104 (draft)`.
#104's educational changes are additive over #101. #92–#96 diverge from main;
none changes educational-lab files. They cover financial research, provider
intake and source/session checks and remain outside this task's reconciliation.
No merge, retarget, branch deletion or history rewrite was performed. The
exchange-containing base must not be merged into main as part of this task.

Remote-ref inventory found 90 development branches excluding main and its HEAD
alias: 4 already reachable from main, 5 additional heads reachable from this
candidate, and 81 divergent heads. No duplicate development heads were found.
Reachability is not a semantic redundancy review: divergent/old branches are
preserved; their full implementations are not accepted by this checkpoint.
Issue #103 is the active educational scope. #100/#102's exchange/public-data
acceptance and older financial research issues remain unresolved/out of scope.

### Verification and residual boundaries

Added regression coverage includes hand-calculated statistics, malformed and
mixed schemas, invalid numeric values, duplicate JSON keys, corrupted encoding,
truncation, historical edits, symlink roots, eight concurrent saving processes,
forced SIGKILL immediately before/after publication, safe retry, preserved
pending files, independent-process reproduction and report size limits.

A dedicated browser test now checks 1440px, 390px and 320px layouts, keyboard
expansion, comparison and no external assets. It is explicitly skipped in the
ordinary suite and explicitly enabled in CI. Local execution was attempted but
failed before opening a page: `/usr/bin/chromium` points to the missing binary
`/usr/lib/chromium/chromium` (exit 127). No browser sandbox protection was disabled
to bypass this failure. Exact final CI results must be checked separately.

Storage remains a trusted single-user directory. Ancestor checks do not defend
against a hostile local process racing directory replacement. Power-loss/device
failure durability, cross-platform directory fsync (especially Windows), full
screen-reader usability, physical Mac/Windows acceptance and independent
security review remain unverified. Crash tests are process-death tests, not
hardware power-cut tests. Keep independent backups: hashes cannot detect
removal of all copies or authenticate a person who rewrites an entire registry.
