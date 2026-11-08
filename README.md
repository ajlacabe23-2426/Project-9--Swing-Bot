# Project 9 — Research-first MVP

**Status: local-only educational synthetic-market research prototype.** No real-market price feed, brokerage integration, real-money trading, investment recommendation, customer subscription, or automatic generative AI request. All 190 daily synthetic candles belong to one fictitious instrument, SIM-01. Do not present generated scenario returns as verified trading results or as evidence of future performance.

## Run locally

Install Node.js **22 or later**. No package install, account, secret or network access is needed for the offline research simulator.

```bash
npm run check
npm start
```

Open **http://127.0.0.1:4179** on the same computer. The HTTP server binds to loopback only and checks Host and Origin for state mutations. Do not deploy publicly or behind a reverse proxy: the project is NOT authenticated or multi-tenant. Paper state is stored under `.data/paper.json`, which is Git-ignored. Set `PORT=4180 npm start` for a different local port, or `PROJECT9_DATA_FILE=/absolute/path/to/paper.json npm start` for another local state file. Only run one instance against a state file. On restart, the paper ledger is checked against a fresh replay of its fixed synthetic scenario; an inconsistent or corrupt local file prevents startup instead of being silently overwritten. For recovery, preserve a copy of the failed file, restore a previously saved valid copy, and restart. Do not hand-edit virtual cash or simulated fills. This check detects inconsistent local state, not real-world trading or data authenticity.

## Research features

- Responsive dark research terminal: synthetic price chart, completed-bar moving averages, evidence-linked deterministic interpretation, virtual portfolio, drawdown, event journal, paper fills.
- Seeded synthetic OHLCV, a completed-bar 5/20 average crossover condition, and RSI observation. No future bars are available to the strategy on a given session.
- Hypothetical entry/exit is queued after a completed session and filled at the following synthetic open with explicitly modeled adverse slippage and fees. Independent entry constraints use a 10% initial target and 25% maximum paper allocation. No leverage or short positions.
- Persistent paper cash/units/fills with serialized atomic disk writes, replay and deterministic reset.
- Independent whole-scenario in-sample replay on generated data. This is NOT an out-of-sample backtest and has no predictive validity for financial markets.
- Optional AI-generated synthetic-data commentary is disabled by default and requested only by clicking its button after a provider key is separately configured. API use may incur charges. Model output never decides or dispatches even simulated orders.

## Browser-only uploaded CSV research (experimental)

The synthetic paper dashboard now links to a separate **Historical research lab** at `http://127.0.0.1:4179/research.html`. You may optionally select a local CSV that you are permitted to use. The file is parsed and analyzed in browser memory, with no server upload, model submission or modification of the synthetic paper ledger. File contents are not retained when you reload the page. The browser displays a local SHA-256 fingerprint of the imported file bytes so two runs can be compared without sending the file or fingerprint to a server; matching fingerprints do not prove source authenticity or licensing.

Expected header: `date,open,high,low,close,volume`, followed by 100–3000 unique ascending daily weekday rows (ISO date, positive consistent OHLC, integer volume). File size limit: 550 KB. Use raw numeric decimal fields and preserve the data source outside the app. The research form now requires a **data-provenance declaration**: source label, instrument label, currency, price-adjustment status, and source as-of date. These declarations are recorded in the experiment manifest but are **not independently verified**. Do not import confidential brokerage statements, customer records or account identifiers.

For a no-data-provider test, run `node scripts/create-example-csv.mjs` and select `.data/example-SYNTHETIC-not-real-market.csv`. Label its declared source as **Project 9 generated synthetic example**. Despite appearing on the historical research page, this sample is invented prices, not real history or evidence of real-market performance.

The lab also shows a **four-fold development-only walk-forward evaluation**. Each fold uses expanding prior development history for context, starts a fresh simulated balance for the next nonoverlapping evaluation block, and finishes before the untouched final 30% holdout begins. The fixed 5/20 rule is never retuned between folds. This is a robustness diagnostic, not proof of predictive skill. The lab also keeps three separate **chronological consistency segments** with independent simulated starting balances and one frozen rule; those segments are descriptive checks of variation across time, not extra untouched holdouts, independent market samples or predictive validation.

The lab also shows two additional **held-out cost-stress scenarios** with 2× and 4× the base modeled fee, minimum fee and adverse slippage. These are independent replays of the same frozen rule and held-out dates, not confidence intervals or evidence of executable prices. The experiment does not optimize its rule based on any of the three outcomes.

After a successful local run, the lab displays an **input data-quality summary** covering observed rows, calendar span, approximate weekday coverage, multi-day gaps, zero-volume bars, large adjacent-open gaps, >20% close-return outliers, >30% intraday ranges, flat-close transitions, duplicate adjacent OHLCV observations, longest flat-close run, and the largest calendar gap. It also emits a **research-readiness status**. `STRUCTURALLY_CLEAN_UNVERIFIED` means only that these configured local checks found no anomaly; `REVIEW_REQUIRED` lists the structural reasons needing review. Neither status verifies a vendor, trading calendar, symbol, corporate actions, survivorship, licensing, or economic accuracy.

The compact **reproducible experiment record** is now manifest schema v3. It records the local dataset SHA-256 fingerprint, declared source/instrument/currency/adjustment status/as-of date, engine version, date range, fixed split, data-quality counts, research-readiness reasons, modeled costs, aggregate simulated metrics, warnings and safety flags. It intentionally excludes the CSV bytes, per-bar curve and individual fills, stays browser-local, and explicitly records that the data is unverified and no real orders or brokerage connection exist.

The lab uses an unoptimized 5/20 moving-average rule. It separates the earlier 70% (development) and later 30% (untouched held-out) observations into independent hypothetical portfolios. Walk-forward folds are computed only inside the earlier development window. The later window uses only earlier completed bars for indicator warmup. Model outputs show simulated fills and returns separately from raw input observations. **A holdout does not validate a dataset's authenticity, predictive quality or ability to earn actual returns.** Price adjustments, splits, dividends, delistings, coverage, corporate actions and user rights are not independently checked. Informational flags identify large gaps and zero-volume sessions. Results stay on the device until the page is closed.

## Live market intelligence foundation (v2 provenance contract)

Project 9 now has a provider-neutral **completed-bar market-data contract** and deterministic watchlist scanner. This is the first step toward real-market swing-trade decision support without adding brokerage execution.

The scanner still accepts legacy `project9-market-data-v1` files so previously fetched local research data remains usable. New provider fetches emit `project9-market-data-v2`, which adds a bounded provenance object recording retrieval time, adjustment methodology, corporate-action review status, survivorship status, and licensing/redistribution status alongside the existing symbol/currency/source/mode/as-of declarations and 60–3000 strictly ascending completed daily OHLCV bars. The validator rejects malformed symbols, stale provenance, contradictory adjustment metadata, impossible provenance timelines where retrieval predates the declared source-as-of date, duplicate/out-of-order dates, invalid volume, and inconsistent OHLC values.

The scanner computes only from completed observations through the requested evaluation date. It reports a 20-session mean, 50-session mean, 14-session RSI, 14-session ATR, prior-20-session high, relative volume, explicit rule checks, and a bounded **paper-only** ATR risk reference. Results are labeled `PAPER_SETUP_STRONG`, `PAPER_SETUP_WATCH`, or `NO_PAPER_SETUP`; these labels are deterministic research classifications, not investment recommendations.

Run one or more permitted local datasets with:

```bash
npm run scan:watchlist -- path/to/SYMBOL.json path/to/OTHER.json
```

The command returns a ranked JSON research report. It does not contact a market-data provider, broker, exchange, or AI model, and it cannot place orders. The paper risk plan uses a fixed virtual balance by default and explicitly records `realOrders: false`, `brokerageConnected: false`, and `executionAllowed: false`.

Each scan also carries a provider-neutral **market-data readiness summary**. Structural checks still count zero-volume bars, large calendar gaps, >20% adjacent close moves, >30% intraday ranges, and unknown adjustment status. Provenance review is reported separately so a structurally clean file can still be clearly marked for corporate-action, survivorship, methodology, or data-rights review. These flags never alter setup scores or classifications and must not be read as evidence that a dataset is authentic, point-in-time complete, licensed for redistribution, or economically correct.

A first read-only provider adapter now targets Massive's adjusted daily stock aggregate endpoint. The API key is accepted only from the local `MASSIVE_API_KEY` environment variable and is never written into the dataset. Fetch a permitted local dataset with:

```bash
MASSIVE_API_KEY=your_local_key npm run fetch:market -- AAPL 2026-01-01 2026-10-01 .data/AAPL.json
npm run scan:watchlist -- .data/AAPL.json
```

The adapter maps provider OHLCV into the Project 9 v2 contract and fails closed on HTTP errors, malformed payloads, ticker mismatches, results outside the requested date window, short history, invalid bars, or contradictory provenance. It records the local retrieval timestamp and explicitly labels Massive adjusted aggregates as provider-adjusted but not independently verified for adjustment methodology/corporate-action coverage; survivorship remains unassessed and provider terms still require review for commercial redistribution. It does **not** fetch trades/quotes, connect a brokerage account, or place orders. A successful provider response is not independently authenticated market history.

The next provider milestone is broader historical coverage plus independent corporate-action/survivorship review and point-in-time universe testing. The v2 contract now has explicit fields for those facts, but it deliberately reports them as unresolved until evidence exists.

## Guarded local market-history export

The read-only `fetch:market` CLI can save a newly fetched, permitted completed-bar dataset to a specified local JSON file. Existing files are **not silently replaced**: the writer validates source identity and adjustment metadata, requires a later completed session, and requires every previously stored daily bar to match. A lock file prevents two cooperating writers from updating the same path at once. The replacement is written to a private temporary file and renamed into place after all checks pass.

A provider may revise historical prices for splits or corrections. When that happens, **the export deliberately refuses to overwrite the old evidence**; retain the original and write the new source to a separate filename for review rather than assuming a correction is harmless. If a process terminates before removing a `.lock` file, inspect the output and running processes before manually clearing the stale lock. The lock is not a network-wide distributed lock.

No API keys are saved by this writer; `MASSIVE_API_KEY` is used only from the local environment. No network trading, order placement, brokerage connection, source authenticity or license clearance is implied. After a permitted fetch, run `npm run audit:market -- --as-of YYYY-MM-DD .data/SYMBOL.json` and the offline daily research command independently.

## Swing workstation v1

The local app now includes `/workstation.html`, a read-only swing-trade research workstation built on the provider-neutral market-data contract.

The workstation supports:

- a configurable local watchlist of up to 20 symbols;
- completed-daily-bar refresh through the read-only market-data adapter;
- deterministic ranking into `PAPER_SETUP_STRONG`, `PAPER_SETUP_WATCH`, and `NO_PAPER_SETUP`;
- setup detail with 20/50-session trend, RSI, ATR, prior-high, relative-volume and explicit rule checks;
- a bounded completed-bar chart with paper entry/stop/target references;
- persistent classification-change alerts;
- frozen paper tickets that preserve the original score, classification and risk references;
- outcome tracking against later completed bars, including paper P/L and R-multiple;
- an explicit `AMBIGUOUS_SAME_BAR` outcome when a daily bar touches both frozen stop and target references, rather than inventing intraday ordering.

The workstation persists only local research state under the same private `.data` directory as the synthetic paper ledger. It has no brokerage routes, order-routing capability, account credentials, leverage, short-selling execution or real-money position state.

When `MASSIVE_API_KEY` is configured locally, **Refresh completed bars** fetches adjusted daily data for the saved watchlist. If no provider key is active, the workstation can reuse a previously fetched `.data/SYMBOL.json` dataset for that symbol, matching the verified CLI workflow. Provider failures are recorded per symbol so one bad response does not fabricate a successful scan. API keys are read only from the process environment and are not copied into workstation state.

Paper tickets are intentionally constrained to a current watch/strong research classification and cannot exceed the engine's virtual risk reference. These controls are research guardrails, not individualized investment advice or a claim that the risk model is appropriate for real capital.


## Working operational agent cycle (local paper tickets)

The existing workstation now has a **write-capable operator command** that refreshes scans, advances paper observations, and can open bounded virtual tickets when explicitly enabled. This can be called manually or through StarNet's authorized terminal tool. It never routes real brokerage orders.

```sh
npm run agent:cycle -- --paper-auto   # permitted, recent non-synthetic observations
npm run agent:cycle -- --paper-auto --demo   # explicitly invented synthetic demo data
```

The local Project 9 server must be running before either command; use the synthetic seed instructions below for a no-provider end-to-end test. Review [StarNet setup and operator acceptance](docs/STARNET_OPERATOR.md) before enabling recurring workflows.

## No-key workstation demonstration (offline)

No market API key is needed to demonstrate the entire read-only scanner locally:

```bash
npm run demo:seed
npm run check
npm start
```

Open **http://127.0.0.1:4179/workstation.html**, then click **Refresh completed bars**. The seed command writes two *engineered, entirely fictitious* market-contract fixtures `.data/SIM09.json` (a constructed strong research classification) and `.data/SIM10.json` (a constructed no-setup classification). It adds those names to an existing local watchlist without deleting other symbols. It does not call a network API, place orders, or modify real watchlist data. It refuses to overwrite an unrelated file named SIM09.json or SIM10.json.

This is a user-interface and workflow regression demonstration **only**: fake, deliberately constructed price paths are not market history, backtest evidence, data-source validation or proof of profitable results. If `MASSIVE_API_KEY` is present, the workstation will try the real provider instead of the seeded local cache; **unset the key** for the no-network demo. The normal synthetic simulator remains available at the home page. All state stays in the ignored `.data/` folder; do not deploy publicly.

## Reproducible offline market-data readiness audit

With one or more permitted local market-contract JSON files, run:

```bash
npm run audit:market -- --as-of 2026-11-04 .data/AAPL.json
```

The **explicit review date** prevents accidental evaluation against future observations. The JSON result contains each input file's SHA-256, symbol, latest completed bar, observed bar count, structural data-quality checks, declared provider-provenance gaps, and a five-**calendar**-day age review flag. Files are never sent over the network or changed. The date-age flag is **not** a trading-calendar or exchange-session checker; weekends and holidays can trigger review. Mixed last-bar dates are disclosed rather than silently aligned. All data remains **unverified research** even when structurally clean. This audit cannot create trading signals, broker connections, or orders.

## Retrospective market-condition research

The new read-only `research:regimes` command combines a multi-symbol, checksum-linked data-quality review with fixed **non-overlapping historical windows**. Each window reports completed-bar close changes, descriptive historical rising/falling/range-like conditions, close drawdown, and the existing paper-only scanner classification **at the window end**. It does not evaluate subsequent returns, optimize rules, or establish strategy profitability.

```bash
npm run research:regimes -- --as-of 2026-11-04 --window-bars 20 .data/AAPL.json .data/MSFT.json
```

Every file must be a previously imported local `project9-market-data-v1` or `v2` market JSON. A 50-bar indicator warmup precedes the first full research window; incomplete windows are excluded and counted. All reports include each exact file SHA-256 and declared provenance review reasons. Date and sample gaps stay explicit. Condition thresholds are arbitrary descriptive research categories and cannot be used as trade recommendations. No network calls or orders occur. Data source rights, corporate actions and point-in-time universe evidence remain unresolved.

## Add permitted historical datasets without a market-data API key

The local `import:market-csv` adapter accepts a deliberately simple, single-instrument daily CSV with headers `date,open,high,low,close,volume` and 60–3000 ascending completed rows. Source and research permission are **user-declared**; no independent authentication or rights clearance is implied. Adjustment status, corporate actions and survivorship are intentionally marked unknown/unverified.

```bash
npm run import:market-csv -- --input /path/to/allowed-bars.csv --output .data/SYMBOL.json --symbol SYMBOL --source "Your permitted source" --retrieved-at 2026-11-04T00:00:00Z --confirm-permitted
npm run audit:market -- --as-of 2026-11-04 .data/SYMBOL.json
npm run research:regimes -- --as-of 2026-11-04 .data/SYMBOL.json
```

CSV accepts plain decimals and whole-number volume without quoting or thousands separators. The importer validates OHLC consistency and calendar order, records input/output SHA-256 in a local receipt, writes a new user-private JSON file with no overwrite, and makes **no network requests**. Do not import or attest to datasets without permission; never commit source records or keys. This expands local research portability, not verified market-data coverage.

## Security and verification

Run `npm run check` for syntax checks and the offline unit/HTTP integration suite. GitHub Actions runs the same suite on Node 22. Local Host and Origin checks, bounded JSON, no public broker routes, and ignored local state are starting boundaries, **not** an independent security audit. No real customer or financial records belong in this prototype.

## Roadmap / remaining blockers

1. Expand permitted historical coverage and add independently reviewable corporate-action, adjustment-methodology and point-in-time universe evidence. Keep licensing/redistribution rights explicit and preserve the browser-only CSV path for independent comparisons. Do not add broker APIs or real orders.
2. Keep strengthening the now-separated development/holdout design: add licensed provider metadata, broader instruments/time periods, survivorship/corporate-action review, and independent replication without using the final holdout for rule selection.
3. Add opt-in, sourced, cost-controlled AI research explanations and assess prompt injection; the LLM is not an execution engine.
4. Only after a separate scope review: subscriber authentication and isolation, privacy/data retention, network abuse controls, data redistribution rights, regulatory review and independent security testing for commercial software.

**Real-money automated execution is explicitly out of scope.**

### Entry/exit decision and code map

The local workstation includes a rotatable 3D map linking scanner evidence, code functions, and existing paper entry/stop/target references. Select current scan levels or an individual frozen ticket, inspect each node, and switch to flat or code-label views. The chart distinguishes reference levels from subsequent paper touches. See [decision map usage and verification](docs/DECISION_MAP.md).
