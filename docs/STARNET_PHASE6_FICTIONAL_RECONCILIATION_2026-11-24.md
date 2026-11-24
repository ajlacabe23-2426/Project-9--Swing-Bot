# StarNet Phase 6 — independent fictional reconciliation

**Purpose:** independently check simulated order lifecycle accounting before treating the experimental system as internally reliable.

**Exact scope:** invented cash ticks, invented whole units, invented order events, two **distinct** research rails: listed equities and tokenized securities.

**Status:** Research-only, offline, no external transactions. **Production NO_GO.**

## Implemented flow

\`\`\`text
Research fixture
  → Strict fictional intent
  → Fictional risk gate (reserve or reject)
  → Hash-chained, single-writer temp-directory journal
  → Explicit simulated order events (ACK / FILL / CANCEL / REJECT / RECONCILE)
  → Risk-book snapshots
  → NEW: independent read-only arithmetic reconciliation
  → Test-only PASS or fail-closed rejection
\`\`\`

\`src/starnet-fictional-reconciliation-audit.mjs\` separately calculates:

1. Fictional cash total, available cash and reserved cash by iterating the *order event records*, with fictional fills applied at the frozen declared limit price.
2. Simulated held units and pending sell reservations by rail and fictional instrument identity, **never** treating referenced underlying equity as fungible with its tokenized-security research representation.
3. Whether every approved decision matches exactly one simulated execution record, every denied decision has no corresponding order record, and no decision or event identity repeats.
4. Whether counted fills and remaining units agree with the event evidence; cancelled or fully closed fictional orders cannot hold stale reservations.
5. Whether all safety flags clearly deny live execution, accounts, signing, wallets, brokerage connections, external events, authentic fills and independent settlement confirmation.

Any mismatch throws a descriptive **fictional reconciliation refused** error. The function does not repair, reorder, or modify anything and never writes files. A successful result returns \`PASS_FICTIONAL_ARITHMETIC_ONLY\`—**not** a successful financial execution, external brokerage reconciliation, or chain-finality assertion.

## Binding to existing acceptance

\`scripts/accept-fictional-risk-accounting.mjs --demo\` now calls the independent checker against the recovered fictional journal report and fails the acceptance if arithmetic diverges.

CI requires this report to include \`independentlyRecomputedFictionalBalances: true\` and \`authenticExecutionsVerified: false\`. The ordinary Node test suite also supplies hostile altered reports (fake cash, duplicated IDs, changed fills, phantom order, changed rail identity, modified reservations, unsafe production flag), expecting a refusal.

### On a compliant, controlled development checkout

\`\`\`sh
node --test tests/starnet-fictional-reconciliation-audit.test.mjs
npm run accept:fictional-risk -- --demo
npm run check
\`\`\`

The acceptance CLI makes and deletes only a private disposable \`p9-execution-lab-*\` temp folder and refuses \`--live\`.

## Evidence boundaries

- A hash-chain format and journal file reader validate their *own local source*, not an external data feed. The independent arithmetic audit consumes the resulting report and is **not** an independent proof of the original source's authenticity.
- The checker does not obtain external trade confirmations, broker statements, custody records, blockchain finality, price execution, cash transfers or investment returns.
- Events are **fabricated** and do not have independent counterparties or signatures.
- Cash ticks and whole units are **not** real dollars, digital assets or account entitlements.
- No remote account integration, provider API request, order route, wallet/chain signing, deployment or background schedule is introduced.
- Real filesystem power-loss durability, distributed writer races, provider-to-internal ledger reconciliation, legal ownership, independent strategy performance, market-data provenance, and Mac/Workbench acceptance remain **NOT_VERIFIED**.

## Required future review gates

- Genuine multi-process and persistent-storage fault-injection campaigns on disposable fixtures; independent recovery evidence.
- Clear external-source authenticity and licensing review, corporate actions, historical time alignment, realistic research methodology and non-leaking validation.
- Independent security design, identity and user authorization review for any *future* non-fictional operations. No real transaction connector is in scope for this feature.
- Manually observed operator acceptance on the intended Mac/StarNet setup; until actual evidence exists label **NOT_RUN**.

**Merge policy:** exact-head GitHub Verify, security, Node tests, recovery and headless Chromium must pass before integrating this offline research feature into development \`main\`. A green CI is **not** authorization to trade.
