# Project 9 — Personal research workstation roadmap

Updated: 2026-10-10
Stage: local-only educational synthetic-market paper-trading prototype, per current README. **Personal-first**, not commercially or live-trading ready.

## Product truth

Current default-branch README documents SIM-01 synthetic candles, a loopback-only workstation and paper ledger. Earlier local real-market experiments must be verified separately; a historical feed cannot be represented as a validated live-market or production feature.

## NOW (ordered)

1. **Functionality acceptance** — reproduce chart, watchlist/navigation, evidence panel, paper trade ticket, journal and outcome display on local loopback. Capture exact failing flows before declaring workstation functional.
2. **Reproducible paper ledger** — test corrupted file fail-closed, deterministic fills, next-bar execution and no future-bar access. Verify order/entry/exit and journal state across process restarts.
3. **Evidence-quality research harness** — separate synthetic/historical/vendor data, validate OHLCV provenance and adjustments, include slippage/cost stress, benchmarks and time-series train/holdout or walk-forward evaluation before performance claims.

## NEXT

- Stable configurable personal watchlist and ranked setup evidence (not trading recommendations).
- Read-only provider adapter with timeouts, source quality, missing bars, corporate-action treatment and replay fixtures.
- Accessible workstation end-to-end interaction tests and exportable personal research journal.

## LATER / PARKED

- Paid beta, multi-tenancy, brokerage, subscriptions, live execution. No work proceeds on these without explicit re-scoping and approval.

## Release gates

Offline npm check/runtime tests, deterministic replay, paper-state integrity, no look-ahead, cost stress, benchmark comparison and observed-vs-simulated labeling. Production/brokerage/real-money actions prohibited by default. Record unrun tests as NOT_RUN.
