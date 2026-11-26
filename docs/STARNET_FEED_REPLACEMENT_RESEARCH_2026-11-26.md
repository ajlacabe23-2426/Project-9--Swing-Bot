# StarNet market-data direction — 2026-11-26

Status: read-only research architecture review. No broker, order dispatch or new subscription.

## Verified from official providers

- TradingView does not offer a general retail market-data API to read its chart prices into StarNet. Its REST API is for brokerage integration: https://www.tradingview.com/support/solutions/43000474413-i-need-access-to-your-api-in-order-to-get-data-or-indicator-values/
- TradingView Advanced Charts needs our own external data source: https://www.tradingview.com/charting-library-docs/latest/connecting_data/
- TradingView publishes default indicative US stock data from Cboe; it is not the consolidated quote feed: https://www.tradingview.com/support/solutions/43000473924-is-us-stock-market-data-free-by-default/
- TradingView alerts and webhooks are notifications rather than an authenticated low-latency market-data stream. TradingView explicitly says alerts are not designed for automated trading: https://www.tradingview.com/support/solutions/43000722015-using-credentials-for-webhooks/
- TradingView forbids scraping and unauthorized non-display algorithmic use of its data: https://www.tradingview.com/policies/
- Alpaca documents real-time IEX-only US equity data for its free data tier; separate SIP consolidated coverage requires the corresponding subscription: https://docs.alpaca.markets/us/docs/about-market-data-api
- Interactive Brokers requires appropriate API-compatible market-data subscriptions for relevant real-time securities: https://www.interactivebrokers.com/support/faq/content/get-real-time-data-us-1491290694

## Engineering design decision

Historical source: retain raw private source archives, corporate-action revisions and time-split research. A daily bar is not a live bid/ask quote.

Display: TradingView may be consulted by a human as separate charts/alerts; the chart or webhook does not become a StarNet feed. Do not scrape or republish it.

Current observations: use a provider-neutral, explicit feed-scope receipt, and independently review its timestamp, delay, venue scope, market-session state, vendor entitlement and completeness before interpreting it. Do not mistake a single-exchange IEX or indicative Cboe view for consolidated NBBO.

Current repo: src/market-intelligence.mjs already declares research NOT_EXECUTION_READY even when mode is REALTIME. This change adds src/starnet-market-observation-gate.mjs to audit purely self-declared market observation metadata and fail closed on stale/delayed/limited feed modes.

## Verification

- Run node --test tests/starnet-market-observation-gate.test.mjs with engineered fictional metadata.
- Run npm run check, security baseline and secrets scanner, and GitHub CI on the exact commit.
- This branch does not connect a data feed, authenticate a quote, create an account, or change strategy/ledger/order behavior.
- Even a fresh declared SIP timestamp is not independent authentication. NO_GO remains the production and trading status.

## Next dependencies

Confirm lawful access, commercial scope and real-time entitlement of a licensed provider. Test an isolated read-only mock of its actual response and failure cases. Keep browser/chart UI independent of the source and historical archive. Never promote a simulated result or self-asserted source timestamp to actual executable market evidence.
