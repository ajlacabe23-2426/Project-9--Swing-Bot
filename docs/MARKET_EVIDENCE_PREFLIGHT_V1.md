# Issue #43 — Market evidence sidecar preflight v1

This is a **read-only, fail-closed starting package** for historical-data evidence. It deliberately **does not complete Issue #43**, authenticate any provider, approve rights, or change scanner, alert, paper-ledger, writer, or broker behavior.

## Usage

```bash
node scripts/audit-market-evidence.mjs 2026-06-30T23:59:59.000Z .data/SYMBOL.json evidence/SYMBOL.sidecar.json
```

Use `-` instead of the sidecar file for the missing-evidence negative case. The output is a deterministic JSON report. The command exits nonzero if evidence is missing/quarantined. A zero-exit `EVIDENCE_REVIEW_PENDING` report **still is not acceptance**.

## Expected sidecar schema

`project9-market-evidence-sidecar-v1` records:
- exact raw dataset SHA-256 (raw JSON bytes; whitespace changes invalidate it);
- stable security identifier, symbol, MIC venue, currency, share units;
- provider/product, hash-only request and response identifiers, parser and transform versions;
- canonical UTC acquired/available/known timestamps and explicit decision timestamp;
- dated private-research rights document identity;
- different-provider reconciliation report identity and discrepancy resolution declaration;
- adjustment methodology and corporate-action ledger document digest;
- historical universe membership digest and known-at timestamp;
- reviewer and reason code.

These are **declarations and immutable-byte identifiers**, not independent evidence that the referenced external materials are true. Do not include credentials, bearer tokens, signed URLs, customer records or licensed vendor data in the repository. Keep actual source files and records private and permissioned; version only the non-sensitive contract and synthetic tests.

## Status boundaries

- `QUARANTINED`: required identity/timeline/rights/reconciliation/action/universe evidence is missing, inconsistent, or source is declared synthetic.
- `RETROSPECTIVE_UNVERIFIED_PIT`: acquired after the proposed decision date; historical archive proof is still absent.
- `EVIDENCE_REVIEW_PENDING`: self-declared records pass syntax/identity checks, but **researchAccepted=false** and **alertEligible=false** regardless.

The code never produces `RESEARCH_ACCEPTED` or `ALERT_ELIGIBLE`. Promotion requires independent documentary validation and separate human decision. Nothing in this package changes current market-data quality flags, the existing refusal to overwrite revised history, or the lack of live trading.

## Remaining Issue #43 requirements

Independent evidence-based sample reconciliation (earliest/latest/interior/action boundaries), raw/adjusted price bases, economic split/reverse-split/dividend fixtures, full PIT vintage selector, versioned membership/rename/delist coverage, immutable snapshot chain with crash/concurrency safety, scope-specific rights for storage/derived alerts/redistribution, and replay acceptance. All remain **open**.

Issue #44 will separately validate exchange calendars, sessions, provider pagination, data finality and freshness.
