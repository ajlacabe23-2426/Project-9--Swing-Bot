# StarNet Phase 14 — Offline research reproducibility and evidence identity

**Date:** November 25, 2026  
**Scope:** Local-file, read-only, fictional/descriptive research.  
**Production:** **NO_GO**.

## Why this phase exists

Phases 10–13 verify local arithmetic, chronological research structure,
cross-file discrepancies, untrusted custody declarations, and sparse-sample
warnings. They do not by themselves guarantee that the **same exact source
files, same frozen methodology and same research observations** were used
for a later rerun or report review.

Phase 14 creates a bounded, self-consistent **research identity record**
and verifies it by independently re-running the study in another process.
The record is not a provider authentication or an endorsement of future
performance.

## What the record binds

- SHA-256 of **original byte streams** for primary history and optional
  witness/custody JSON. JSON whitespace changes require a new record,
  even if normalized data values remain numerically identical.
- Snapshot SHA-256 of the actual local source file contents for the
  chronological research auditor, offline quality, comparison, custody,
  market schema, record module, and CLI helpers. This is a local hash of
  repository code, **not** a signed release attestation.
- Explicit review cutoff, fictional-vs-user-supplied-unverified data
  classification, instrument identity, number of bars, frozen
  50/25/25 post-warmup partitions, next-session entry and five-session
  hypothetical holding window, frozen strategy identifier, all four
  scenario cost IDs, per-phase windows and descriptive cost values.
- Current cross-source discrepancy and custody-review disposition;
  open research-quality review reasons and known evidence gaps.
- A SHA-256 of the derived descriptive results and a SHA-256 of the
  complete deterministic bundle body.

**The record intentionally excludes the original historical file contents.**
An operator must retain the exact permitted source files separately; legal
data rights and redistribution permission are never inferred by their
presence in a bundle.

## Generate and replay

From the StarNet project directory:

\`\`\`bash
npm run research:reproduce -- --demo > starnet-demo-record.json
npm run research:reproduce -- --verify-record starnet-demo-record.json --demo
\`\`\`

The second command reruns the **same engineered fixture** and checks its
source bytes, code fingerprint, chronology, costs, evidence gaps, and
record identity. A matching result says \`EXACT_LOCAL_REPRODUCTION\`.

With historical local inputs already possessed and permitted:

\`\`\`bash
npm run research:reproduce -- --as-of 2026-11-25 history.json --compare witness.json --manifest custody.json > record.json

npm run research:reproduce -- --verify-record record.json --as-of 2026-11-25 history.json --compare witness.json --manifest custody.json
\`\`\`

The \`--compare\` and \`--manifest\` arguments are optional and retain
their previously established meanings. A record generated with optional
inputs cannot be replayed without those original bytes. Input files are
read-only and bounded to 2.5 MB each. The CLI itself does not create,
write or modify any files; shell redirection above is the operator's
explicit choice to preserve the JSON record. \`--live\` is refused.

**The record is not a backup of historical data**, only a file identity
and calculation evidence manifest. Keep raw permitted inputs separately.

## Fail-closed validation

A verifier refuses modified or absent source files, changed JSON bytes,
altered witness/custody file contents, source code changes, a mismatched
review date or input class, modified result summaries, forged safety
claims and an accidentally edited bundle. Even a record whose
non-secret local checksum was recomputed must match a fresh calculation
from its supplied original inputs and local code fingerprint.

This is a **local self-consistency/repeatability test**, not adversarial
proof against an attacker who replaces all inputs, code and the record
together. There is no external trust anchor or independently signed
publisher/timestamp certificate.

### Four things a matching record does *not* establish

1. Historical records were genuine, correctly adjusted, or available at
   the stated time. A claimed vendor source is still untrusted.
2. A trading research method has statistically significant or
   independent out-of-sample predictive validity. The Phase 13 sparse
   holdout warning remains applicable.
3. Real prices, spreads, liquidity, fills, custody, settlement or
   broker/account execution are available or accurate.
4. A Mac hardware power-loss recovery drill, permission to use/reuse data,
   or independent third-party reproduction has been completed.

## Automated verification

\`\`\`bash
node --test tests/starnet-offline-reproducibility.test.mjs
npm run check
npm run security:secrets
npm run security:baseline
\`\`\`

GitHub Verify generates two independently invoked Node CLI bundles and
requires their **exact bytes to match**. A third process verifies a
saved record against regenerated, deterministic inputs and matching
source implementation. It checks all evidence-gaps flags and NO_GO,
and refuses a \`--live\` argument. Tests also deliberately change one
byte of the original source and verify rejection. Prior Phase 1–13
acceptance and headless Chromium remain required.

## Next steps outside this phase

For any future independent historical research review, retain
permitted point-in-time datasets, authenticated issuer action evidence,
license documentation, a signed/attested code snapshot, and a
**separately produced** reproduction from an unrelated reviewer.
Until then the status remains **descriptive local reproduction only**.

**No real trading, broker, wallet, chain, deposits or transfers are enabled.**
