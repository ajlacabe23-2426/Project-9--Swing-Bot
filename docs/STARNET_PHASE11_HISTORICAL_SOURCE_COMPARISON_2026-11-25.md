# StarNet Phase 11 — Historical source discrepancy and provenance evidence

**Date:** November 25, 2026  
**Purpose:** Improve offline data-research auditability; do not execute trades.  
**Production:** **NO_GO**, regardless of matching files or declared provider trust.

## What was missing after Phase 10?

The three-level report could structurally inspect one historical dataset, calculate
its file SHA-256, check for future-dated observations and describe chronological
research assumptions. It could not compare purportedly separate historical
datasets for a given instrument and date. Two sources can disagree on OHLCV,
corporate-action adjustments, availability dates and licensing. The disagreement
must be visible **before** any educational interpretation of the history.

Phase 11 adds:

- \`src/starnet-historical-source-comparison.mjs\`: a pure, read-only
  **two-local-file comparison** with an explicit \`--as-of\` cutoff.
- The existing \`src/starnet-evidence-readiness.mjs\` Level 2 now
  contains \`crossSourceComparison\`. Without a second file this is
  \`NOT_ASSESSED\`; with a second file it recomputes both input hashes,
  schema checks and date-aligned comparisons.
- The \`research:evidence\` CLI accepts an optional
  \`--compare <witness.json>\` in local-input mode. The demo automatically
  compares two **invented** datasets with one altered OHLCV date and one
  deliberately missing bar; it cannot be used as real market evidence.

## Reproduce

\`\`\`bash
# Offline engineered example — deliberately contains discrepancies
npm run research:evidence -- --demo
npm run research:evidence -- --demo --markdown

# Compare two explicitly supplied permitted historical JSON files
npm run research:evidence -- --as-of 2026-11-25 ./primary-history.json --compare ./witness-history.json
npm run research:evidence -- --as-of 2026-11-25 ./primary-history.json --compare ./witness-history.json --markdown

# The original single-file read-only flow remains supported
npm run research:evidence -- --as-of 2026-11-25 ./primary-history.json
\`\`\`

The paths represent **local files already possessed and permitted by the
operator**. The CLI makes no request to download data, access a provider,
authenticate an account, or reach a broker, wallet, chain or exchange. It
reads regular files bounded to 2.5 MB, and writes nothing itself.

## Comparison contract

Each input must conform to Project 9 historical-market JSON, including:
- Strictly ascending unique ISO market-bar dates, finite OHLCV and matching
  single symbol/currency.
- Explicit data cutoff no earlier than either source \`sourceAsOf\` or
  its last recorded completed bar. Future-dated bars fail closed.
- Identical price adjustment methodology is expected for meaningful
  comparison; differences are flagged without silently rescaling values.
- Read-only exact **raw byte SHA-256** of both independently supplied files.
- Date alignment and the number of common days, days absent from either
  input, >1-basis-point OHLC differences, and >1% volume differences.
  Up to twelve bounded date/field/difference samples are retained;
  actual price/volume values are not echoed.
- Returned source labels, retrieval dates, corporate-action status,
  survivorship declarations, and licensing declarations are **untrusted
  self-description** only. A declared retrieval timestamp after the
  comparison cutoff is a review flag; a provider label alone is never
  proof of point-in-time availability or source independence.

Possible comparison findings:

| Finding | Meaning |
|---|---|
| \`DUPLICATE_INPUT_NOT_INDEPENDENT\` | Exact file bytes match; no second independent artifact established |
| \`INSUFFICIENT_OVERLAP\` | Fewer than 60 dates overlap |
| \`DISCREPANCIES_REQUIRE_MANUAL_REVIEW\` | Price, volume, dates or adjustment methodology disagree |
| \`LOCAL_RECORDS_AGREE_AUTHENTICITY_UNVERIFIED\` | Records match locally inside thresholds, but neither source has been independently authenticated |

**None of these results means that source independence, historic quote
authenticity, legal data rights, corporate action correctness, point-in-time
availability or investment predictive validity has been independently proven.**
Even matching file hashes, different source strings, "verified" source fields
and zero discrepancies never promote Level 2 into independent success.

## Safety, trust and reproducibility

- Findings are derived from two actual local byte streams; no caller-supplied
  PASS value, claimed witness label, or file-name difference can elevate
  source authenticity.
- \`overall.productionGate\` and comparison
  \`verification.productionGate\` always stay \`NO_GO\`.
- Level 1 is still synthetic arithmetic, Level 2 is descriptive only, and
  Level 3 Mac/hardware and external operational acceptance remain NOT_VERIFIED.
- This checks **file agreement**, not actual corporate-action factor
  reconstruction, vendor terms, PIT reconstruction, bid/ask liquidity or
  past market execution possibility. It does not establish positive expected
  financial performance, nor facilitate real-market execution.
- Different source labels could refer to copied or forged datasets; no
  separate credential-less archive signature or external trust anchor is
  established. Stated retrieval timestamps could be inaccurate. These
  epistemic limits are deliberately surfaced rather than inferred away.

## Verification

\`\`\`bash
node --test tests/starnet-historical-source-comparison.test.mjs
npm run check
npm run security:secrets
npm run security:baseline
\`\`\`

The GitHub Verify workflow runs the demo and validates the expected
deliberately mismatched pair, identity flags, NO_GO and Chromium alongside
all prior tests. GitHub Security Monitor and exact PR-head CI are required
before integration.

**Next research-only development:** optional unsigned artifact-manifest
checklists, better documented corporate-action source references and
more rigorous independent historical archive sourcing. No source should
be marked independently authenticated until actual independent evidence
is available and reviewed.
