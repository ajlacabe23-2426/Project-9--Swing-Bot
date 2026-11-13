# Research return/window contract v2 — Issue #42

## Scope and migration

Daily breakout and scanner paper-forward remain different, frozen strategies. No ledger, dataset, archived v1 report, signal rule, position size, fill engine, provider adapter or trading capability is changed. New reports use schema v2. Consumers must check schema and `returnContract.version`; the forward `modeledNetChangePct` / mean aliases now mean cash-outlay returns, not the v1 entry-reference basis. Daily aliases retain cash basis but now aggregate unrounded returns. Existing archived v1 outputs are not rewritten.

## Reviewed accounting convention

For one independent notional unit, fee f=feeBps/10000 and adverse slippage s=slippageBps/10000:

- E = next open * (1+s), X = exit close * (1-s).
- C = E * (1+f), P = X * (1-f), D = P-C.
- Canonical return = 100*D/C (`cashOutlayReturnPct`).
- Separately retained entry-reference return = 100*D/E (`referenceReturnPct`).
- Therefore R_reference=(1+f)*R_cash on IDENTICAL windows, also for losses. Both old formulas charged both fees.

100 -> 110 with 100bps fees each side, no slippage: D=7.9, reference=7.9%, cash=790/101%. For exit 90: D=-11.9, cash=-1190/101%. Flat: D=-2, cash=-200/101%. Zero costs make both bases equal.

Raw JS double-precision values, references, fees and cash amounts are retained in each `returns` object. Means use raw per-observation returns, not rounded displays. Legacy display aliases use Number(toFixed(4)); signed PL governs positive-outcome flags, exactly zero is not positive. No observations yields null, never a fabricated zero mean. There is no compounding, minimum fee, cash-funded portfolio, dividend or corporate-action return model here. Journal reference PL and synthetic portfolio NAV remain separate systems.

## Strategy/window identity

- Daily: `P9_DAILY_20H_50SMA_V1`, first signal index 49; close > SMA50 and > highest prior-20 high.
- Scanner: `P9_SWING_SCANNER_WATCH_STRONG_V1`, first signal index 50; existing five-factor WATCH/STRONG rule unchanged.
- Both: completed-close signal i, entry open i+1, exit close i+h; h integer 1–30 (default 5). For h=1 entry/exit share a session. Re-signal at exit close is allowed; next position starts at a later open. Censored-tail signals have no closed outcome.
- Every actual observation includes zero-based indices and signal/entry/exit dates. Metadata exit prose follows h.

Different strategies need not have equal means. SIM09 has 14 daily versus 13 scanner default windows, with different offsets and an unmatched final engineered spike. Compare exact tuple intersections first; decompose denominator effects only on identical tuples, then report unmatched windows separately. These counts are software-fixture behavior, not independent market samples.

## Reproduction identity and limitations

File-based commands add input-byte SHA256, source Git SHA, tracked-engine working-diff digest, individual engine-byte hashes, settings, exact tuples and a JSON manifest digest. Git unavailable is explicit; uncommitted engine edits are not represented as a clean candidate. A final report must identify the exact committed candidate and run gates on that revision. Hash identity does not establish source authenticity, rights or PIT availability.

Both engines include existing data-quality/provenance reasons through the review cutoff. Signal computation uses no future prices; later-acquired history still cannot establish PIT availability. Synthetic fixtures remain synthetic. No provider calls, paper-ticket creation, brokerage, real orders or routines are part of these commands.

## Regression verification

`node --test tests/return-window-contract.test.mjs tests/daily-breakout-research.test.mjs tests/paper-forward-audit.test.mjs`

Then `npm run check`, `npm run security:secrets`, `npm run security:baseline`; Chromium acceptance separately where available. Check exact manifest hashes and data-byte preservation. Independent review is required; passing software tests is not a strategy-efficacy claim.

## Sprint #42 hardening

The shared return helper now rejects non-numeric, non-positive or non-finite prices, out-of-range costs, and non-finite derived values before JSON serialization. Ratios divide before multiplying by 100 to avoid unnecessary intermediate overflow. Raw means scale each observation before summation and reject non-finite inputs/results; daily display means use that same guarded aggregation. Daily and scanner research also reject non-finite derived indicators before classification, and swing risk references before serialization. These checks fail closed rather than redesigning indicator arithmetic; finite extreme-price accuracy and data authenticity are not established.

Both v2 research seams reject a review date after the declared source-as-of date. This is a deliberate scanner v1 compatibility change: use a review cutoff within the declaration, not an invented later source availability. The restriction and both seams are regression-tested; it does not prove point-in-time availability.

Manifests additionally disclose report schema, dataset declarations (including currency, adjustment and source-as-of), input coverage, effective report parameters, Node runtime and cutoff quality/provenance reasons. Every selected engine byte is compared against its Git commit blob; an untracked or ignored dependency cannot claim `COMMITTED_TRACKED_ENGINE`. The selected-engine identity is not a full repository cleanliness guarantee. Retain full candidate SHA/status and output-byte digests in external execution evidence.

Added regressions cover invalid helper inputs, ratio/product overflow, representable large ratios, aggregate overflow, both actual engines rejecting unrepresentable outcomes, complete dataset declarations, and dirty/untracked/ignored dependency identity. Tests use disposable data, not archived `.data` files.
