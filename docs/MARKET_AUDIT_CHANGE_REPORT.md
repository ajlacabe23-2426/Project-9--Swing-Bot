# Offline market-audit change report (research-only)

## Purpose

Compare two **already-created** Project 9 offline data-readiness reports with an explicit human-chosen review date. This is a read-only change log for research dataset provenance and freshness, not a trading scanner, strategy evaluation, vendor authentication, or permission to use a price feed.

## Use

1. Generate and preserve two offline JSON reports using `node scripts/audit-watchlist-data.mjs` on separately permitted, local market-data files.
2. Compare them without a network call:

```bash
node scripts/compare-market-audits.mjs old-audit.json new-audit.json
```

The output identifies datasets added/removed, SHA-256 input changes, later or earlier last-bar dates, new/resolved review flags, and unchanged symbols. Invalid identities, dates, duplicate symbols, inconsistent counters, or reports that claim brokerage connectivity are refused.

A changed checksum does **not** establish why a file changed; investigate changes against your retained source, source rights, and independent vendor evidence. A resolved flag does **not** establish vendor authenticity or strategy validity. A backwards bar date receives an explicit warning. The report includes `executionAllowed: false` and never submits orders.

## Tests

```bash
node --test tests/market-audit-change-report.test.mjs
```

This module does not depend on Project 9's overlapping PR #60 paper-accounting candidate and does not modify persistence, provider adapters, live brokerage, order routes, signals or held-out evaluation.
