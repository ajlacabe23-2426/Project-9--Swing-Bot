# StarNet Crypto-first research migration — 2026-11-26

Scope: public cryptocurrency observations and 24/7 candle-quality auditing. US equities research and the existing fictional paper ledger remain intact. No exchange accounts, paid subscriptions, withdrawals, real-money orders, or broker integrations are added.

## Crypto-specific assumptions

- Crypto spot prices belong to a particular venue and trading pair, with base/quote assets, UTC interval time, and base-asset volume. These must not inherit NYSE holiday or share-volume logic.
- Kraken public WebSocket ticker observations and completed OHLC candles are different data types. The ticker parser is on prior PR #97; this change adds a separate REST candle adapter.
- The Kraken REST OHLC endpoint explicitly includes an unfinished final row; the adapter drops this row, even if the local clock implies it looks old.
- Kraken returns at most 720 recent OHLC entries regardless of its since parameter. At 60-minute granularity that is about 30 days, not a deep backtesting archive. At daily granularity it is under 2 years of candles.
- Candle gaps and older-than-expected observations are not invented or filled. Duplicate, out-of-order, future or inconsistent candle rows fail closed.
- Kraken quotes are venue-specific, not a consolidated crypto price or a verified executable order price.

Official docs:
https://docs.kraken.com/api-reference/market-data/get-ohlc-data
https://docs.kraken.com/exchange/api-reference/spot-websocket-v2/ohlc
https://docs.kraken.com/exchange/api-reference/spot-websocket-v2/ticker
https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/public/get-public-product-candles

## Code paths

- src/providers/kraken-public-ohlc.mjs: narrow unauthenticated public REST URL, validation, pair matching, timestamps, missing intervals, base-volume semantics and NO_GO marker.
- scripts/inspect-public-crypto-candles.mjs: explicit one-time public GET and read-only JSON quality summary without persisting provider data.
- tests/kraken-public-ohlc.test.mjs: wholly synthetic controlled test fixtures and expected failure cases.
- Existing stock market scanner, Massive adapter, synthetic portfolio and order boundaries are unchanged.

## Local verification (supported security-patched Node runtime)

    node --test tests/kraken-public-ohlc.test.mjs
    npm run check
    npm run crypto:inspect -- BTC/USD 60
    npm run crypto:inspect -- ETH/USD 1440

The first two commands require no network; each inspect call requests only the public spot OHLC GET and prints bounded quality metadata. No accounts, secrets, state mutations or order capabilities are involved.

## Separate later gates

1. Verify actual exchange responses, license, coverage and consistency on an authorized local network.
2. Cross-check against a second source independently, including interval alignment and missing market activity.
3. Obtain a licensed longer-term archive: a 720-row endpoint is not enough for thorough historical market-condition research.
4. Keep any classroom strategy hypothesis separate from market-data authenticity and do not claim current prices or profitability from offline mocks.

Status: crypto-first read-only data research groundwork, not a production trading bot. No subscriptions bought, no live orders, production NO_GO.
