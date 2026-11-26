# NYSE historical-session preflight — bounded evidence check

**Status:** an additional local, read-only research source check; not a data provider,
trading calendar certification, forecasting feature, alert engine, or broker.

## Why this matters

A CSV/JSON can pass numerical validation while still containing a date on a
published market holiday, an unfinished same-day bar, or a misleadingly
"missing" session during a holiday. We must not flag Thanksgiving 2026 as a
missing daily US equity bar or treat Friday November 27, 2026 as a normal
4:00 p.m. ET market close.

Official reference: https://www.nyse.com/trade/hours-calendars
The module contains the **published 2026–2028 NYSE equity core-market**
holiday and early-close references only. No assumptions are made for dates
outside those years; ordinary weekdays remain *tentative* because emergency
closures, unscheduled halts and venue/session exceptions are not proven.

## Offline research CLI

From the project directory, using a **permitted local historical dataset**
already in canonical project9-market-data-v2/v1 JSON format:

\`\`\`bash
npm run research:sessions -- --as-of-utc 2026-11-26T16:00:00.000Z .data/your-local-historical-research.json
\`\`\`

All input is processed locally. The code does not fetch, change or persist any
source data, create orders, access a broker, or initialize any background job.

### Meaning of the output

- \`lastScheduledCoreClose\` is a **calendar-derived candidate date**,
  not a statement that a provider published a final settled historical bar.
- \`BARS_ON_PUBLISHED_CLOSED_SESSIONS\` means a supplied daily equity row
  falls on an official closed holiday or weekend within the covered years.
- \`LATEST_BAR_PRECEDES_SCHEDULED_CORE_CLOSE\` means a source reports the
  current Eastern day before its scheduled close; do not treat it as final.
- \`LATEST_SCHEDULED_CORE_SESSION_ABSENT_FROM_SOURCE\` is a review cue,
  **not** an error declaration: vendor history can publish later.
- \`PARTIAL_CALENDAR_YEAR_COVERAGE\` and
  \`CALENDAR_REVIEW_YEAR_UNSUPPORTED\` signal that this fixed reference
  cannot judge some/all dates.
- \`SOURCE_RETRIEVED_AFTER_REVIEW_INSTANT\` warns that the supplied source
  metadata is not compatible with a claim that this dataset was already
  acquired at the earlier review instant.

No output status authenticates the market dataset or proves point-in-time
availability, observed volume legitimacy, corporate-action adjustment,
data rights, issuer actions, or strategy efficacy.

## Adjusted data warning

Massive documents that REST daily aggregate prices with \`adjusted=true\`
are **split adjusted but not dividend adjusted**, and historical adjusted
prices can be revised after later splits. Treat a downloaded adjusted series
as a *derived retrospective view*, not an immutable vintage. Preserve the
exact downloaded bytes privately, keep dated retrieval and adjustment
metadata, and check corporate-action evidence separately.

Source: https://massive.com/knowledge-base/article/is-massives-stock-data-adjusted-for-splits-or-dividends

## Checks and acceptance

\`\`\`bash
node --test tests/nyse-session-preflight.test.mjs
npm run check
npm run security:baseline
npm run security:secrets
\`\`\`

The built-in tests are fictional data only. No data-provider credentials,
subscriptions, commercial rights, licensed market data, live execution or
brokerage accounts are part of this feature.

**Gate:** research data still unauthenticated; strategy performance unproven;
production **NO_GO**. A person reviewing permitted actual data and up-to-date
exchange notices must independently confirm each ambiguous source entry.
