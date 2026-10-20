# Execution-readiness evidence boundary

Status: implemented on a review branch dated 2026-10-16. Project 9 remains paper-research only.

## Principle carried into Project 9

A valid swing setup is not proof that a trade is executable.

The research engine now emits an independent `executionReadiness` result. Completed daily OHLCV bars can support a setup classification, but they do not establish:

- a live executable bid/ask,
- current market-session state,
- liquidity or slippage at the intended size,
- or an authorized broker execution route.

Even `REALTIME` bar mode remains `NOT_EXECUTION_READY` until those independent facts exist.

## Current fail-closed reasons

- `MARKET_DATA_NOT_REALTIME` when applicable
- `NO_LIVE_BID_ASK`
- `NO_MARKET_SESSION_STATE`
- `NO_LIQUIDITY_OR_SLIPPAGE_ESTIMATE`
- `NO_BROKER_EXECUTION_ROUTE`

The workstation surfaces this separately from score, classification, and the hypothetical ATR paper-risk references.

## Safety boundary

This does not add brokerage connectivity, live orders, automated trading, or an investment recommendation. It prevents the opposite mistake: turning a research classification into an implied executable trade.
