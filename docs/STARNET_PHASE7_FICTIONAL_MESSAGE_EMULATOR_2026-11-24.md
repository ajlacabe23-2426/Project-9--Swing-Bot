# StarNet Phase 7 — disconnected fictional execution-message emulator

**Date:** November 24, 2026  
**Status:** Offline-only development candidate; production **NO_GO**.

## Problem this solves

Phases 4–6 can persist fabricated order events, enforce invented
cash/holdings limits, and cross-check the arithmetic. That does not yet
exercise what happens when a *message* is duplicated, delayed, arrives
out of order, conflicts with an old ID, or describes an impossible
execution transition. This phase gives such messages an explicit,
durable, falsifiable **fictional receipt** rather than automatically
treating every inbound event as a fill.

## Strict system boundaries

- Accepted message source is **only** \`ENGINEERED_LOCAL_FIXTURE\`;
  the scope is **only** \`FICTIONAL_OFFLINE\`. Identifiers must
  be \`SIM-MSG-*\`, \`SIM-ORDER-*\` and fictional rail identifiers.
- Message fields are exact: schema, scope, source, messageId, intentId,
  declaredRail, sequence, kind and filledUnits. Extra credentials,
  provider IDs, account numbers, transaction hashes, RPC nodes or
  signing material are **rejected**.
- Exactly two *nonfungible research categories* exist:
  \`LISTED_EQUITY\` and \`TOKENIZED_SECURITY\`. The second does not
  establish ownership, redemption, legal title or real blockchain activity.
  Native blockchain assets remain out of scope.
- Only an existing **risk-policy-backed** synthetic journal can receive
  these messages. Older fictional journals without a policy cannot
  silently become execution-message workstations.
- No network, clock, service, scheduler, account, broker API, wallet,
  private keys, chain RPC, payment, trade routing or real transfers.
  The source never authorizes itself for execution.

## Durable state machine

The existing \`openFictionalExecutionJournal()\` now exposes
\`receiveFictionalMessage(fabricatedMessage)\`.

For a new, strictly validated fictional message, the single writer
reconstructs the current policy, order, event and receipt state from
the hash-chained journal and evaluates the following gates:

1. **Identity**: a repeated message ID with an identical payload returns
   its previous receipt with \`redelivery: EXACT_RETRY_NO_WRITE\`.
   The file bytes, ledger and event counts do not change. Same ID with
   different fields fails closed.
2. **Order/rail**: unknown or denied order, or mismatched instrument
   rail, receives \`QUARANTINED_REQUIRES_REVIEW\`; no fake fill is created.
3. **Sequence**: each message declares a *fictional per-order sequence*.
   The only applicable sequence is \`record.eventCount + 1\`.
   Missing earlier messages are held with \`FUTURE_SEQUENCE_HELD_NOT_AUTO_REPLAYED\`.
   Already-passed sequences are held as stale. Held messages do not
   automatically replay when other messages arrive; deliberate new
   synthetic input and review is necessary.
4. **Event identity**: simulated event ID is deterministically derived
   from the fixture message ID, never accepted from the message body.
   If it is already claimed by a direct event, the message is
   quarantined rather than quietly treated as a valid duplicate.
5. **Transition and risk**: the pre-existing port decides whether the
   fictional ACK, FILL, CANCEL, REJECT or RECONCILE transition is valid.
   Invalid transitions, overfills, late messages and impossible
   rejections are quarantined; if independent accounting rejects the
   proposed update, the journal operation **aborts entirely**.
6. **One atomic receipt/event**: the hash chain writes one
   \`MESSAGE\` entry containing the fabricated input and its
   \`SIMULATED_APPLIED\` or \`QUARANTINED_REQUIRES_REVIEW\` decision.
   Only an applied message modifies the fictional state machine and
   fictional ledger. Reopening recomputes each receipt and refuses
   a mismatch, even if its hash chain was recomputed after alteration.

The original direct, synthetic \`EVENT\` entries remain available for
existing non-message research tests; they are not a broker interface.
The replay engine protects against derived-event-ID collisions across
both entry types.

**Safety claim boundary:** A \`SIMULATED_APPLIED\` receipt is evidence
only that local fabricated input updated local fabricated accounting.
It is not a broker acknowledgment, a trade, settlement, a signed
record, blockchain finality, or proof of actual holdings.

## Acceptance coverage

\`\`\`bash
node --test tests/starnet-fictional-message-emulator.test.mjs
npm run accept:fictional-messages -- --demo
npm run check
npm run security:secrets
npm run security:baseline
\`\`\`

The executable acceptance:
- Uses only a private, disposable \`p9-execution-lab-*\` OS temp folder.
- Intentionally injects an out-of-order fill *before* its fictional ACK.
- Checks exact duplicate acknowledgments leave persisted bytes unchanged.
- Checks stale and impossible transitions are quarantined.
- Tests a two-rail, risk-controlled fictitious cancellation and partial fill.
- Closes and reopens within the **same process** and revalidates the
  resulting independent arithmetic audit.
- Returns \`productionGate: NO_GO\`, with 0 actual orders, 0 chain
  transactions and 0 external calls.
- Rejects \`--live\` and all arguments other than \`--demo\`.

The test suite additionally uses fault injection just before and just
after atomic rename, checking that ambiguous write outcomes require
a fresh journal instance and replay exactly zero or one accepted event.
Other tests ensure an independently recomputed hash does not disguise a
forged fictional receipt disposition.

## Gaps explicitly NOT cleared

1. No authentic inbound broker message, external sandbox or integration.
   A simulator cannot independently certify external execution behavior.
2. No authentic stock price, order book, liquidity, fee/slippage or strategy
   execution-quality estimate.
3. No externally observed token issuer, legal ownership, custodian,
   transfer restrictions or chain finality.
4. No cross-host idempotency, network partition handling, distributed
   ordering or tested disk power-loss durability.
5. No deployment, background schedule, Mac Workbench operator acceptance,
   real-money authorization or account security review.
6. A hash chain catches malformed/corrupted local records; without a
   separately trusted signature or retained anchor it does not prevent
   an actor with file access from rewriting an entire local history.

**Next useful offline development:** fixture-driven adversarial
message sequences across separate process runs, persistent
quarantine-review decisions with explicit synthetic operator evidence,
and a locally verified pause/kill-switch policy. These are simulation
and review controls only, not a pathway to real order dispatch.

**Merge policy:** full exact-head verification and Security monitor must
pass; code merge into development \`main\` never changes production NO_GO.
