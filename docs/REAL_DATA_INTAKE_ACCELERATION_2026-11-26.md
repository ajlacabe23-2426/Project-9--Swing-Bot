# StarNet — real-data research intake runbook (2026-11-26)

**Scope:** Authorized, read-only historical research and paper simulation. **Not** an order-routing or trading setup guide. No real-money actions, brokerage connection, hosted data publication, payments, or strategy-profitability claims.

## What we have today

- `src/providers/massive.mjs` can retrieve daily US stock OHLCV records under an existing authorized Massive market-data subscription and map them into the canonical `project9-market-data-v2` source schema. The API key stays local; this change sends it in the Authorization header rather than URL query parameters.
- `scripts/import-market-csv.mjs` can convert explicitly permissioned local daily OHLCV CSV files, preserving conservative provenance.
- `src/reviewed-market-write.mjs` atomically preserves the original historical archive and rejects older or revised bars instead of silently overwriting records.
- `scripts/audit-watchlist-data.mjs` checks local structure and source declarations; `scripts/audit-market-evidence.mjs` screens additional point-in-time/custody sidecar claims. Both remain UNVERIFIED until external documents are reviewed.
- Current Phase 16/17/18 methodology work tests a frozen hypothesis against chronology, a weak holdout sample, modeled costs, and moving partition boundaries. Passing these software tests does **not** prove market performance.

## Sources to investigate — no purchase, account setup or credentials authorized by this document

| Evidence required | Primary evidence | Independently reviewed corroboration | Why |
|---|---|---|---|
| Daily OHLCV bars | Massive Stocks custom aggregates — https://massive.com/docs/rest/stocks/aggregates/custom-bars | A separately licensed market history dataset (for example Databento historical equities) | Verify bars and timestamps; discrepancy review required |
| Split/dividend events | Provider corporate-action history; original issuer releases | SEC EDGAR filings at https://www.sec.gov/search-filings/edgar-application-programming-interfaces | Split-adjusted vendor prices are not automatically dividend-adjusted or perfectly point-in-time |
| Historic listing/delisting coverage | Provider symbol/reference history | Licensed active **and** delisted security master (e.g., Sharadar/Databento) | Modern surviving-symbol lists distort older samples |
| Point-in-time availability | Provider historic archive/vintage timestamps and methodologies | Dated retrieval receipt, raw archive copies, issuer effective/filing timestamps | Downloading a revised series today does not show what was known years earlier |
| Market session/calendar | Exchange official holiday/early-close calendars and vendor bar timestamp definitions | Second time/venue source | A valid ISO date need not be an actual trading session |
| Data permission | Current applicable provider agreement for specific plan and use | Human confirmation of permitted internal storage/analysis and any sharing limits | A technical API success is **not** a license for publication, redistribution or monetization |

Sources checked 2026-11-26:
- Massive: https://massive.com/knowledge-base/article/how-much-historical-stock-data-does-massive-have
- Massive adjustments: https://massive.com/knowledge-base/article/is-massives-stock-data-adjusted-for-splits-or-dividends
- Massive API authentication: https://massive.com/docs/rest
- Massive personal market-data terms: https://massive.com/legal/market-data-terms-of-service
- Databento point-in-time corporate actions: https://databento.com/docs/datasets/corporate-actions
- Sharadar historical equities: https://data.nasdaq.com/databases/SEP/documentation

**License boundary:** Massive's published individual market-data terms describe personal, non-business, non-commercial use. Do not assume that sharing raw/derived data, displaying vendor charts publicly, or supporting a commercial product is covered. An independent secondary data source may also have license fees or restrictions; it is not automatically authorized.

## Fastest repeatable offline intake

If a research dataset is already lawfully available, keep the original bytes **private on the operator machine** under an ignored local directory. Do not check provider datasets or keys into the repository, GitHub Actions, social posts, or this chat.

1. Verify the permitted scope for storage and personal offline research; document the actual provider product, terms/version, adjustment convention, asset identifier, and source-vintage limitations. **Unknown means unknown.**
2. Capture a separate original read-only source copy and declared retrieval time. Use the existing adapter or the local CSV import; do not claim an independently verified historical archive merely because the API returned 200.
3. Run the existing local structural audit: `npm run audit:market -- --as-of YYYY-MM-DD path/to/history.json`. Compare the SHA-256 from each repeatable snapshot; never silently replace older values.
4. Run the existing chronological retrospective check: `npm run research:time-split -- --as-of YYYY-MM-DD path/to/history.json`. Treat all observations as hypothetical descriptions, not predictive success.
5. Run the evidence sidecar preflight (if a sidecar is available): `node scripts/audit-market-evidence.mjs YYYY-MM-DDTHH:MM:SS.mmmZ path/to/history.json path/to/evidence.json`. The helper **does not** authenticate sources even when its local consistency checks pass.
6. When a separately licensed independent archive becomes available, compare original prices/events/session records, investigate mismatches, and quarantine unresolved differences. Retain evidence of provider identity and terms.
7. Only compare frozen tests with unchanged dataset definitions, dates, cost settings and strategy. Changing data/history invalidates direct claims of improvement.

No command above opens, updates, or places actual brokerage orders.

## Parallel work without skipping gates

**Engineering lane:** Harden source retrieval, local archive immutability, schema checks, recovery, fixed-split research, and tests. All can be developed using clearly engineered fictional fixtures.

**Evidence lane:** Gather independent vendor terms, dated price archives, source methodology, split/dividend announcements, delisted-universe coverage, session definitions and raw-data access rights. This lane requires lawfully available external materials and human review.

**Statistical lane:** After authentic authorized data exist, preserve an untouched holdout, predeclare one study, include multiple historical conditions and a sufficiently large independent sample, report slippage/cost sensitivity, and request outside review. Do not promote a strategy solely because one re-run looks better.

**Use boundary:** Offline research and paper-simulation exercises can be inspected independently of live-trading readiness. No broker integration or execution is added here.

## Operator-facing blockers

- No Massive credentials, provider entitlement or licensed raw historical archives are present in the tracked repository. Never send credentials to ChatGPT or commit them to source.
- No verified independent quote/source archive, corporate-action ledger, point-in-time symbol universe or external statistical review has been supplied.
- Individual market-data subscriptions may not authorize redistribution; project publicity and commercialization require separate legal/contract review.
- Physical device acceptance, expired/stale historical bars, full-source completeness, exact vendor entitlements, and source-native holiday handling remain separately unverified.

**Phase verdict: real-data intake pathway documented; authentic historical inputs NOT_OBTAINED; predictive reliability NOT_ESTABLISHED; production NO_GO.**
