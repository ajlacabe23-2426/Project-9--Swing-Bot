# StarNet Phase 17 — Offline cost-fragility audit

**Educational only; production NO_GO.** This additive experiment does not alter
the Phase 16 methodology, frozen 50/25/25 historical partitions, paper ledger,
execution interface, broker connection or data provider.

## Run the deterministic classroom exercise

```bash
npm run research:fragility -- --demo
```

For a historical JSON already permitted for local research:

```bash
npm run research:fragility -- --as-of 2026-11-25 ./permitted-history.json
```

The CLI reads bytes and writes JSON to standard output only. It never connects
to an external service, trades, sends alerts or writes to the input dataset.

## What to inspect

- **How many completed hypothetical signal windows exist per period?** One
  holdout observation cannot establish predictive validity.
- **How much does the average per-unit hypothetical result deteriorate when
  zero assumed fees/slippage are replaced by the locked 50-basis-point-per-side
  fee AND adverse slippage stress?** This is an assumed cost scenario, not
  an executable market quote.
- **If one historical observation were removed, how much could the remaining
  stressed mean change?** For one total observation, the leave-one-out result
  is explicitly *unavailable*, rather than zero or a fabricated confidence interval.
- **Did the mean turn from positive under zero costs to nonpositive under higher
  assumed costs?** A sign flip reveals modeled fragility, not observed losses.

The audit independently replays the frozen completed hypothetical windows,
checks consistency with the prior methodology report, never refits a rule,
and preserves all existing source-authenticity and production NO_GO boundaries.

## Verification

```bash
node --test tests/starnet-stress-fragility.test.mjs
npm run check
npm run security:baseline
npm run security:secrets
```

Actual bid-ask spreads, liquidity, corporate actions, point-in-time data,
rights and independently replicated out-of-sample outcomes remain unverified.
No profit or skill claim is supported by this exercise.
