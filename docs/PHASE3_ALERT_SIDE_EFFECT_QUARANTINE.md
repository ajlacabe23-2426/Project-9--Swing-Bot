# Project 9 — Phase 3 P0 interim side-effect quarantine (Issue #45)

## Why

The original local workstation appended persistent classification-change alerts
inside `WorkstationStore.applyRefresh` whenever a scan's classification
changed. The scanner currently has no independent proof of market-provider
authorization, source-vintage availability, corporate-action adjustments or
expected trading-session completeness. A source string or SHA-256 of local
bytes cannot establish those release prerequisites. The separate read-only
synthetic alert preview is correctly labeled as fictional and stays intact.

The original local operational cycle also issued an unattended paper ticket
on a recent **unverified** external source merely from a score/age check and
`--paper-auto`. These are virtual observations, not broker orders, but must
not bypass the information eligibility gate.

## Narrow changes

- `WorkstationStore.applyRefresh` continues recording local research scans
  and updating the existing paper journal, but **never adds** a fresh
  classification-change alert. Historical alert records are preserved
  unchanged, not deleted. The UI labels them as archived unverified notes.
- `runOperationalCycle(autoPaper:true)` refuses unattended virtual tickets
  from external/nonfictional sources with the explicit
  `UNVERIFIED_SOURCE_AUTO_PAPER_BLOCKED` reason, regardless of whether
  `--demo` was also supplied. It does not call the ticket-creation endpoint
  for those sources. A user-requested, explicitly labeled synthetic demo
  retains the preexisting local virtual-ticket behavior and duplicate guards.
- Direct/manual paper ticket UI is **unchanged**. No real brokerage API or
  notifications were introduced.
- Regression tests cover repeated classification changes, preservation
  of archived alert records, denial for recent/stale/future unverified
  sources, and the explicit synthetic demo path.

## Intentionally not accepted by this PR

- No data is accepted as real-world alert eligible. #43 (authentic data/PIT
  rights/actions), #44 (session calendar and provider completeness), and
  #46 (historical evaluation) remain unresolved.
- This is a **partial** mitigation of #45, **not its completion**: workstation
  refresh still changes saved local scans/paper reference outcomes and manual
  paper ticket creation still exists. A real alert-only eligibility and
  idempotent opt-in delivery architecture is not implemented.
- The read-only `/api/alerts/preview` remains fictional; it must not be
  promoted to real notifications without separate approval.
- Existing recorded alerts are not retroactively authenticated or migrated;
  the UI warns that they are historical/unverified.

## QA required

- Full `npm run check` with exact candidate SHA and actual test counts.
- `npm run security:baseline` and `npm run security:secrets`.
- Real Chromium loopback acceptance with synthetic, disposable state.
- Negative tests of no unverified alert creation and no external-source
  ticket endpoint call (including `allowSyntheticDemo:true`).
- Independent acceptance of any changed auto-paper behavior and manual
  paper-ticket boundary before any merge.

## Operations

No merge, production deploy, network provider requests, paid service, real
orders, scheduled alerts, hosted state, external users, credentials or archived
`.data` files were changed. The existing active
`.codex/CURRENT_TASK.md` ownership remains untouched.
