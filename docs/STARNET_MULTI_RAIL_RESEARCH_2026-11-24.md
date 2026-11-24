# StarNet — two-market-rail research architecture (November 24, 2026)

**Phase:** isolated experimental contract, stacked on draft PR #74. **Production: NO_GO.**
This is architecture and fabricated offline classification, **not** a broker, exchange,
DTCC participant interface, smart-contract integration, transaction signing system,
order-management system, portfolio recommendation, or permission to use any
financial account. No external endpoints, identities, credentials, positions,
wallets, order quantities, market orders, fees, transaction broadcasts, or transfers.

## Why the distinction matters

1. **LISTED_EQUITY** means a conventional listed-share research identity.
   Market-data rights, issuer/corporate actions, exchange session, and custody
   remain separate evidence questions.
2. **TOKENIZED_SECURITY** means a claimed on-chain representation of a security
   or security entitlement. A similar ticker, reference to the same underlying,
   or a blockchain transaction is **not** proof of equivalent legal ownership.
   Issuer/legal form, custody/backing, transfer restrictions, network governance,
   redemption/reconciliation, and data rights require separate human review.
3. **NATIVE_BLOCKCHAIN_ASSET** is not presumed to be a tokenized share.
   This category is deliberately **NOT_IN_SCOPE**.

The model is informed by public descriptions, **not** an assumption that StarNet
can use these services:
- SEC, Statement on Tokenized Securities (January 28, 2026):
  https://www.sec.gov/newsroom/speeches-statements/corp-fin-statement-tokenized-securities-012826-statement-tokenized-securities
- DTCC Tokenization Service public program description:
  https://www.dtcc.com/products-and-services/digital-assets/tokenization/hub

DTCC infrastructure is institution/participant-specific. Nothing in those
public sources establishes that a personal prototype has access or eligibility.

## Present scope and behavior

- `src/starnet-market-rails.mjs` validates an **exact metadata-only** input
  contract with `scope: FICTIONAL_OFFLINE` and `SIM-` identifiers.
- Evidence is only `MISSING` or `DECLARED_UNVERIFIED`; there is intentionally
  no `VERIFIED` or `LIVE` status, even when every declaration is populated.
- A tokenized security must reference a **distinct fictional underlying ID**.
  A cross-rail comparison cannot establish fungibility, backing, ownership
  equivalence, automatic conversion, or netting.
- The code has no I/O, network access, transaction amounts, account details,
  signing keys, wallet connection, broker connection, simulation fills or orders.
- Invalid fields, including account credentials, order side/size and live-mode
  switches, fail closed instead of being accepted as passive metadata.
- `scripts/review-market-rails.mjs --demo` emits an **invented** two-rail
  report to standard output with `productionGate: NO_GO`; it writes nothing.
- `tests/starnet-market-rails.test.mjs` exercises the isolation, no-order
  invariants, schema validation, evidence skepticism and identity separation.

Run the optional local exercise (on a compliant patched Node runtime):

```sh
npm run research:rails -- --demo
node --test tests/starnet-market-rails.test.mjs
```

Do **not** pass production data, an actual order, wallet credentials, private
keys, account IDs, or secrets. The command accepts only `--demo`.

## Planned engineering sequence — no release authorization

**Gate 1 — complete the existing Phase 3 stack.**
Review the full draft dependency chain #60→#67→#68→#69→#70→#71→#72→#73→#74.
Confirm exact-head CI/security/browser acceptance, independent code review,
actual Mac/StarNet runtime acceptance, and genuine recovery behavior. No
independent merge of the stacked drafts.

**Gate 2 — research credibility.**
Independently review authorized point-in-time data, issuer corporate actions,
split/dividend history, delisting/survivorship selection, missing sessions,
tradeability assumptions, market frictions and leakage. Freeze hypotheses
before new untouched observations. Preserve the separation between descriptive
historical observations and simulated fills. No claim of profitability.

**Gate 3 — isolated simulated lifecycle.**
Extend the fictional offline ledger with distinct *hypothetical* lifecycle
states: observed → reviewed → simulated pending → simulated completion or
uncertainty → reconciled. Preserve idempotency, audit evidence and safe
restarts. Never infer a completed fill or blockchain finality solely from
intent creation. No broker or blockchain endpoint.

**Gate 4 — rights and operational review.**
If an eventual external interface is ever proposed, require independent
legal/eligibility, custody, provider terms, security, account authorization,
operational monitoring, human governance, and incident/recovery review first.
This document does not implement or approve that interface. Real securities
and digital asset services may have age and eligibility requirements.

## Non-negotiable invariants

- Research agents may classify evidence and propose questions, but **may not
  execute transactions or grant themselves transaction capabilities**.
- Asset names and shared reference identities never merge legal/custody
  domains. No silent reconciliation of security and token records.
- Missing, stale, contradictory or unauthenticated evidence means manual
  review; declared metadata is not verified evidence.
- No scheduling, live orders, token transfers, signing, account connections,
  deployment, paid resources, branch merges, or mutation of saved .data.
- Every report explicitly says `NO_GO` and zero real orders/broadcasts.

This contract is **additive and isolated**: it does not alter the existing
frozen strategy, market-data provider, paper-ticket rules, runtime security,
user workstation state, or StarNet mission behavior.
