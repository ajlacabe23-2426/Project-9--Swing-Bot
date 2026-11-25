# StarNet Phase 12 — Offline historical custody evidence integrity

**Date:** November 25, 2026  
**Scope:** Local-file educational research and chain-of-custody *declarations*, never authenticated third-party source evidence.  
**Production:** **NO_GO**. No brokerage, wallet, exchange, signing, chain or live trade route.

## Engineering objective

Phase 11 compares two local historical files and flags missing dates and
price/volume disagreements, but local file agreement is not proof of provenance.
Phase 12 adds an optional separate, **untrusted** evidence manifest that ties
the **exact historical JSON bytes** to a declared capture event, an archive
reference, optional corporate-action notices, and a declared licensing-terms
reference. This allows false, incomplete and contradictory *claims* to be
flagged before research interpretation.

The manifest never authenticates who wrote the record, who owns an archive,
whether a timestamp is truthful, whether a notice represents a genuine issuer
action, whether a license is enforceable, or whether historical records were
available to a trader at the specified time.

## Trust and failure boundaries

- The auditor validates exact manifest schema/field sets, input byte SHA-256,
  the same symbol, currency, declared source label, source-as-of date, and
  timestamp consistency with an explicit review cutoff.
- A capture cannot precede the dataset's own declared retrieval timestamp,
  precede its source-as-of date, or occur after the review cutoff.
- A required archive reference must have a unique ID, acceptable kind,
  syntactically valid SHA-256 and declared publication no later than capture.
  **The referenced external content is not fetched, hashed or authenticated.**
- A claimed rights reference must point to a declared LICENSE_TERMS record.
  \`NOT_VERIFIED\` requires a null license reference. Neither option verifies
  data rights or redistribution permission.
- Corporate action records may be \`NOT_ASSESSED\`,
  \`NO_EVENTS_DECLARED\` or \`REFERENCES_DECLARED\`. References must have
  exact record fields and valid event types (SPLIT, DIVIDEND, MERGER,
  SPINOFF), dates inside the dataset range and CORPORATE_ACTION_NOTICE reference kind.
  A declared notice made available after an event is explicitly flagged. Source references declared as published after the snapshot's capture are also flagged.
  A notice dated after the review cutoff or capture is refused.
- Extra credential, account, wallet, provider secret or live-execution
  fields fail schema validation; no side effects occur.
- Even a manifest with all references consistent returns
  \`DECLARATIONS_CONSISTENT_AUTHENTICITY_UNVERIFIED\` rather than
  \`PROVEN\` or \`GO\`.
- Missing action review or rights proof remains \`REVIEW_REQUIRED\`.
  \`independentSourceAuthenticityVerified\`,
  \`pointInTimeAvailabilityIndependentlyVerified\`,
  \`corporateActionTruthVerified\`, and
  \`termsOfUseIndependentlyReviewed\` always remain false.
- The Phase 10 three-level result remains: engineering synthetic-arithmetic
  PASS only, research descriptive and partially checked, operations unverified.
  The overall production gate remains **NO_GO**, regardless of local evidence.

## Local manifest contract

\`\`\`json
{
  "schema": "project9-offline-history-custody-manifest-v1",
  "scope": "UNTRUSTED_LOCAL_RESEARCH_ARTIFACTS",
  "dataset": {
    "sha256": "the actual lowercase SHA-256 of historical JSON bytes",
    "symbol": "SIM09",
    "currency": "USD",
    "sourceAsOf": "2024-09-23",
    "declaredSource": "the exact source label inside the dataset"
  },
  "capture": {
    "method": "OPERATOR_LOCAL_COPY",
    "claimedCapturedAt": "2024-09-23T12:00:00.000Z",
    "snapshotReferenceId": "OFFLINE-ARCHIVE-001"
  },
  "references": [
    {
      "referenceId": "OFFLINE-ARCHIVE-001",
      "kind": "ARCHIVE_SNAPSHOT",
      "sha256": "lowercase SHA-256 string declared for reference",
      "claimedPublishedAt": "2024-09-23T09:00:00.000Z"
    }
  ],
  "corporateActions": {
    "status": "NOT_ASSESSED",
    "records": []
  },
  "rights": {
    "status": "NOT_VERIFIED",
    "referenceId": null
  }
}
\`\`\`

The date and hash placeholders above are **examples**, not a valid ready-made
attestation and not instructions to invent provider evidence. The real manifest
must be constructed from local evidence actually possessed by the operator.
\`ENGINEERED_FIXTURE\` is reserved for the built-in fabricated demo;
\`OPERATOR_LOCAL_COPY\` is required for explicitly supplied local files.
The source record itself is **untrusted**.

For a corporate-action record, the exact allowed fields are
\`eventId\`, \`eventDate\`, \`kind\`, \`referenceId\`, and
\`claimedAvailableAt\`. The referenced record must be a
\`CORPORATE_ACTION_NOTICE\`. \`LICENSE_TERMS\` is the only valid kind
for a declared rights reference.

## Reproduction

\`\`\`bash
# Same Mac demonstration; includes a clearly fictional custody manifest.
npm run research:evidence -- --demo --markdown

# Explicit permitted historical file with separately supplied untrusted manifest:
npm run research:evidence -- --as-of 2026-11-25 history.json --manifest custody.json --markdown

# The optional Phase 11 second-file comparison can be combined:
npm run research:evidence -- --as-of 2026-11-25 history.json --compare witness.json --manifest custody.json --markdown
\`\`\`

Neither input files nor the manifest are edited by the CLI. It reads regular
local files bounded to 2.5 MB and writes nothing itself. Local checks may
assist provenance review, **but they cannot independently verify licensed
data acquisition, issuer notices, real-time availability, or predicted returns**.

## Automated evidence and outstanding verification

\`\`\`bash
node --test tests/starnet-offline-custody-evidence.test.mjs
npm run check
npm run security:secrets
npm run security:baseline
\`\`\`

GitHub CI requires the engineered demo custody evidence, no real orders,
explicit research-only status, existing Phase 1–11 tests and headless Chromium.
The GitHub Security Monitor must independently pass before merge.

Outstanding: real provider archive authenticity, immutable externally
timestamped source snapshots, legal permission records, certified
corporate-action source documents, actual Mac workflows involving permitted
historical datasets, storage power-loss testing and independent real-market
research review. These are **not completed** by this phase.

**No real trading is created, enabled, suggested, or executed.**
