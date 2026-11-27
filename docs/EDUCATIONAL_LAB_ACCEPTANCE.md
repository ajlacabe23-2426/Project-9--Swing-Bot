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
