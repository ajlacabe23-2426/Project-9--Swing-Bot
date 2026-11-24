# StarNet Phase 5 — fictional risk accounting and recovery gates

**Scope:** disconnected stock/tokenized-security *fictional* exercise only.  
**Status:** software candidate. Production **NO_GO**.  
**No real accounts, money, network trading, wallets, transaction signing or blockchains.**

## Why this exists

The previous memory-only execution port accepted fictional LIMIT order intents and events, but had no way to prevent two accepted exercise orders from allocating the same fictional funds or held units. The new policy and replay model supplies an explicit risk decision *before* the fictional order enters the existing execution state machine.

## Canonical offline architecture

1. **Immutable policy first:** A new fictional journal can persist one exact \`project9-fictional-risk-policy-v1\` declaration as its first hash-chained entry. The policy records only invented starting cash ticks, invented holdings identities and a bounded notional ceiling. No account identifiers are accepted.
2. **Risk-gated intent:** \`submit()\` checks the strict existing fictional order schema and then reserves either bounded cash ticks for a BUY or already-held fictional units for a SELL. It does not allow leverage or shorting. An insufficient-money/holding/notional-cap rejection is **persisted** as an auditable decision but never becomes an executable port order.
3. **Synthetic events:** Only explicit fictional ACK/FILL/CANCEL/REJECT/RECONCILE events can change accepted order states. On an invented fill at the fictional LIMIT price, the risk book releases the matching reserve and updates fictional cash/holdings. A cancellation or rejection releases all unfilled reserved amounts. A terminal simulated event is *not* independently proven execution or settlement.
4. **Atomic history:** Policy, approved/denied proposals and simulated events share **one journal hash chain and one atomic file replacement**, not separate cash and order files that could silently diverge. Journal replay reconstructs both the existing port and the risk book and refuses inconsistent history.
5. **Restarts and ambiguity:** Exact retries are idempotent. Failed writes poison the in-process writer, requiring a close/reopen. Explicit test-only error injections immediately **before** or **after** rename check that reopening sees exactly zero or one committed event, then rejects a duplicate. A stale external writer lock is never automatically cleared.
6. **Separate security rails:** A tokenized-security example has distinct instrument and legal reference identity. Token holdings and listed-equity holdings are never netted by ticker or underlying; native blockchain tokens remain unsupported.

**Toy accounting conventions:** 1 price tick and 1 cash tick are merely unitless invented numbers. Fills occur only when supplied as fabricated test events, always at the fictional limit price. There is *no* live quote, spread, price improvement, volatility, corporate action, fee, tax, buying-power, liquidity, or profit model. Initial holdings are artificial and cannot be imported from broker records. Do not use this to estimate investment outcomes.

## Exact commands on a compliant Node environment

\`\`\`sh
npm run check
npm run security:secrets
npm run security:baseline
node --test tests/starnet-fictional-risk-book.test.mjs
npm run accept:fictional-execution -- --demo
npm run accept:fictional-risk -- --demo
npm run accept:cold-recovery
\`\`\`

The risk acceptance CLI creates and deletes only its own private \`p9-execution-lab-*\` OS-temp directory. It refuses any command argument other than \`--demo\`. The existing StarNet workstation \`.data\`, portfolio, watchlist, provider credentials and active app state remain untouched.

## Verification gates

| Gate | Evidence | Claim boundary |
| --- | --- | --- |
| Fictional cash reserve / reject | Pure risk unit tests and risk CLI | No overspend within policy and cooperating writer |
| Inventory reserve / reject | Separate equity vs tokenized holding tests | No fictional shorting or cross-rail netting |
| Partial fills / cancellations | Exact event replay tests | Invented exchange events only |
| Same ID exact replay | Byte-identical journal retry checks | Not a multi-host exactly-once guarantee |
| Interrupted write before rename | Injection with throw after temporary file fsync | Old journal survives; no actual disk failure |
| Interrupted write after rename | Injection with throw before directory fsync | Reopen recognizes completed rename; NOT power-loss proof |
| Real process termination | Existing separate-PID SIGKILL acceptance | Not sudden power failure or distributed-lock certification |
| Hash chain and corrupt data | Existing journal schema/integrity tests | No signed external provenance |
| Independent code/security | Exact-head CI + Security Monitor | PASS only when corresponding runs succeed |
| Real Mac/StarNet acceptance | **NOT_RUN** | Cannot be certified from cloud GitHub |
| Historical market-data authenticity | **NOT_RUN** | No real provider rights, completeness or time-split proof |
| Actual brokerage/chain execution | **NOT IMPLEMENTED** | Production NO_GO |

## Owner-controlled Mac operator acceptance (NOT RUN)

When a controlled Mac/Workbench session is available:

1. Confirm a clean, intended **exact main SHA** through \`git rev-parse HEAD\` and \`git status --short\`; do not run unknown branches.
2. Verify \`node --version\`, the executable from \`command -v node\`, and the repository's supported patched Node version range. Workbench must resolve the *same* trusted runtime.
3. On a disposable copy/worktree (no existing .data copied), run \`npm run security:secrets\`, \`npm run security:baseline\`, \`npm run check\` and the two explicit fictional acceptance CLIs. Record exit codes and report schema/NO_GO.
4. Verify real local account credentials are not used or printed. No browser/session, API integration, blockchain RPC, client order ID, real order route or wallet should be opened as part of this acceptance.
5. Separately audit market-data source licensing, historical time identity, delistings, split/dividend handling, corporate actions, reference limits and time-split methodology before claiming data or forecasting acceptance. Synthetic success does not establish these.
6. Preserve evidence of unexpected errors; **never** delete unexplained active lock files, alter the existing workstation, enable \`--paper-auto\`, or run real brokerage/chain orders.

The assistant cannot truthfully mark any Mac/Workbench step PASS without its actual observed output.

## Remaining requirements

- Explicit test-only capital/position policies are now present. There is **no authorization-aware real account risk engine**.
- Fault injections verify deterministic rename ambiguity, not actual out-of-space filesystem behavior, hardware failure, or interrupted directory sync on every filesystem.
- Strong external reconciliation, independent market data, custody/legal permissions, audit logging, provider sandbox, eligibility and account authorization remain unimplemented or independently unverified.
- Real-money brokerage and digital-asset execution are **not enabled** by a software merge.

## Release policy

Only after the exact PR-head full CI and security checks pass should this **research-only** change be considered for development \`main\`. An accepted commit does *not* authorize production deployment, real trading, token transfer, account connection, or automated order dispatch.
