# StarNet — Project 9 Phase 3 verification mission (read-only user state)

**Status:** Draft GitHub development. This does **not** mean the StarNet desktop app was installed, a StarNet recipe ran on the Mac, real market data was validated, or an actual AAPL paper ticket was opened.

## Purpose

StarNet can serve as the human-approved orchestration interface for a deterministic Phase 3 QA exercise. This code adds a separate `starnet:phase3` command that runs the accepted **synthetic lifecycle verification** in newly created OS temporary storage, validates its structured results, checks the built-in engineered SIM09/SIM10 classifications, and writes a private evidence packet.

Unlike the legacy `starnet:mission` script, **this command has no `--paper-auto` option and never contacts an existing workstation server**. No scheduled task, live market-data fetch, broker route, order, auto-paper ticket, or change to the operator's existing `.data/workstation.json` is permitted.

## Operator command

Run locally in the cloned Project 9 repository on an appropriate patched Node.js version:

```sh
npm run starnet:phase3
```

If you want to choose a private output location:

```sh
npm run starnet:phase3 -- --report-dir /path/to/private/evidence
```

Default output directory: `.data/starnet/phase3/`, which is inside the ignored local working-data directory and **is not the workstation state file**. Each invocation writes uniquely named JSON and Markdown reports, not a `latest` file that could silently overwrite old evidence.

The stdout summary gives the exact checkout SHA, software-gate result, report paths, and separate real-trading `NO_GO` status. Both reports include caveats that fictional target observations are not real fills or trading recommendations.

## Crew duties

| Assigned crew role | Concrete deterministic evidence |
| --- | --- |
| Researcher | Independently compute built-in SIM09/SIM10 labels and SHA-256 fixture identities in memory; never open user's saved watchlist |
| QA Engineer | Invoke `runPaperLifecycleAcceptance()` in disposable local files; validate no-setup and forged-review rejects, duplicate race, restart, HOLD→TARGET, and preserved journal |
| Risk Auditor | Check provider calls = 0, real orders = 0, legacy and fixture data unchanged, and no production-trading readiness claim |
| Chief Orchestrator | Collect all actual gates, candidate SHA, limitations, and private evidence paths; issue software verification PASS only if all gates pass, while real trading stays NO_GO |

This is a *role-oriented report structure*, not proof that four independent AI agents ran. In StarNet Workbench, each assigned operator must still inspect actual files and terminal results instead of inventing a PASS.

## Exact source and gates

The PR is stacked **on draft #69** for the synthetic lifecycle runner; #69 depends on #68 → #67 → #60. Separate snapshot draft #64 is **not yet integrated** and must not be called part of this code. Resolve the wider PR dependency stack in review before any promotion to `main`.

Suggested local and CI checks:

```sh
node --test tests/starnet-phase3-verify.test.mjs
npm run check
npm run security:secrets
npm run security:baseline
```

Verify results on the *exact final branch head*. Running the command tests in-memory synthetic fixtures and an isolated temporary workstation; GitHub CI does not prove actual StarNet Workbench execution on the user's device.

## Fail-closed rules

- Unknown options, duplicate options, `--paper-auto`, `--schedule`, and any attempt to turn on journal writes are **rejected** by `starnet:phase3`.
- If a synthetic gate fails, the module throws and **does not publish a Phase 3 PASS packet**.
- If the candidate commit cannot be identified as a full 40-character Git SHA, report creation stops.
- No external data source, model, exchange calendar, credentials, broker, scheduler or deployment is activated.
- An honest `PASS` covers **synthetic software acceptance only**. It cannot establish real-data correctness, forward returns, profitable trading, multi-process state safety, or live execution readiness.

## Human acceptance

After review, the owner can run the safe command from the correct checked-out branch, inspect both outputs, and capture the report SHA/terminal exit status. Keep `--paper-auto` and routine scheduling disabled. The remaining independent work is exact-candidate stack reconciliation, real-data provenance validation, historical time splits with slippage/cost stress, and manual workstation acceptance on the Mac.
