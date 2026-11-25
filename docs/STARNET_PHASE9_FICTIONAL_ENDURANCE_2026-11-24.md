# StarNet Phase 9 — multi-process fictional endurance and replay

**Date:** November 24, 2026  
**Scope:** disconnected, invented market-fixture exercises only.  
**Production:** **NO_GO**.

## Goal and design

Phase 8 added strict quarantine review and a one-way stop latch.
Phase 9 provides a repeatable *longer-running reliability acceptance*
that spans multiple entirely separate Node processes and a controlled
child-process SIGKILL, rather than simply testing a same-process
\`close()\`/\`open()\`.

The study has **no genuine exchange messages**, actual accounts, wallets,
blockchain interaction, real prices, trading venue or transfer mechanism.
Prices are invented whole-number ticks. The stock and tokenized-security
rails are independent fictional categories, not fungible positions.

## Test sequence

The runner creates one private \`p9-execution-lab-*\` OS temporary directory.
Every child must pass the existing strict journal directory and ownership
checks. Only the runner's own temporary files are modified.

1. **New child — initialize** a synthetic policy with 100,000 invented
   cash ticks, 30 fictional listed units and 6 fictional token-security
   units. Submit twelve eight-unit fictional BUY intents, six four-unit
   equity SELL intents, and three two-unit token-security SELL intents.
   Four additional proposals are denied for insufficient imaginary cash,
   per-order cap or already-reserved holdings. This creates **25 recorded
   decisions**, including **21 approved and 4 rejected**.
2. **Separate child — read-only verification** recomputes the independent
   accounting audit and compares journal head hash, raw file SHA-256,
   simulated cash, holdings, decision count and receipt count with the
   prior child. No incidental writes are permitted.
3. **Separate child — scripted fictional message scenario** quarantines
   an early fill, receives its matching fictional ACK, then explicitly
   reviews/releases that now-in-sequence *fictional* fill. The other
   buy examples deliberately use partial fills and cancellations.
   Exact duplicate message retries must not append a second event.
4. **Separate child — verification** checks that the fabricated cash
   reduced by 12,000 ticks and all buy-side reservations were released,
   while sell-side inventory reservations persist.
5. **Separate idle child — process interruption:** opens the test journal,
   reports \`READY\`, and is deliberately terminated with \`SIGKILL\`.
   A concurrent writer is refused by the intact lock. The runner
   verifies the lock belonged to **its own now-dead child PID** and
   only then removes that *known disposable fixture lock*. It never
   steals active workstation locks.
6. **Separate child — recovery** replays the same disk and head hashes
   and recomputes balances and messages. No fictional event is replayed
   twice and no report fields may drift.
7. **Separate child — synthetic sale events and stop**: fills the
   invented sell-side orders, verifies different market rail holdings
   and balances, then writes an irreversible **fictional STOP**.
8. **Two independent read-only processes after STOP** compare exact
   journal bytes, head hash, invented balance and audit receipt counts.
   No hidden auto-resume or cancellation.

Expected final engineered fixture state: **25 decisions, 48 synthetic
events, 48 message receipts, one explicit review, 76 journal entries,
118,000 fictional cash ticks, 18 listed-equity units, zero token-security
units, and \`STOPPED_LATCHED\`**. These are test invariants, **not**
market performance statistics or trade recommendations.

## Reproduction

\`\`\`bash
node --test tests/starnet-fictional-endurance.test.mjs
npm run accept:fictional-endurance -- --demo
npm run check
npm run security:secrets
npm run security:baseline
\`\`\`

The only public acceptance argument is \`--demo\`. The internal worker
accepts fixture stage identifiers and a private disposable lab path,
never an account ID or provider URL.

All acceptance output is a JSON report with:

- \`softwareGate: PASS\` only when the explicit test invariants hold.
- \`productionGate: NO_GO\` always.
- Child termination and owner-verified lock evidence.
- File checksum and head hash from repeated restarts.
- Truthful statement that authentic broker executions were **not observed**,
  real orders and blockchain broadcasts were **zero**, and Mac acceptance
  remains **NOT_RUN**.

## Claims that this cannot establish

- No real broker order routing, authenticated fills, independent settlement,
  historical market data quality, legal custody, investor suitability,
  token conversion or crypto transactions are exercised.
- SIGKILL of an idle process is **not** a disk power-loss durability test,
  a storage-controller failure, or a network partition test.
- A local hash/checksum comparison proves only *consistency across tested
  reopens*, not that the source has a trusted external signature or that
  an attacker could not replace all local history.
- Test-only manual stale-lock cleanup must never be generalized to a live
  service or the user's actual workstation files.
- A green CI does not certify deployment, local Mac acceptance, independent
  external research correctness, production security, or readiness for
  actual trading.

**Integration policy:** exact-head GitHub Verify, Security Monitor,
existing StarNet phases and headless Chromium must all pass before
this research-only test enhancement merges into development \`main\`.
