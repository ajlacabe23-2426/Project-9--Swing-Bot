# StarNet Phase 16 — Research-methodology learning and review

**Purpose:** Learn how to question a seemingly impressive backtest result without optimizing a fictional strategy or claiming real-world predictive reliability.

**Data:** Explicitly engineered classroom fixtures, or a user-supplied permitted local historical JSON. No data download, network request, account access, wallet, broker or live order. **Production NO_GO.**

## Start the hands-on lesson

From the existing StarNet project directory:

\`\`\`bash
git switch main
git pull --ff-only origin main
node scripts/starnet-learn-methodology.mjs --demo --markdown
\`\`\`

The Markdown report explains exactly what should be questioned. The JSON counterpart exposes counts and raw input SHA-256 for auditability:

\`\`\`bash
node scripts/starnet-learn-methodology.mjs --demo
\`\`\`

Optional data that you are already permitted to use:

\`\`\`bash
node scripts/starnet-learn-methodology.mjs --as-of 2026-11-25 ./permitted-history.json --markdown
\`\`\`

The CLI reads bounded local files and writes nothing. It refuses \`--live\`, broker/account flags, invalid dates, malformed records and observations after the stated cutoff. The original file remains unchanged.

## Seven things to watch for, and *why*

| Warning sign | What to inspect | What you should NOT conclude |
|---|---|---|
| **Very few hypothetical outcomes** | Number of strategy windows **per phase**, especially holdout; demo has **one** | One positive outcome proves the system works |
| **Look-ahead or hindsight** | Is every trend/noise descriptor built using only bars strictly **before** its signal? Are entry/exit times within their partition? | A correct chronological split establishes historical point-in-time availability |
| **Effect of cost assumptions** | Compare the **same fixed windows** under zero-cost vs predefined higher hypothetical fees/slippage; verify larger costs worsen the result | These assumptions are actual executable quotes or guaranteed fills |
| **Condition dependence** | Count observations after previously rising, falling and mixed 10-close periods; compare high- vs low-noise context counts | A retrospective category based on 1–2 samples proves the method works in that market regime |
| **Data quality** | Abnormal volume, long calendar gaps, price jumps, adjustment method, source identity and unverified corporate actions | A suspicious bar is definitely wrong, or the provider's claimed provenance is independently authenticated |
| **Misleading benchmarks** | The periodic baseline uses different dates/exposure than the scanner signals | A larger mean compared to a different reference establishes superior performance |
| **Dependence and repeated testing** | Adjacent observations may share market conditions; repeated tweaks can select lucky patterns | More backtests automatically create independent evidence |

### How the prior-context classifier works

At hypothetical signal index \`i\`, it examines the **ten daily close-to-close changes ending at index \`i-1\`**, not the signal bar at \`i\`, the imagined next open \`i+1\`, or the exit \`i+5\`.

The context categories are **educational labels**, not authenticated market regimes. They use frozen demonstration thresholds:

- Prior 10-close change above +2%: \`PRIOR_RISING\`
- Below −2%: \`PRIOR_FALLING\`
- Otherwise: \`PRIOR_MIXED\`
- Prior ten mean absolute daily changes above 1.5%: \`PRIOR_HIGH_NOISE\`; otherwise \`PRIOR_LOW_NOISE\`

**These thresholds are not empirically justified or tuned.** They are fixed to help a learner observe whether a small set of fictional signals appears in just one type of preceding environment. They must never be presented as market forecasts, investment recommendations, or a reason to execute an order.

### What the simulated cost comparison really means

Each phase's original frozen strategy windows are recomputed using:

1. Zero hypothetical fees and slippage.
2. The original \`DEFAULT_10_BPS\`, \`STRESS_25_BPS\`, and \`STRESS_50_BPS\` scenarios (fees **and** adverse slippage per side).

The report shows the difference in the *mean cash-outlay percentage-return number* between zero cost and the highest predefined cost. This is an arithmetical sensitivity exercise on independent notional units. It is **not a compounded portfolio return**, fill probability, liquidity estimate, certainty of performance or cost forecast.

## Practical self-check exercise (answer before inspecting the explanation)

A fictional report shows one holdout observation, a positive zero-cost modeled outcome and a negative higher-cost modeled outcome.

**Your task:** Identify (a) the sample-size warning, (b) what the cost sensitivity means, and (c) two pieces of external evidence still missing.

<details>
<summary>Suggested interpretation</summary>

A single holdout result is insufficient evidence for predictive reliability. The change of sign under costs shows that the arithmetic depends strongly on hypothetical fee/slippage assumptions; it does not prove actual losses or profits. Authentic historical point-in-time data, issuer corporate-action evidence, independently reviewed licensing, and realistic market bid-ask/liquidity observations are examples of missing external support.

</details>

## Methodological boundaries

- Existing 50/25/25 post-warmup partitions and fixed breakout rule are never refit or reoptimized.
- Every simulated observation is reconciled against its original historical indices; the first hypothetical entry uses the following session's open and exits use the fifth completed session.
- Counts and theoretical costs are checked for internal consistency; no confidence interval, effective independent sample size or statistical-power claim is fabricated.
- The earlier **20-window** threshold remains solely a descriptive warning cue; crossing it never establishes independent skill.
- The source-file name, synthetic data label, local hash, or self-declared vendor review cannot establish genuine point-in-time market authenticity.
- No claim of success on uptrends, downtrends, volatility environments, real exchanges or actual investment returns is supported.
- Old Phase 14–15 reproduction and claim registries remain unchanged; this phase adds a separate educational report without changing the frozen methodology inputs.

## Verification

\`\`\`bash
node --test tests/starnet-methodology-learning.test.mjs
npm run check
npm run security:secrets
npm run security:baseline
\`\`\`

GitHub Verify checks the one-observation holdout, phase counts, the strictly prior-signal context dates, all fixed hypothetical cost assumptions, no model tuning, source authenticity flags and NO_GO. The full existing StarNet Node, crash-recovery, evidence and Chromium suites remain required before any merge.

**No real trades, brokerage access, financial transfers, crypto transactions, or production release permissions are created.**
