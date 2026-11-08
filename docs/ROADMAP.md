# Project 9 — personal, offline paper-trading research roadmap

Updated: 2026-11-08
Main source at task start: `eae63dfb06a052ed464cfa61f83832ddb034e00c`

**Current status:** Local research workstation, synthetic and permitted historical daily OHLCV analysis, deterministic strategy hypothesis, and simulated positions only. No deployed phone service, verified brokerage adapter, live order placement, or demonstrated strategy profitability.

## Implemented and checked

- Loopback-only workstation, normalized synthetic and user-supplied historical evidence, offline watchlist and paper ledger, journal, replay and source-readiness audits.
- Bounded provider import and canonical CSV/JSON source validation; Massive API key is supplied by the operator's local environment and must not be stored in Git.
- Fixed daily breakout research hypothesis (close above 50-day simple average and the highest high of the prior 20 completed sessions) with five-completed-session paper observation windows, fees and slippage.
- Historical paper-forward outcome and regime diagnostics, no look-ahead controls, browser acceptance and automated security checks.
- PR #36: atomic, non-destructive local market-history refresh with historical bar rollback/revision rejection, locking and regression tests. Real vendor history must still be sourced and validated independently.

## Next: verifiable research quality

1. Verify permitted and authentic adjusted daily OHLCV from authorized sources (including splits, delistings, survivorship, gaps, bar timestamps and exchange calendar) with the exact transformation/usage record.
2. Reconcile the old cache/import PR #28 to the current v2 canonical schema and PR #36's atomic writer **before** importing any of its original paths; do not overwrite the new workstation, provider adapter or tests from an old branch.
3. Measure the single locked research hypothesis across multiple historical regimes, relevant baseline strategies, transaction costs, sensitivity and out-of-sample splits without overfitting on a chosen winner.
4. Recheck the local browser UX on the owner's actual device and reject stale or incomplete data, especially when the US market is closed.
5. Publish a reproducible, privacy-safe evidence packet of data rights, code SHA, input hashes, caveats, and synthetic-vs-observed results.

## Governance

No brokerage order endpoint, live trading, gambling/wagering, cloud exposure, brokerage credentials or real-money actions are authorized. Never promote hypothetical outcomes into actionable recommendations. Treat a green GitHub CI as software validation, not verified market accuracy. Any development task should have a bounded source SHA, independent tests and a recorded stop rule.

References: `README.md`, `docs/LOCKED_DAILY_BREAKOUT_V1.md`, `docs/EXECUTION_READINESS.md`, `docs/DECISION_MAP.md`, `AGENTS.md`.
