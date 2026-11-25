# StarNet Phase 10 — Three-level independent evidence readiness

**Scope:** Read-only financial-data education and offline software validation.  
**Release verdict:** **NO_GO**, irrespective of a passing fixture test.  
**No broker, exchange, wallet, chain, signed transactions or live trading.**

## What changed

StarNet previously presented separate research and fictional accounting reports.
A green software test might be mistaken for good historical source evidence,
successful predictive evaluation, a reliable Mac installation, or an actual
broker execution. That inference is not justified.

Phase 10 introduces \`src/starnet-evidence-readiness.mjs\` and the read-only
CLI \`scripts/starnet-three-level-evidence.mjs\` that build a
**single three-level evidence packet** by *re-running the underlying
audits*, not trusting caller-reported success fields.

| Level | Evidence actually tested here | Status printed |
|---|---|---|
| 1: Engineering | Recomputed synthetic event history, risk-policy checks, fabricated cash and holdings arithmetic | \`PASS_FICTIONAL_ARITHMETIC_ONLY\` |
| 2: Research | Strict local bar schema, dated file hash, source metadata review, contiguous 50/25/25 historical partitions, bounded windows and four hypothetical cost stresses | \`PARTIAL_DESCRIPTIVE_CHECKS_ONLY\` |
| 3: Operations | Mac/hardware recovery, independently authenticated vendor and broker/custodian artifacts | \`NOT_VERIFIED\` |

The overall gate **always** says \`NO_GO\`, and statuses cannot
auto-promote other levels. Passing a data-quality check cannot imply
third-party source authenticity, future prediction, executable market
prices or a production brokerage integration.

## Research inputs and threat boundary

- \`--demo\` generates fixed-seed, clearly identified **engineered**
  historical OHLCV bars, with v2 provenance explicitly declaring
  corporate actions, survivorship and licensing as *not verified*.
- \`--as-of YYYY-MM-DD permitted-local-history.json\` reads an explicitly
  identified JSON file (regular, <=2.5 MB). It performs **no network
  requests, broker actions or file writes**. There is no account linkage.
- The report hashes the **exact bytes** (not reserialized normalized data)
  of that permitted local file.
- Both modes re-run the independent journal arithmetic audit and the
  existing chronological and market-readiness auditors directly from
  their underlying input. Invalid safety flags, forbidden after-cutoff
  dates, duplicate bars, malformed OHLC, unsupported source kinds, and
  unguarded fictional journals fail closed.
- Claims **inside a source file**, including "INDEPENDENTLY_REVIEWED"
  provenance fields or a persuasive vendor label, are **not independent
  evidence**: the resulting report retains
  \`historicalAuthenticityIndependentlyVerified:false\` and
  \`userOrVendorLabelsCannotRaiseThisStatus:true\`.
- Chronological splits remain descriptive only. The holdout is not a
  real out-of-sample efficacy certification. Cost-stress values are
  hypothetical references, not executable quotes or actual fills.
- Operations remains \`NOT_VERIFIED\` even if engineering tests pass.

## Usage (offline and read-only)

\`\`\`bash
npm run research:evidence -- --demo
npm run research:evidence -- --demo --markdown

npm run research:evidence -- --as-of 2026-11-24 ./permitted-local-history.json
npm run research:evidence -- --as-of 2026-11-24 ./permitted-local-history.json --markdown
\`\`\`

The demo uses a private \`p9-execution-lab-*\` OS temporary directory for
its engineered event journal and removes the directory after reading.
The report can be redirected by an operator to a file, but the CLI itself
never writes report artifacts. It never opens brokerage, wallet or
blockchain connections.

\`\`\`bash
node --test tests/starnet-evidence-readiness.test.mjs
npm run check
npm run security:secrets
npm run security:baseline
\`\`\`

The CI gate runs both JSON and Markdown demo output, requires the exact
three statuses and no-dispatch claims, and refuses \`--live\` arguments.

## Still unverified — cannot be inferred from these tests

1. Trusted independent source provenance, exchange calendar corrections,
   canonical issuer/corporate-action data, point-in-time availability,
   data rights and lawful redistributability.
2. Genuine independent out-of-sample performance or defensible
   statistical confidence. No actionable forecast is established.
3. Bid/ask depth, volume participation, executable market liquidity,
   venue availability, broker statements or authenticated fills.
4. Mac operator workflow, authentic storage power-loss durability,
   independent security assessment of any hypothetical connected service,
   real-money permissions or independent custodian reconciliation.
5. Any real brokerage, real security/crypto purchase, settlement,
   private key signing or transfer.

**Release action:** none. A passing evidence packet is for educational
research and software review only. Production NO_GO remains non-negotiable.
