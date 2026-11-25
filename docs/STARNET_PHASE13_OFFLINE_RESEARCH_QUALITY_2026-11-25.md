# StarNet Phase 13 — Offline historical research-quality gates

**Date:** November 25, 2026  
**Scope:** Educational, descriptive, read-only validation of a fixed historical strategy exercise.  
**Production trading:** **NO_GO**.

## Why Phase 13 exists

Phase 10 separates engineering, research and operations. Phase 11 compares two
local files, and Phase 12 checks the internal consistency of locally supplied
archive/corporate-action references. None of these proves that a market
simulation is predictive or valid as a financial decision tool.

Phase 13 adds \`src/starnet-offline-research-quality.mjs\`, an independent
quality review that **recomputes** the existing frozen chronological exercise
from input bars, rather than trusting a precomputed "PASS" or researcher label.
The output is nested under \`levels.research.researchQuality\` in JSON and
appears as a summary in the existing Markdown report.

## Separate quality gates

### 1. Chronological construction

- The fixed, existing 50/25/25 contiguous post-warmup partitions remain
  \`DEVELOPMENT_REFERENCE\`, \`CHRONOLOGICAL_VALIDATION\` and
  \`CHRONOLOGICAL_HOLDOUT\`. They are not shuffled, refit or optimized.
- Each hypothetical entry must begin the next completed bar after its
  signal and exit five completed sessions after its signal, entirely
  within its own partition. The auditor checks dates against actual
  bar indices and validates that windows do not overlap.
- All windows and hypothetical cost references are recomputed from
  the dataset. The four predefined hypothetical cost scenarios must
  retain their identities and degrade the displayed mean relative
  to lower-cost scenarios.
- These constraints prevent a set of obvious methodological mistakes.
  They **do not** establish that real historical records were available
  at each signal time or that no research choices were retrospectively made.

### 2. Sample-size disclosure, not a pass/fail for profitability

- Phase 13 uses a **20-strategy-windows-per-period reference floor**
  solely to flag sparse descriptive samples.
- This is *not* a scientifically calibrated statistical power threshold
  and cannot be interpreted as proof of significance, confidence, strategy
  quality or adequate sample independence when met.
- The engineered 190-bar demonstration yields 70/35/36 completed bars
  across the partitions, 17 total hypothetical strategy windows and 26
  periodic control windows. At least one period is below the floor.
- The holdout is **descriptive only**. The periodic baseline is not
  matched to scanner signals and is not an executable benchmark.
  Its comparison cannot establish superiority, risk-adjusted alpha or
  repeatable future returns.

### 3. Market-record anomaly review

The module counts zero-volume completed bars and date-to-date close
changes exceeding an absolute 40% threshold. These are simple **review
flags**, not assertions that records are corrupted or that an issuer
had a genuine corporate action. Source documents would be required to
resolve legitimate stock splits, unusual market activity or data defects.

### 4. Provenance and operations remain independent

- Missing witness history and missing custody records produce explicit
  evidence gaps; Phase 11 discrepancies and Phase 12 review requirements
  remain visible.
- Self-declared \`INDEPENDENTLY_REVIEWED\` corporate-action or licensing
  fields never authenticate themselves. There is no independent source
  or point-in-time proof merely because a local report was internally
  consistent.
- Neither a green unit test nor a larger sample makes Level 2
  \`RESEARCH_VERIFIED\`; research status stays
  \`PARTIAL_DESCRIPTIVE_CHECKS_ONLY\`. Level 3 Mac/hardware/external
  verification stays \`NOT_VERIFIED\`.
- Output includes \`independentStatisticalConfidenceCalculated:false\`,
  \`strategyEfficacyEstablished:false\` and \`productionGate:NO_GO\`.
  The system makes no forecasts, trade suggestions or real transactions.

## Reproduce after pulling main

\`\`\`bash
# Same demonstration previously run on the Mac:
npm run research:evidence -- --demo --markdown

# Structured report with the new Level 2 quality section:
npm run research:evidence -- --demo

# Optional local, already permitted historical records:
npm run research:evidence -- --as-of 2026-11-25 history.json --compare witness.json --manifest custody.json --markdown
\`\`\`

The CLI is offline, reads local files only (or generated classroom fixtures),
and creates only a disposable internal fictional journal. It does not connect
to a brokerage account, market data subscription, crypto wallet or network.

## CI acceptance

\`\`\`bash
node --test tests/starnet-offline-research-quality.test.mjs
npm run check
npm run security:secrets
npm run security:baseline
\`\`\`

GitHub Verify now checks the exact demonstration's partitions,
sample reference floor, fixed cost-stress assumptions, external evidence
gaps and NO_GO status, alongside previous phases, browser acceptance and
recovery tests. Security Monitor also must pass before a merge.

## Outstanding research-quality work

An independent archive/data license, corporate-action source documents,
source timestamp/point-in-time verification, time-aligned historical data
with clean survivorship handling, separate genuine holdout methodology,
appropriate uncertainty handling for serially dependent observations and
independent reproducibility review **remain outstanding**. These must
not be inferred from passing synthetic tests.

**This is an educational research-quality audit, not evidence of profitable
trading or permission to operate a real trading system.**
