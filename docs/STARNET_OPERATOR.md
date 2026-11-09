# StarNet operational integration — Project 9 (paper only)

## StarNet crew mission — full local research handoff

The **StarNet mission bridge** wraps the existing deterministic Project 9 functions into one accepted command and two private deliverables. It coordinates real calculations (not fabricated agent summaries), and can update the local paper journal when explicitly requested.

With the Project 9 server already running and the SIM09/SIM10 seeded demo files in `.data/`:

```sh
npm run starnet:mission -- --as-of 2026-02-16 --symbols SIM09,SIM10 --demo --paper-auto
```

This runs, in order:

1. Local source-quality and provenance audit for both datasets.
2. Retrospective market-condition research with independent fixed windows.
3. Historical hypothetical paper-outcome evaluation with costs.
4. The existing write-capable workstation cycle (including duplicate prevention), only because `--paper-auto` was explicitly supplied.
5. A structured report in `.data/starnet/latest.json` and human-readable `.data/starnet/latest.md`, with file checksums and every result grounded in local calculations.

Omit `--paper-auto` to produce research deliverables without creating new virtual tickets. Omit `--demo` only after preparing permitted non-synthetic datasets and reviewing the server's saved watchlist. The server's saved watchlist determines which paper tickets the separate operational cycle may update.

### Make this native to the StarNet crew

1. In BUILD MODE, verify your assigned agents have CONSOLE (compute), INTEL CAB (files), and WORKBENCH (terminal) in the same room. The Workbench asks approval to run code.
2. Open BUILD › CONNECT › ABILITIES › SKILL MARKET › ADD FROM A LINK. Inspect the Project 9 `skills/project9-paper-research/SKILL.md` file in this public repository and add it after review. A Skill teaches technique; it does not automatically launch work or grant extra terminal access.
3. In your saved **Project 9 Research Crew** Recipe, replace the long list of manual commands with the single exact `starnet:mission` command above. Its `{as_of_date}` fill-in controls the date; for the engineered demo use `2026-02-16`.
4. Give the Chief Orchestrator responsibility for verifying the command's exit code and reading **both** deliverables. Researcher evaluates `audit.datasets`; Analyst reads `regimes.results` and `paperForward.results`; Risk Auditor checks provenance, costs, and output guardrails; QA Engineer separately runs `npm run check`. Merge only actual tool results into the final report.
5. For genuine multi-agent routing, BUILD › BUILD MODE › CONVEYORS › CONVEYOR LINES. Staff an appropriate layout, use the Workflow panel's TEST, and confirm that **SEND A REAL JOB** produces an actual DELIVERABLE (not merely a moving crate).
6. Once a single full task is verified, optionally attach the saved Recipe to a Routine. The scheduler operates only while StarNet is running. Keep source changes and external communications subject to approval.

StarNet's public documentation: https://www.starnetos.com/docs/guides/crew, https://www.starnetos.com/docs/guides/first-line, https://www.starnetos.com/docs/guides/routines.

### Limits and acceptance

- This bridge uses a trusted Workbench terminal command and local artifacts; **it is not a direct StarNet app installation, live socket subscription, hosted trading service, or verified remote integration**.
- The Project 9 workstation remains bound to localhost and unauthenticated; do not expose it to the public internet.
- For acceptance, the StarNet run must show a successful real terminal command, nonempty `.data/starnet/latest.json`, a readable `.data/starnet/latest.md`, and the same paper-ticket IDs as the workstation when `--paper-auto` was approved.
- Historical and synthetic outcomes are not forecasts, and there is no broker access or real-money execution.


This is a **write-capable** integration with Project 9's existing workstation. The operational cycle makes a completed-bar refresh, persists scans and paper outcome updates, and can **create paper tickets** automatically when explicitly opted in. It does not dispatch real broker orders, execute market trades, or infer profitable performance from synthetic data.

StarNet is optional as an orchestration front end: the identical Project 9 command works locally without an AI provider. StarNet is a separate local application and is **not** installed by this repository.

## Fastest working launch

After installing Project 9 and Node.js, run this **single terminal command** in its folder:

```sh
npm run agent:launch -- --demo --paper-auto
```

No second terminal is required. This seeds an explicitly synthetic test watchlist, starts the loopback workstation, executes the write-capable refresh and paper-ticket cycle, and **keeps the workstation available** at http://127.0.0.1:4179/workstation.html until Ctrl+C. It ignores `MASSIVE_API_KEY` when `--demo` is specified. The result is stored in the private local `.data/` directory for a later run; it cannot demonstrate trading profitability.

With legally permitted recent real-market datasets already configured, omit `--demo`. This is local simulated trading, never live broker execution.

## Immediate repeatable synthetic test (Mac, Node >=22.23.4)

From the cloned Project 9 repository:

Terminal A:

```sh
npm run check
npm run demo:seed
npm start
```

Terminal B, while Terminal A is still running:

```sh
npm run agent:cycle -- --paper-auto --demo
```

The command returns JSON listing refreshed symbols, exact classifications, newly created virtual ticket IDs, duplicate/stale/failure reasons and tracked outcomes. Repeating it on the same unchanged synthetic bars should not create a duplicate paper ticket. The synthetic dataset deliberately contains old invented sessions; `--demo` is an **explicit synthetic override**, not a way to make real prices valid. Inspect the updated local workstation at http://127.0.0.1:4179/workstation.html . All paper state remains under the ignored local `.data/` directory.

## With your permitted completed daily datasets

1. Import a permitted CSV as described in the README, or configure the existing `MASSIVE_API_KEY` adapter in the *local server process*; never commit credentials.
2. Open `workstation.html` and save your symbol watchlist (max 20).
3. Keep the Project 9 server running. Execute:

```sh
npm run agent:cycle -- --paper-auto
```

Without `--paper-auto`, the cycle still **writes refreshed scanner and outcome state**, but does not create new paper tickets. The paper ticket path has the existing classification and sizing bounds, plus agent-side guards against missing refreshes, old/future bars (over seven calendar days), simultaneous open observations per symbol and duplicate tickets for a session. Each paper ticket is **an observation**, not a filled brokerage order. Seven calendar days is an operational stale-data guard, not an exchange-calendar validator.

Never run a separate process that opens and edits the same `workstation.json` file. The cycle operates through the *already-running loopback server*, which remains the one workstation-state writer. Do not expose the current unauthenticated local server to the public internet or an untrusted LAN.

## Optional: operate it from StarNet

1. Install the official StarNet desktop app from https://starnetos.com/docs/getting-started . Select the macOS Apple Silicon release for an Apple Silicon Mac; do not bypass a Gatekeeper trust failure.
2. Connect an AI model and grant access to the trusted Project 9 folder and its terminal tool, with execution approval enabled. StarNet agents can execute commands and hand off work only when those tools are granted. Configure a job spending cap.
3. Create a simple one-agent workflow first. In COMMS, give the agent this instruction **after** the Project 9 server and synthetic seed are running:

> Work only in the already-open local Project 9 repository. Execute `npm run agent:cycle -- --paper-auto --demo` once. Read the resulting JSON and report exactly which synthetic paper tickets were created or skipped, failures, and outstanding observations. Do not run installation commands, edit code, fetch external datasets, use credentials, or interact with brokers.

4. Once the test is correct, for non-synthetic permitted market history use the same instruction **without** `--demo`. Approve each run before enabling any recurrence.

The operational cycle emits machine-readable JSON, so StarNet can summarize it, hand it to a separate research/QA agent, or deliver a completion report using StarNet's supported messaging configuration. A working StarNet connection and operating system permissions have to be tested on the host Mac; merging this code alone doesn't install, connect, or run StarNet.

## Failure semantics

- Server stopped/unreachable: fails and does not create tickets.
- No watchlist: fails with a concrete message.
- One symbol fails refresh: reports it, skips its ticket, processes other symbols.
- Synthetic dataset without explicit `--demo`: will not create new paper tickets.
- No eligible setup, duplicate open ticket, invalid size, or stale session: skips that symbol.
- Existing workstation API and persistence policies remain authoritative. The cycle never writes credentials, calls a broker, or provides real-money execution.

## Verified tests

`node --test tests/agent-operational-cycle.test.mjs` covers refresh plus ticket write, no-ticket mode, synthetic opt-in, stale/future dates, duplicate prevention, reported provider failures, port restrictions, and paper size limits. `npm run check` runs this alongside the existing suite.
