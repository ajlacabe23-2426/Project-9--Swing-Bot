# Project 9 — Research-first MVP

**Status: local-only educational synthetic-market research prototype.** No real-market price feed, brokerage integration, real-money trading, investment recommendation, customer subscription, or automatic generative AI request. All 190 daily synthetic candles belong to one fictitious instrument, SIM-01. Do not present generated scenario returns as verified trading results or as evidence of future performance.

## Run locally

Install Node.js **22 or later**. No package install, account, secret or network access is needed for the offline research simulator.

```bash
npm run check
npm start
```

Open **http://127.0.0.1:4179** on the same computer. The HTTP server binds to loopback only and checks Host and Origin for state mutations. Do not deploy publicly or behind a reverse proxy: the project is NOT authenticated or multi-tenant. Paper state is stored under `.data/paper.json`, which is Git-ignored. Set `PORT=4180 npm start` for a different local port, or `PROJECT9_DATA_FILE=/absolute/path/to/paper.json npm start` for another local state file. Only run one instance against a state file.

## Research features

- Responsive dark research terminal: synthetic price chart, completed-bar moving averages, evidence-linked deterministic interpretation, virtual portfolio, drawdown, event journal, paper fills.
- Seeded synthetic OHLCV, a completed-bar 5/20 average crossover condition, and RSI observation. No future bars are available to the strategy on a given session.
- Hypothetical entry/exit is queued after a completed session and filled at the following synthetic open with explicitly modeled adverse slippage and fees. Independent entry constraints use a 10% initial target and 25% maximum paper allocation. No leverage or short positions.
- Persistent paper cash/units/fills with serialized atomic disk writes, replay and deterministic reset.
- Independent whole-scenario in-sample replay on generated data. This is NOT an out-of-sample backtest and has no predictive validity for financial markets.
- Optional AI-generated synthetic-data commentary is disabled by default and requested only by clicking its button after a provider key is separately configured. API use may incur charges. Model output never decides or dispatches even simulated orders.

## Browser-only uploaded CSV research (experimental)

The synthetic paper dashboard now links to a separate **Historical research lab** at `http://127.0.0.1:4179/research.html`. You may optionally select a local CSV that you are permitted to use. The file is parsed and analyzed in browser memory, with no server upload, model submission or modification of the synthetic paper ledger. File contents are not retained when you reload the page.

Expected header: `date,open,high,low,close,volume`, followed by 100–3000 unique ascending daily weekday rows (ISO date, positive consistent OHLC, integer volume). File size limit: 550 KB. Use raw numeric decimal fields and preserve the data source outside the app. The source field is **self-declared, not verified**. Do not import confidential brokerage statements, customer records or account identifiers.

For a no-data-provider test, run `node scripts/create-example-csv.mjs` and select `.data/example-SYNTHETIC-not-real-market.csv`. Label its declared source as **Project 9 generated synthetic example**. Despite appearing on the historical research page, this sample is invented prices, not real history or evidence of real-market performance.

The lab also shows two additional **held-out cost-stress scenarios** with 2× and 4× the base modeled fee, minimum fee and adverse slippage. These are independent replays of the same frozen rule and held-out dates, not confidence intervals or evidence of executable prices. The experiment does not optimize its rule based on any of the three outcomes.

The lab uses an unoptimized 5/20 moving-average rule. It separates the earlier 70% (in-sample) and later 30% (held-out) observations into independent hypothetical portfolios. The later window uses only earlier completed bars for indicator warmup. Model outputs show simulated fills and returns separately from raw input observations. **A holdout does not validate a dataset's authenticity, predictive quality or ability to earn actual returns.** Price adjustments, splits, dividends, delistings, coverage, corporate actions and user rights are not independently checked. Informational flags identify large gaps and zero-volume sessions. Results stay on the device until the page is closed.

## Security and verification

Run `npm run check` for syntax checks and the offline unit/HTTP integration suite. GitHub Actions runs the same suite on Node 22. Local Host and Origin checks, bounded JSON, no public broker routes, and ignored local state are starting boundaries, **not** an independent security audit. No real customer or financial records belong in this prototype.

## Roadmap / remaining blockers

1. Properly licensed or authorized *historical or delayed* market-data research with source timestamps, corporate actions and missing-data handling. Do not add broker APIs or real orders.
2. Separate in-sample development from held-out data; verify no lookahead, survivorship bias, invalid fill assumptions, or model overfitting. Expand experimental coverage.
3. Add opt-in, sourced, cost-controlled AI research explanations and assess prompt injection; the LLM is not an execution engine.
4. Only after a separate scope review: subscriber authentication and isolation, privacy/data retention, network abuse controls, data redistribution rights, regulatory review and independent security testing for commercial software.

**Real-money automated execution is explicitly out of scope.**
