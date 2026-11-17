# Project 9 — synthetic paper-session replay acceptance

**Scope:** Local educational simulation for the existing SIM09/SIM10 workstation. This advances user-facing acceptance of paper-journal update behavior without enabling real-data signals, real-money execution, provider calls, outbound alerts or a broker connection.

## Manual Mac acceptance

1. Preserve existing local `.data` files and stop your current local Project 9 server using Ctrl+C.
2. Fetch the feature branch, inspect `git status --short`, and switch only if local changes are preserved.
3. Run `npm run check` and `npm start`.
4. Open `http://127.0.0.1:4179/workstation.html`.
5. Select SIM09 and **Refresh completed bars**. If the demo datasets were never seeded, stop the server and run `npm run demo:seed` before restarting. **Do not reseed to delete or reset existing observations**; the seed script refuses unrelated overwrites.
6. In **Synthetic replay / paper journal**, select **Stay between stop and target**, then click **Advance synthetic session** once. The as-of date moves forward by one invented weekday, the chart refreshes and matching source-bound SIM09 observations update their `observedThrough` and paper reference P/L. The four pre-upgrade observations remain preserved without inferred source identity.
7. Change the scenario to **Touch frozen target reference** and click again. When frozen targets are reached, the journal reports `TARGET_REFERENCE_TOUCHED` for affected tickets. **STOP** and **BOTH** are alternative controlled scenarios for fresh synthetic observations; `BOTH` remains ambiguous and does not invent an intraday order.
8. Confirm existing duplicate records (e.g., four past SIM09 tickets) were **preserved**, not deleted. Try to create another ticket on the same completed session or while one is still open; it must reject duplicates.
9. Refreshing the page/reopening the workstation must preserve the synthetic data and ticket outcomes. Pressing regular **Refresh completed bars** alone only re-reads cached bars; it does not invent the next session.

These dates and OHLC bars are invented. Weekdays are a simulation convenience, not an authoritative exchange calendar or historical truth. The selected outcome intentionally controls the next bar: this **does not measure predictive accuracy** and paper reference P/L is **not an executable fill**.

## Technical guardrails

- Local-only same-origin POST `/api/workstation/demo/advance` with exact `{ "symbol":"SIM09", "scenario":"HOLD", "expectedAsOf":"YYYY-MM-DD" }`; other supported scenarios `TARGET`, `STOP`, `BOTH`.
- Requires recognized built-in synthetic fixture source and unmodified original 120 bars. Explicitly refuses other symbols and ordinary provider datasets; unavailable when `MASSIVE_API_KEY` is configured.
- The seed file is read-only for replay. The appended bars, scan and source-bound ticket outcomes are saved together in one atomic workstation-state replacement. The in-process mutation queue rejects stale or concurrent repeated requests with HTTP 409. Refresh reads the committed replay state. A failed save before commit leaves the original seed and prior state untouched. This is not a multi-process lock or a power-loss durability guarantee.
- Existing `evaluatePaperTicket` computes next completed-bar paper outcomes. Legacy observations without a frozen opening-history digest, or with a mismatched digest, are retained unchanged. New demo observations bind to their opening history; a digest is an internal identity check, not authentication. New same-session and still-open-symbol duplicates are rejected, and synthetic advancement suppresses classification-change alerts.
- No background schedule, external notification, account access, brokerage or real orders. No new dependencies.

## Acceptance evidence required before merge

- [ ] Focused pure, HTTP, negative, race and persistence tests on exact HEAD.
- [ ] `npm run check` and security workflows on exact HEAD.
- [ ] Real headless Chromium workstation acceptance on exact HEAD.
- [ ] Independent read-only/no-real-data boundary review; inspect the untouched seed, source-binding behavior and single-state atomic replacement.
- [ ] Mac manual reproduction with preserved legacy SIM09 records, newly source-bound synthetic observations, and restart comparison.
- [ ] Explicit owner's merge approval. Do not deploy or enable live trading.

Existing issues #43/#44/#45 still gate real market data, session freshness and informational-alert eligibility. This feature is not production market-data acceptance or evidence of profitability.
