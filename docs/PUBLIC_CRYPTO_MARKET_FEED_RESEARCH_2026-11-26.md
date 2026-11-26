# StarNet: Public crypto spot ticker research monitor (2026-11-26)

**Scope:** separate, time-limited, read-only observational test of public exchange data. This is not a stock data feed, trading strategy, paper portfolio controller, investment recommendation, authenticated quote service, or an order-capable bot. Current product status remains NO_GO for real transactions.

## Why free feeds exist

Crypto spot exchanges publish exchange-local public WebSocket market data without requiring a paid consolidated US-equities subscription. Kraken confirms unauthenticated public real-time ticker, order book, trade and OHLCV feeds:

- https://blog.kraken.com/product/api/unlocked-3-the-market-data-feeds-systematic-traders-use
- https://docs.kraken.com/exchange/api-reference/spot-websocket-v2/ticker
- https://support.kraken.com/articles/360022326871-kraken-websocket-api-frequently-asked-questions

Coinbase independently documents public real-time cryptocurrency market-data WebSocket feeds: https://help.coinbase.com/en/developer-platform/websocket-feeds/advanced-trade

Alpaca's free US equities offering is only IEX-venue real-time rather than a consolidated US exchange quote: https://docs.alpaca.markets/us/docs/about-market-data-api

## What is implemented

- `src/providers/kraken-public-crypto.mjs` validates self-described market tickers from Kraken WebSocket v2 public `ticker` frames. It recognizes BTC/USD and ETH/USD, reads event and receipt timestamps, rejects impossible values and detects stale observations.
- `scripts/observe-public-crypto.mjs` is an optional local observer connecting solely to the public `wss://ws.kraken.com/v2` endpoint. It stops after at most 12 observations or 15 seconds, whichever comes first, and emits JSON observations to stdout with NO_GO execution markers.
- The observer requests only the public ticker channel. No user/account API keys, trade endpoints, file writes, strategy signals, portfolio mutators, market-order functions or brokerage connections.
- A status `RECENT_RECEIPT_UNVERIFIED` means only that a market observation *appears temporally recent* under the received timestamps. It does not verify exchange authenticity, licensing, current executable size, or any trading suitability.

## How to evaluate safely

Static tests need no network and use engineered fictional prices:

```bash
node --test tests/kraken-public-crypto.test.mjs
npm run check
```

The separate optional terminal research command below observes public data without storing it or entering transactions:

```bash
npm run observe:public-crypto
```

Do not redirect its output to a historical-price dataset or treat ticker updates as completed daily OHLCV bars. The existing StarNet swing scanner is *daily bar research*, and no live ticker is connected to that scanner by this PR. Tests against a mocked feed do not prove the upstream WebSocket is reachable in the real world. The source access terms and any later persistence/publication rights must be independently reviewed.

## Next engineering gates

1. Authenticate and independently test the actual source response, market timestamps, venue identifiers and data quality in a permitted local environment.
2. If used as educational paper simulation, add a new isolated, simulated-event input with explicit replay provenance and a session reconnect/gap policy. Never treat missed websocket events as continuously observed.
3. Keep crypto venue tickers and US equities in distinct schemas; do not combine exchange-specific spot quotes with consolidated stock historical bars.
4. Preserve no-credentials/no-orders and paper-only boundaries; evaluate failures and recoverability before any further capability.

**Evidence status:** mock-driven parsing and optional read-only observation runner implemented. No real-stream acceptance, subscription, paid data rights, authenticated market price, simulated paper signal execution or real-order path established.
