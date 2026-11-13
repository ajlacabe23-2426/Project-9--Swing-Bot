# Project 9 — Historical paper-forward outcome audit

New output is schema v2: percentage-return aliases now use entry cash outlay
including entry fees. The former entry-reference basis remains separately named.
See [return/window contract v2](RETURN_WINDOW_CONTRACT_V2.md); archived v1 evidence
is not rewritten and different strategy windows must not be conflated.

This adds a research-only analysis that evaluates the existing completed-bar swing scanner at historical dates, then observes later prices in strictly non-overlapping windows. It **does not place trades**.

## Mac command

From the latest Project 9 repository, with a permitted, local JSON market dataset:

```bash
npm run research:paper-forward -- --as-of 2026-11-04   --hold-bars 5 --fee-bps 10 --slippage-bps 10   .data/AAPL.json
```

The date must be chosen explicitly. Output reports the SHA-256 digest of every file, any setup detected at each earlier completed bar, the next session's hypothetical opening reference, the exit close after five completed sessions, and cost-adjusted percentage movement. Signal classification never uses subsequent outcomes. A symbol's research windows never overlap.

- Entries/exits are *reference prices*, not executable market prices, and there is no broker or order route.
- Both entry and exit use declared adverse slippage and fees; these assumptions are not validated against actual fills.
- No setups results in a null outcome rate; no fabricated results.
- A single historically visible dataset does not establish independent out-of-sample performance. Synthetic data proves only the software workflow.
- Use only datasets you are permitted to process. Provider provenance, corporate actions, symbol histories and survivorship need independent review before relying on any report.
- Daily data cannot establish intraday path, stop-fill feasibility or exchange liquidity.

## Verification

```bash
npm run check
node --test tests/paper-forward-audit.test.mjs
```

This report complements the existing read-only market scanner and paper workstation. It does not resolve the unmerged market-data cache PR #28, real-time coverage, price licensing, or live brokerage readiness.
