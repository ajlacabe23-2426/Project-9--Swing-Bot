# Project 9 — Fixed-rule chronological research and cost-stress audit

**Status:** Draft, research-only software validation. This is not an optimization system, financial recommendation, broker execution result, certified backtest, independent real-world out-of-sample assessment, or release authorization.

## Frozen strategy hypothesis

Use only `P9_DAILY_20H_50SMA_V1`, whose completed-close rule was established before this audit:

- Last completed close strictly above its 50-session simple moving average.
- Last completed close strictly above the previous 20 completed session highs.
- Hypothetical entry: **next** completed session open. Hypothetical exit: close **five completed sessions** after signal. No intraday stop fill or gap behavior is claimed.
- Per-observation model: one independent notional unit, no compounding, entry-cash-outlay returns (existing `P9_CASH_OUTLAY_RETURN_V2`).
- No new thresholds, confidence knobs, strategy selection, parameter tuning or fitting to any part of this dataset.

## Chronological design

- Read a canonical Project 9 daily JSON dataset; no data is downloaded, imported, edited or persisted. `--demo` uses fully engineered fictional bars with an explicit synthetic label.
- Require at least **90 completed bars after the first 49 warmup bars**, with a strict review cutoff no later than declared source-as-of. Insufficient data **fails** rather than reporting an impressive tiny-sample score.
- Fixed, consecutive **50% development / 25% validation / 25% held-out descriptive** bar partitions, after warmup, with integer floors and remaining bars assigned to holdout. Never shuffle dates.
- Each period can use **previous** completed bars as indicator history, but its signal, next-open hypothetical entry and exit close must all fall **inside that same period**. Cross-boundary setups are censored, never carried forward.
- Each phase independently examines the existing frozen signal rule. “Development” is a descriptive name; **no model is fitted**. The held-out phase is merely chronological and has **not** been independently protected from human selection, dataset curation or prior experiment exposure.
- The passive comparison is an **independent periodic five-session exposure control**: use the first eligible completed signal date in each phase and advance five sessions, without consulting the strategy. It is *not* aligned to the strategy's selected signal windows, not a portfolio buy-and-hold NAV, not risk matched, and not an executable benchmark.
- Show the phase boundaries, evaluated completed-close count, actual signal/entry/exit indices and dates, closed observation count, raw unrounded mean cash-outlay return, positive-outcome share and worst per-unit reference. **Zero setups => null**, not a fabricated 0% win rate.

## Precommitted modeled cost grid

| Label | Fee each side | Adverse slippage each side |
| --- | --- | --- |
| ZERO_COST_REFERENCE | 0 bps | 0 bps |
| DEFAULT_10_BPS | 10 bps | 10 bps |
| STRESS_25_BPS | 25 bps | 25 bps |
| STRESS_50_BPS | 50 bps | 50 bps |

Return convention is shared with Project 9's existing daily and paper-forward research: slippage-adjusted next open and future completed close, proportional fee each side, and returns divided by entry cash outlay. Cost changes **must not change signals or windows**. The test checks increasing fees/slippage lowers each populated phase's means. These fixed costs are stress assumptions, not actual historical spreads, taxes, market impact, commissions or guaranteed liquidity.

## Operator commands

Safe synthetic demo on a compliant Node runtime in the checked-out candidate:

```bash
npm run research:time-split -- --demo
```

Read-only optional local JSON review, supplied **only if the data can legally be used**:

```bash
npm run research:time-split -- --as-of YYYY-MM-DD /absolute/path/to/permitted-market.json
```

Both print structured JSON to standard output; they do **not** create or modify data, tickets, StarNet routines or market files. The report records the actual Git commit SHA, input-byte SHA-256, source label, declared provenance and explicit lack of independent source verification. Git SHA identity alone is not proof of a clean working tree or legally licensed data.

To verify:

```bash
node --test tests/chronological-research-audit.test.mjs
npm run check
npm run security:secrets
npm run security:baseline
```

CI additionally runs the real demo CLI with disposable evidence output under `$RUNNER_TEMP`; it checks exact report gates, three partitions and no trading connectivity. Run the existing Chromium and SIGKILL acceptance separately.

## Unresolved release gates

This experiment does **not** establish provider authenticity, exchange-calendar completeness, split/dividend adjustment accuracy, point-in-time historical availability, survivorship neutrality, data rights, model efficacy, capacity, portfolio sizing, capital allocation or profitability. Synthetic fixture means are not useful real-world performance estimates.

Before stronger claims, independently document authorized provenance, completeness, corporate actions, delistings, historical universe selection and legal permissions, then pre-register the study and run an untouched, separately collected real-market evaluation. Keep the existing local paper journal and the production gate at **NO_GO**.

## Integration lineage

Draft stacks on PR #73 (real cold-process SIGKILL recovery), itself on #72 (immutable snapshots and P0 quarantine) → #71 → #70 → #69 → #68 → #67 → #60. No original PR or research functionality has been merged to `main`, and no scheduled workflow or brokerage route is enabled.
