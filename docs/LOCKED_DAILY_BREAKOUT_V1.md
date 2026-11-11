# Project 9 — Locked daily breakout research strategy v1

The strategy remains v1; new report schemas and return accounting are v2. See
[return/window contract v2](RETURN_WINDOW_CONTRACT_V2.md) for cash-outlay denominators,
raw-precision aggregation, actual window tuples and reproducibility manifests.

## Why this strategy

Choose **one** repeatable, inspectable set of conditions before examining outcomes. This is a hypothesis to validate, not an optimized or verified profitable strategy.

### Setup: two checks, once after the daily close

1. The latest **completed** daily closing price is strictly above its 50-session simple moving average.
2. That same close is strictly higher than the highest **high** from the previous 20 completed sessions, *excluding today's bar*.

Both must be true. The rules contain no ambiguous chart-pattern labels, discretionary indicators or "AI confidence" overrides. There is no minimum-volume signal filter in v1; that does **not** remove the need for an independently verified liquidity screen before any real-world use.

### Paper-only observation protocol

- Record a hypothetical setup at the completed signal close.
- Model a hypothetical entry using **next session's open**, not the known signal close.
- Model a hypothetical exit using the completed close **five sessions after the signal**.
- Apply fixed sensitivity-test assumptions of 10 basis points fee and 10 basis points adverse slippage **each side**.
- Do not overlap paper windows for the same symbol. No intraday fills, hard stops, live orders or broker connections are simulated or claimed.

A fixed five-session outcome is a deliberately simple **starting hypothesis**, not an established optimal holding period or risk-management policy. Daily high/low data cannot certify stop/limit fills. The study cannot justify live allocation.

## Repeatable Mac workflow

From your existing `~/Desktop/Project-9-Research` worktree, after this change is merged:

```bash
cd ~/Desktop/Project-9-Research
git pull --ff-only origin main
npm run check
npm run research:daily -- .data/SIM09.json
```

The default command prints one short row per symbol: closing-bar date, the two setup checks, number of **closed retrospective paper outcomes**, percentage positive, and average modeled percentage change. The source name is printed beneath each row.

For multiple *permitted* real-history JSON sources, supply multiple files:

```bash
npm run research:daily -- .data/AAA.json .data/BBB.json
```

Use `--as-of YYYY-MM-DD` to reproduce a historical cutoff and `--json` to obtain the full machine-readable observation and input SHA-256 audit.

```bash
npm run research:daily -- --as-of 2026-02-16 --json .data/SIM09.json
```

Synthetic `SIM09` and `SIM10` are **not stock-market history**. Their outputs demonstrate correct mechanics, not the strategy's predictive value.

## Acceptance criteria before treating it as useful research

- An authorized real daily OHLCV dataset with actual symbols, verified adjustment conventions, and clear date provenance
- Complete-bar availability at each historical decision date, no future information or survivorship contamination
- Separate chronological out-of-sample evaluations and tests in rising, declining and sideways markets
- At least one benchmark and cost-sensitivity analysis; sample counts always displayed
- Data-quality, staleness, licensing, and missing-date failures must not be silently treated as clear signals
- Accessible browser presentation of the same stable strategy ID and observations, with reviewable research provenance

No claim of positive expected return, guaranteed win rate, execution readiness or brokerage connectivity is implied. The original five-factor score remains separate and is **not** the signal used here.
