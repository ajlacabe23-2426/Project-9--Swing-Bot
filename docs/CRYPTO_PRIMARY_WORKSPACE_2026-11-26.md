# StarNet crypto-primary workspace and local source host — 2026-11-26

## Scope and visible change

- Primary loopback homepage `/` and `/index.html` now serve the Crypto Market Desk, not the old SIM-01 dashboard.
- `/crypto.html` remains an equivalent alias. The original synthetic dashboard is preserved at `/simulation.html`; stock research remains at `/workstation.html` and `/research.html`.
- A manual public Kraken BTC/USD or ETH/USD top-of-book observation panel displays timestamped best bid/ask and last traded price when available. It explicitly labels the venue as Kraken-only and independently unverified.
- A separate existing public OHLC candle inspector shows recent completed candles and flags gaps. It deliberately discards Kraken's final unfinished candle.
- Both endpoints are read-only, only localhost, strictly allowlisted and rate-limited. No credentials, balances, account connectors, private channels, deposit/withdrawal functions, trade routing or order endpoints.

## Source references

- Kraken Spot WS v2 ticker public top-of-book and timestamps: https://docs.kraken.com/exchange/api-reference/spot-websocket-v2/ticker
- Kraken REST public OHLC, 720-row cap and always-unfinished last row: https://docs.kraken.com/api-reference/market-data/get-ohlc-data

## API behavior

- `GET /api/crypto/public-ticker?pair=BTC%2FUSD` only after user clicks. An isolated bounded WebSocket request waits at most 6.5 seconds for a fresh, source-labeled message, then closes.
- The quote response advertises SINGLE_EXCHANGE_ONLY, RECENT_BY_REPORTED_TIMESTAMPS_ONLY and NO_GO. It never represents market-wide consolidation, independently authenticated origin or guaranteed executability.
- Throttle: one public quote read every 10 seconds per local server. Error or stale source returns a 502 with no reused price.
- Existing candle inspection uses a separate throttle and returns only validated completed-candle chart data.
- The frontend clears quotes on pair change and failed fetch; it never silently retains a prior value as the current price.

## Verification and boundaries

Run npm run check, security:baseline, security:secrets and headless Chromium tests. Include dedicated tests/kraken-public-snapshot.test.mjs and tests/crypto-primary-http.test.mjs.

This is a local research interface, NOT a publicly deployed or commercial multi-tenant website. The existing server runs on localhost and has legacy synthetic/paper state routes. It must not be published behind a reverse proxy without a separate isolation, authentication, rate limit and privacy audit.

Data stream access from a user's own environment, data redistribution rights and historical archive completeness have not been independently verified. Neither a current-market observation nor a historical candle is evidence of a profitable strategy. No broker, exchange account, auto-trading or real-money order implementation is authorized or created.

PR stack: crypto public ticker PR #97 -> crypto OHLC/browser research PR #98 -> this primary-workspace branch. No prior PR merged automatically. The old stock and synthetic code are deliberately preserved while crypto becomes the homepage.
