# StarNet/Garnet — execution capability architecture, simulation gate

**Current implementation: fictional in-memory event lifecycle ONLY.** The
business requirement is eventual broker-mediated securities execution and,
where eligible and authorized, a distinct tokenized-security execution
workflow. **Neither exists yet.** Do not interpret a simulated fill,
reconciliation label, market price or token reference as a real fill,
blockchain confirmation, asset custody, ownership transfer or legal clearance.

## Scope of this PR

- Introduce \`src/starnet-simulated-execution-port.mjs\` as a **standalone
  single-process, in-memory execution-oriented port**, not wired to legacy
  workstation state or any external provider.
- Accept only exact, strictly bounded, fictional \`SIM-ORDER-*\` identifiers,
  fictional \`SIM-*\` instruments, \`FICTIONAL_OFFLINE\` scope, LIMIT
  order examples, BUY/SELL direction and bounded integer virtual units/ticks.
  It does not check a real cash balance or real held units.
- Share a finite state machine between two **segregated** rail identities:
  \`LISTED_EQUITY\` and \`TOKENIZED_SECURITY\`. Native blockchain assets
  remain intentionally unsupported rather than assumed interchangeable with
  tokenized securities.
- Require explicit fictional events for acceptance, fill, cancellation,
  rejection and reconciliation. **Nothing auto-fills** because it is
  supposedly marketable; fills are user-supplied fictional test events.
- Support partial fills, overfill rejection, exact identity-preserving retries,
  immutable snapshots and duplicate event refusal across order identities.
- Require final simulated disposition before simulated reconciliation.
  Reconciliation here means only "fictional lifecycle marked complete";
  it does NOT prove cash movement, securities settlement, blockchain
  confirmations, registry updates or external account matching.
- Every output contains \`productionGate: NO_GO\`,
  \`realOrdersCreated: 0\`, \`chainTransactionsBroadcast: 0\`,
  \`externalCalls: 0\`.
- There are **no** credentials, API access, order endpoints, signers, wallets,
  webhooks, schedules, persistence, new runtime dependencies or filesystem
  state changes.
- This must not be merged to main outside the complete stacked review.

## Why this matters for future execution

Financial execution is not merely sending a command. For actual systems,
distinct service responsibilities are necessary:

1. **Research and proposal** — evidence, provenance, data freshness and
   strategy hypothesis, always separate from execution privileges.
2. **Authorization and risk** — verify user eligibility and permissions,
   account authorization, buying power/holdings, session and liquidity
   constraints, defined risk limits, and human review as required.
3. **Order router** — broker/venue-specific interface and securely scoped,
   explicitly authorized account permissions. Live dispatch is deliberately
   **not implemented** in this PR.
4. **Event recorder and reconciliation** — unique client order identity,
   acknowledgement, status changes, partial fills, rejects, cancels,
   ambiguous provider timeouts, server restart and durable ledger
   replay. For on-chain securities also consider independent transaction
   finality, issuer/custodian books, transfer restrictions and legal rights.
5. **Operational controls** — versioned policies, emergency stop,
   monitoring, immutable/auditable evidence, platform eligibility, recovery
   drills, external review and deployment gates.

Public architectural references:
- Alpaca documentation identifies client order IDs and multiple statuses:
  https://docs.alpaca.markets/us/reference/getorderbyclientorderid
- SEC staff statement on tokenized securities (Jan 28, 2026):
  https://www.sec.gov/newsroom/speeches-statements/corp-fin-statement-tokenized-securities-012826-statement-tokenized-securities

These references do not constitute integration, legal permission, brokerage
account availability, approval for automated trading, or any endorsement.

## Runnable offline verification

Use a security-patched Node runtime on the checked-out candidate:

\`\`\`sh
npm run research:execution -- --demo
node --test tests/starnet-simulated-execution-port.test.mjs
npm run check
\`\`\`

The command is **deliberately restricted to** \`--demo\`. It exercises one
fictional listed-equity record through simulated partial/final/reconcile
and one fictional tokenized-security record through simulated partial/cancel.
No file is saved. The test rejects \`--live\` or \`--paper-auto\` flags.

## Known limitations — not hidden by a PASS

- **In-memory only**, and no cross-process idempotency or crash persistence.
- **No actual broker sandbox** or authenticated exchange connector.
- **No account, cash ledger, position, price feed, margin, corporate-action,
  order-notional or fee calculations**, and no real risk authorization.
- **No live blockchain network, wallet, signer, smart contract, token custody,
  transfer, finality, issuer register or legal verification**.
- No guarantees of consistent state if events come from multiple processes;
  state machine tests are not a distributed transaction coordinator.
- No economic outcomes or strategy validation may be inferred from the
  fabricated event stream.

## Next development gates

1. Review and integrate the predecessor Phase 3 research and recovery
   stacks (#60 → #67 → #68 → #69 → #70 → #71 → #72 → #73 → #74 → #75)
   before treating either rail as operational.
2. Add an isolated **durable** fictional journal with restart and duplicate
   replay tests, as an independently reviewed follow-up. Do not retrofit
   existing user workstation state silently.
3. Create independent offline risk, cash/position and event-integrity
   tests for fully fictional capital; do not simulate profitability claims.
4. Independently evaluate whether the intended account, provider, product,
   eligibility, security, and legal conditions permit any future live
   operations. This document does not authorize or implement live trading.

Production remains **NO_GO**.
