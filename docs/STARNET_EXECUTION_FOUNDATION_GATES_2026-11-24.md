# StarNet execution foundation — locked architecture and acceptance contract

**Date:** November 24, 2026  
**Repository area:** Project 9  
**Status:** Research + fictional simulation only; **PRODUCTION NO_GO**

## Architecture boundaries

**Research** receives completed-session observations and provenance; never receives broker or wallet execution authority.

**Proposal** preserves a deterministic, reviewable reference, mode, timestamp, dataset hash and a separate instrument identity for listed equities versus tokenized securities. No shared ticker is proof of the same legal rights or custody.

**Independent policy gate (not yet implemented)** will eventually evaluate freshness, account authorization and eligibility, available capital/holdings, trading hours, restrictions, quantity/notional constraints and risk caps *before* any external execution. AI proposals do not authorize themselves.

**Execution protocol** is a strictly separate domain. This PR only implements an offline state-machine journal and synthetic order-event replays. A future externally connected adapter, if ever authorized, must have explicit permissions, provider acknowledgment, ambiguity-handling and independent integration review. **No external execution adapter is implemented or approved here.**

**Reconciliation** must distinguish local intent, acknowledgment, partial events, cancellation, completed execution, provider statements and—where applicable—on-chain confirmations and custodian/issuer rights. Fictional `SIMULATED_RECONCILED` means *only* that an invented event sequence reached a local terminal exercise state.

## Current executable controls

- `src/starnet-simulated-execution-port.mjs`: pre-existing memory-only fictional order state machine; rejects real orders and credential-bearing fields.
- `src/starnet-fictional-execution-journal.mjs`: new isolated journal that replays existing fictional intents/events, checks a SHA-256 hash chain, uses a cooperative exclusive writer lock, and persists a complete state snapshot through a temporary file + atomic rename with file/parent sync.
- Allowed storage: **an explicitly selected private `p9-execution-lab-*` folder directly under the operating-system temporary directory**. The journal refuses active `.data` paths, alternate directories, symlinks as directory targets and group/world-readable lab directories.
- The writer refuses to steal existing locks. In a disposable *test fixture only*, operators may verify the original process has exited, preserve files, inspect evidence, then clear a stale lock before opening the journal again. The application itself never clears an unexplained lock.
- Duplicate order intents and event IDs are rejected or acknowledged idempotently without appending new entries. Conflicting retries, cross-order event ID reuse, overfills and invalid state transitions fail closed.
- Corrupt JSON, invalid schema, changed hash, duplicate journal log records, unsafe file types, oversize input or an unknown journal sequence prevents startup, rather than overwriting data.
- Every reconstructed record is unconnected, fictional and retains `productionGate: NO_GO`; no broker, RPC, wallet, signer, investment account or chain transaction exists.

## Real verification commands

On supported patched Node on a controlled checkout:

```bash
node --test tests/starnet-fictional-execution-journal.test.mjs
npm run accept:fictional-execution -- --demo
npm run check
npm run security:secrets
npm run security:baseline
```

The CLI creates its own disposable OS-temp fixture, appends fictional equity and token events, closes, opens again, checks exact report equality and byte identity on duplicate retries, then cleans up. It accepts **only** `--demo`; `--live`, `--paper-auto`, credential and broker flags are intentionally unsupported.

The test suite also checks two-rail separation, corruption refusal, single-writer contention, complete file identity after invalid commands and a genuine child `SIGKILL`. SIGKILL is **not** evidence of sudden power-loss durability, disk corruption safety, or network-filesystem coordination.

## Acceptance matrix

| Control | CI proof | Distinction |
| --- | --- | --- |
| Journal content replay | Unit + CLI | Exact local fictional replay only |
| Duplicate retries | Unit + CLI | One cooperating writer; no distributed exactly-once guarantee |
| SIGKILL stale-lock refusal | Real child-process test | Manual test-fixture cleanup after confirming child exit |
| Hash-chain integrity | Negative mutation test | Detects accidental changes; not signed audit provenance |
| Atomic replacement | Code + replay tests | Not a verified power-loss / fsync durability campaign |
| Stock/token identity segregation | Unit + CLI | Does not verify legal ownership, custody or fungibility |
| External orders/wallet transfers | Denied by API scope | Never supported by this branch |
| Mac/StarNet operator acceptance | NOT_RUN | Must be conducted separately |
| Independent market-data efficacy and license | NOT_RUN | Cannot infer trading performance |
| Production trading and deployment | NO_GO | No authorization implied by code merge |

## Next gated phases

1. **Fictional risk/accounting contract**: fixed non-real balances and holdings, independent notional/unit bounds, no double-spending or shorting, explicit authorization states and auditable denial reasons. Must not consume brokerage account balances.
2. **Crash-consistent state and evidence**: separate test-only interrupted-write fault injection, torn file / permissions tests, race detection, recovery provenance, persistence of each result and re-run of full CI on the exact branch head.
3. **Market evidence quality**: point-in-time source verification, corporate actions, delistings, provider rights, cost assumptions, realistic execution restrictions and non-leaking holdout methodology.
4. **Operational/authorization review**: user eligibility, applicable laws, provider terms, security, segregation of duties, account authorization and human controls. No credentials are requested, connected or stored by this build.
5. **Dedicated external interface project**: only after all preceding controls and separate explicit authority, with integration verification. This phase remains **unimplemented** and has no permission to execute transactions.

## Merge policy

Only a green exact-head Node, security, StarNet, separate journal acceptance and Chromium CI can qualify this research-only module for inclusion into development `main`. A green CI does **not** approve real trading or deployment. No code paths in this module may be used to transmit external orders.
