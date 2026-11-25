# StarNet Phase 15 — Claim registry and separate local review notes

**Scope:** research-only, offline and synthetic/explicitly unverified historical files.  
**Production:** **NO_GO**. No actual trades, accounts, wallets or transfers.

## Why this exists

Phase 14 proved that an exact *local* research record can be reproduced using
the same original bytes and source-code fingerprint. It did not establish that
the market data was authentic, the hypothetical strategy was predictive, that
data licensing was verified, or that an independent human reviewed anything.

Phase 15 adds **nine explicitly scoped claims** plus an **independent-from-the-
original-record, but not independently authenticated, local review-note ledger**.
A reviewer's typed label is an untrusted local declaration. No approval or note
can upgrade a research claim or turn a synthetic PASS into production readiness.

## Registry v1

\`src/starnet-research-claim-registry.mjs\` only builds a registry after
\`verifyStarNetResearchReproducibility\` checks the original permitted data
bytes, optional witness/custody bytes, unchanged research methodology SHA-256,
recomputed frozen study and existing NO_GO status. No caller-provided claim
status is accepted as proof. The resulting registry links each claim to the
original input SHA-256, local methodology SHA-256, reproduction bundle SHA-256,
and derived result SHA-256.

| Claim | Supported status in engineered demo |
|---|---|
| Local reproduction | \`SUPPORTED_LOCAL_CALCULATION_ONLY\` |
| Count of local historical observations | \`SUPPORTED_LOCAL_CALCULATION_ONLY\` |
| Frozen chronology/partition construction | \`SUPPORTED_LOCAL_CALCULATION_ONLY\` |
| Holdout sample adequacy | \`INSUFFICIENT_DESCRIPTIVE_OBSERVATIONS\` |
| Historical source authenticity | \`NOT_VERIFIED\` |
| Corporate-action correctness | \`NOT_VERIFIED\` |
| Market-data legal rights | \`NOT_VERIFIED\` |
| Predictive efficacy | \`NOT_ESTABLISHED\` |
| Authenticated external review | \`NOT_PERFORMED\` |

The built-in demo contains 190 fabricated historical bars and only
**one hypothetical holdout observation**, below Phase 13's **20-window
descriptive reference floor**. Neither reaching that floor nor a successful
local computation would prove statistically independent out-of-sample skill.

## Local note ledger — deliberately separate from research evidence

\`newStarNetResearchReviewLedger\`,
\`appendStarNetResearchReviewNote\`, and
\`replayStarNetResearchReviewLedger\` manage a small append-only local
hash-chained ledger tied to the **registry fingerprint**.

Each note records an exact \`SIM-NOTE-*\` ID, a known \`SIM-CLAIM-*\` ID,
an action, a \`LOCAL-REVIEWER-*\` **unverified label**, and a closed-list
reason code. Supported actions:

- \`ACKNOWLEDGE_LOCAL_CALCULATION\` — **only** for claims whose automated
  status is \`SUPPORTED_LOCAL_CALCULATION_ONLY\`; cannot acknowledge
  prediction, vendor authenticity or source permissions as verified.
- \`DISPUTE_CLAIM\` — flags an unsupported or contested conclusion.
- \`REQUEST_EXTERNAL_EVIDENCE\` — records unresolved proof requirements.

The ledger rejects unsupported actions, duplicate note IDs, invalid
references, contradictory reason codes, changed hashes, reordered
entries, excess fields, claimed verified reviewer identities and anything
that tries to switch \`productionGate\` to \`GO\`.

**Important limitations:** the local chain detects inadvertent changes to
an existing ledger, but its SHA-256 hashes are public and unsigned. A
malicious actor could rewrite the entire local history and recompute every
hash. It does not establish an authenticated reviewer, independent sign-off
or tamper-proof audit provenance. The automated claim statuses never change
in response to a note.

## Run from the StarNet repository on the Mac

\`\`\`bash
git switch main
git pull --ff-only origin main

# Inspect the nine grounded claims and evidence gaps:
node scripts/starnet-review-claims.mjs --demo --markdown

# Create a local note recording acknowledgment of one reproducible count:
node scripts/starnet-review-claims.mjs --demo \
  --note SIM-CLAIM-BAR-COUNT ACKNOWLEDGE_LOCAL_CALCULATION LOCAL_CALCULATION_RECHECKED \
  --ledger-only > ~/Downloads/starnet-local-review-notes.json

# Read the unchanged claim statuses alongside that local note:
node scripts/starnet-review-claims.mjs --demo \
  --reviews ~/Downloads/starnet-local-review-notes.json --markdown
\`\`\`

The use of **node directly** (instead of \`npm run ... > file.json\`)
ensures that the saved JSON contains no npm startup headings. The CLI
does not write files on its own; any output redirection is explicitly
performed by the operator.

A saved Phase 14 record can also be supplied with \`--record PATH\`.
It is independently replayed against the original bytes and the
*current methodology*. Since this change refactors the Phase 14 CLI
source, records created before Phase 15 may fail their code-fingerprint
check. Regenerate an old demo record with:

\`\`\`bash
node scripts/starnet-reproduce-research.mjs --demo > ~/Downloads/starnet-demo-record.json
node scripts/starnet-review-claims.mjs --demo \
  --record ~/Downloads/starnet-demo-record.json --markdown
\`\`\`

Permitted historical local files continue to use
\`--as-of DATE primary.json [--compare witness.json] [--manifest custody.json]\`
as in Phases 11–14. Missing raw data, altered code, stale source files or
contradictory metadata **fail closed**.

## Acceptance tests and explicit gaps

\`\`\`bash
node --test tests/starnet-research-claim-registry.test.mjs
npm run check
npm run security:secrets
npm run security:baseline
\`\`\`

GitHub CI verifies the registry, strict NO_GO claims, review ledger and
Markdown report, alongside all previous chronological, source, risk,
cold-process and Chromium tests. In separate processes it checks record
and claim reproducibility and rejects tampered inputs and fake approval.

Outstanding before *any* real-world research confidence: independently
authenticated publisher archives, point-in-time data rights, actual
corporate-action documentation, external statistical replication by a
known reviewer, and accurate market execution constraints. No such
evidence was obtained in this phase.

**The result is traceable, locally reproducible educational research,
not a verified profitable strategy or live trading permission.**
