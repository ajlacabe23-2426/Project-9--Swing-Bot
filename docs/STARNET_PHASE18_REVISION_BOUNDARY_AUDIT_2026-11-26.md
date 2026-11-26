# StarNet Phase 18 — historical-revision and moving-holdout evidence audit

**Production: NO_GO. Research-only.** This changes no trading strategy, historical
source, paper portfolio, provider adapter or account. It performs an offline,
read-only comparison between two explicitly supplied JSON market-history
snapshots; both may be synthetic or self-declared and remain unauthenticated.

## Why this phase matters

The frozen descriptive research code divides *available post-warmup completed
bars* into 50% development, 25% validation and 25% holdout. **Adding a new
bar can shift the start/end dates of one or more partitions.** A revised
historical bar, changed volume, deleted date or moving holdout can make a
seemingly "better" backtest incomparable with an earlier record. Avoid any
claim of improvement from those changed test conditions.

## Try the built-in fictional example

```bash
node scripts/starnet-revision-audit.mjs --demo
# or
npm run research:revisions -- --demo
```

The example modifies one historical volume value in an invented price series.
It reports the revision; it does not assert that the modified value is correct.

## Compare two historical files you already have permission to inspect

```bash
node scripts/starnet-revision-audit.mjs \
  --as-of 2026-11-26 ./baseline.json ./candidate.json
```

- Inputs are bounded (up to 2.5MB each), locally parsed, never uploaded,
  automatically downloaded or modified.
- Explicit cutoff, instrument and currency must agree; invalid/future dates
  and inconsistent OHLCV records are refused.
- It fingerprints both exact input byte streams with SHA-256.
- It counts **added dates, missing dates, revised dates and revised fields**;
  the first 12 differences are included by date/field without echoing prices.
- It independently recomputes the same frozen chronology and hypothetical
  cost assumptions and prints each phase's original/candidate date range,
  sampled strategy-window count and mean results.
- A changed bar universe or existing historical value **blocks same-input
  comparisons**. A new bar can change holdout boundaries, which is reported.
- Metadata-only changes are flagged, not authenticated, even when a user
  declares that a vendor, corporate action or license has been reviewed.

The phrase `validSameFrozenHoldoutComparison` indicates only whether the
**same locally observed dates/values and computed boundaries** are present.
It does **not** establish independent samples, predictive efficacy,
source authenticity, legal data rights, point-in-time availability or
realistic execution costs.

## Acceptance and limits

```bash
node --test tests/starnet-research-revision-audit.test.mjs
npm run check
npm run security:secrets
npm run security:baseline
```

A clean comparison cannot turn synthetic or self-declared historical files
into authentic market evidence. A passing test certifies software behavior on
test fixtures, not whether a strategy performs reliably. Any independent
strategy-efficacy assessment requires separately sourced, lawfully usable,
point-in-time historical records, frozen study design and qualified
statistical review. No real trades or production permission are created.
