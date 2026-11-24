# StarNet Phase 8 — fictional quarantine review and emergency stop

**Scope:** fabricated local exercise messages only.  
**Production:** **NO_GO**.  
**Authority:** zero real brokerage orders, account connections, cryptocurrency or blockchain transfers.

## Why this exists

The existing offline message emulator quarantines late/out-of-order/impossible
messages but did not have a persistent review disposition or a latched way to
prevent further simulated execution when something looks wrong. This phase
makes **human-style review decisions** and a **one-way exercise emergency
stop** auditable in the same hash-chained journal as the fictional orders,
risk policy, message receipts and balances.

## Persistent review contract

A strict \`project9-fictional-quarantine-review-v1\` object declares a
fictional \`SIM-REVIEW-*\` ID, an existing \`SIM-MSG-*\` ID,
\`SIM-OPERATOR-LAB\`, and exactly one action:

- **DISMISS:** persists a \`DISMISSED_NO_EVENT\` decision for any
  quarantined fictional message, with no order, balance or event mutation.
- **RELEASE:** only permitted for a message originally held for a
  **future sequence**, after intervening fabricated events have made its
  sequence currently valid. The strict emulator must revalidate the original
  identity, instrument rail, transition and risk policy. A valid release
  adds one fabricated event; a failed recheck aborts the entire journal write.
  Stale, wrong-rail, denied and impossible messages cannot be released.

A decision is stored as an atomic \`REVIEW\` journal entry alongside any
resulting fictional event. Reopening reconstructs the decision and verifies
its outcome matches local event history. A duplicate review ID with an
identical payload is a zero-write retry; conflicting IDs and repeated reviews
of the same message fail closed.

**The original message receipt remains quarantined in history**, even if a
later explicit review accepted a fictional event. The review record is the
separate evidence of what happened next. No retroactive rewriting.

## Emergency stop contract

A \`project9-fictional-emergency-stop-v1\` declaration contains a strict
\`SIM-STOP-*\` ID, one of two fabricated reasons, and \`SIM-OPERATOR-LAB\`.
The \`STOP\` journal entry latches the state \`STOPPED_LATCHED\`.

- Stops new fictional order proposals, synthetic events, message delivery,
  quarantine review and release. A restart **does not reset the latch**.
- Exact repeats of the same STOP return the same state without another write.
  Changing the stop ID or attempting resume is refused.
- **Does not auto-cancel existing fictional orders**, change held balances,
  communicate with exchanges or close a real position.
- The only way to start another fabricated exercise is to create a **new,
  separately initialized, disposable test journal**. This is not a
  production emergency-stop architecture or real account protection.

Both controls require the normal private \`p9-execution-lab-*\` directory,
cooperative single-writer lock, atomic replacement and hash-chain
verification. All ordinary reports keep the production gate **NO_GO**.

## Cross-process and interrupted-write verification

\`tests/starnet-fictional-operator-controls.test.mjs\` covers:

1. A future message held before ACK and explicitly released after ACK;
   exactly one fictional fill, cash and reserved amounts independently
   reconciled, retry byte identity preserved.
2. A wrong-rail message permanently dismissed, no invented fill.
3. Emergency stop blocking new submissions, events, messages and reviews
   across close/reopen, with no automatic fictional cancellation.
4. Strict rejection of unexpected credential/account/real-money fields.
5. Fault injection immediately before/after atomic rename of a review
   entry, requiring a new instance and confirming that exactly zero or one
   release survived.
6. **Real separate-process SIGKILL** after persisting a STOP; lock not
   silently stolen; only the owner of an expendable test fixture clears
   the known-stale lock after observing child termination. Reopen confirms
   the stop remains latched.
7. A forged review result with a recomputed local hash is refused at
   replay when the outcome disagrees with the fabricated event history.

### Verification commands

\`\`\`bash
node --test tests/starnet-fictional-operator-controls.test.mjs
npm run accept:fictional-controls -- --demo
npm run check
npm run security:secrets
npm run security:baseline
\`\`\`

The acceptance CLI uses **only** a disposable private OS-temp folder and
explicitly refuses \`--live\`, broker or wallet settings. It verifies
same-process reopen; the **separate-process** SIGKILL case is in the
Node test suite. These are not evidence of hardware power-loss durability
or distributed exactly-once operation.

## Remaining NO_GO reasons

- Real market-price authenticity and time-aligned research efficacy
  are not established by synthetic fixtures.
- There is no external brokerage sandbox, authenticated execution report,
  custodian/issuer statement, wallet, RPC endpoint, signing authority or
  genuine settlement reconciliation.
- A cooperative local writer and local hash chain do not establish
  distributed exclusivity or unforgeable signed audit provenance.
- Mac/StarNet operator acceptance, real filesystem failure campaigns,
  independent security review of a future connected architecture, and
  user/account authorization are **NOT_RUN / NOT_VERIFIED**.
- No control in this phase may send, route or cause a real-world trade.

**Development merge:** requires exact-head GitHub Verify and Security
Monitor success, including existing Phase 3–7 tests and headless
Chromium. A passing build is still **offline synthetic research only**.
