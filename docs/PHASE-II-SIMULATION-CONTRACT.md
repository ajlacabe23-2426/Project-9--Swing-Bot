# Phase II — Offline educational simulation contract (v1)

## Scope and dependency
P0 foundation, based on the owner-supplied StarNet architecture audit and PR #55 candidate 4107a267b8570015f8b14beffdeeca46b5002e71. The Phase II branch remains separate; the same fictional stale-review fix has also been applied to PR #55. Neither PR is approved or merged. All examples are invented, local and educational; no provider, brokerage, signal generation, executable orders, or actual money is part of this contract.

## Accounting domains
- OBSERVATION_REFERENCE: frozen-reference observations, including open, terminal and ambiguous outcomes. Never a cash or inventory transition.
- FILLED_SIMULATION: fictional ledger and marked virtual equity; no observation reference P&L is admitted to this accounting domain.
- RETROSPECTIVE_UNIT_REFERENCE: reserved name for disconnected retrospective exercises. Disabled in v1 until separately defined.

Every new contract record declares its mode, recognized fictional source ID, digest of the visible data prefix, versioned exercise ID, as-of date and completed-bar cursor, currency, precision policy, cost policy and capital basis. Source IDs are SIM-01, SIM09 and SIM10 only. This is an internal identity convention, not authentication; later adapters must enforce actual fixture provenance. All values are fictional USD. The reference policy has no fee or capital-ledger semantics. The virtual ledger policy and monetary quantization are versioned but deferred: v1 defines metadata only, not exact monetary arithmetic or ledger reconstruction.

## Temporal and persistence invariant
Only the visible prefix through the declared cursor may contribute to the record. The read-only evidence adapter now checks exact built-in fixture identity, date/cursor alignment and the visible prefix digest. It deliberately ignores bars past that cursor. A saved scan with matching original seed identity is labeled SEED_IDENTITY_MATCH, not a verification of the saved observation arithmetic. Unbound scans, mismatches and engineered extensions remain unverified until scenario lineage is persisted. Preserve all legacy files without inferring provenance. Separate storage and reset boundaries remain unchanged. No schedules change.

## P0 acceptance
The standalone validator rejects unknown sources, missing or incompatible accounting modes/policies, malformed dates and identities, and unsupported retrospective mode. A homogeneous-domain guard rejects mixed accounting records and mismatched identities/cursors before an adapter combines values. It does not compute NAV. GET /api/simulation-contracts returns a separate local read-only evidence envelope; it does not aggregate values, write files, call a provider or accept user-supplied market input. The envelope includes a per-observation metadata projection for reserved fictional symbols, with explicit accounting mode and conservative opening-prefix status. It never certifies outcome arithmetic or includes amounts. The existing fictional command-center and historical experiment report outputs declare FILLED_SIMULATION, and the existing observation journal report declares OBSERVATION_REFERENCE with an explicit prohibition on virtual ledger aggregation. These are additive labels, not changes to calculations or stored records. Full contract adoption on legacy workstation responses and extended replay lineage remain deferred. Independent review, end-to-end P0 acceptance and P1–P6 remain open.

## Deferred implementation
P1 neutral fixture/indicator extraction, P2 fictional monetary semantics, P3 distinct observation and virtual ledger policies, P4 state validation, P5 offline adapters, P6 end-to-end acceptance. No deployment or new execution behavior.

Focused test: `node --test tests/simulation-contract.test.mjs tests/simulation-evidence.test.mjs`

## P1 fixture extraction
Shared pure fixture generation now lives in `src/synthetic-fixtures.mjs`; `src/synthetic-demo-fixture.mjs` retains the original validation adapter. The original engine and CLI exports remain compatible. Runtime replay and evidence modules import the fixture adapter rather than the CLI. Existing calculations, persistence format and fictional dataset values are unchanged. `tests/synthetic-fixtures.test.mjs` covers prefix consistency, wire shape, known fixture identity and copy isolation. P1 indicator extraction and independent end-to-end verification remain open.
