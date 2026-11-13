# Project 9 — synthetic alert-only acceptance preview

**Purpose:** Give the user an immediately testable, honest example of a locked market-condition rule *without real historical market data or order execution*. This PR advances the **demonstration component** of tracker #53, **not** data acceptance #43/#44 or real alert delivery #45.

## Run locally

Requires supported Node.js and the new branch checkout. No credentials, provider calls, npm dependencies or broker connection.

```bash
npm run demo:alerts
npm run check
npm start
```

From the same computer, visit **http://127.0.0.1:4179/alert-preview.html**. This server is loopback-only, not accessible to a phone on a different device or the public internet. Do not expose it externally or add a reverse proxy without an approved authentication design.

The page retrieves only **GET /api/alerts/preview**, which uses the existing deterministic `buildDemoDataset` and `analyzeDailyBreakout` code. It displays:
1. SIM09 — invented historical latest rule-triggered example.
2. SIM10 — invented historical no-trigger example.
3. SIM09 — deliberately invalid request beyond sourceAsOf, blocked before rule evaluation.

`npm run demo:alerts` prints the same structured JSON report offline. Repeating GET or CLI produces byte-equivalent results. No new writes, external HTTP calls, warnings hidden, broker routes, paper tickets, persisted alerts, timers or outgoing notifications are created.

## Acceptance checklist

- [ ] Focused unit tests and a real local HTTP test prove 3 scenarios, rule evidence, SHA-256 identity, repeated-output determinism and no-workstation-state mutation.
- [ ] `npm run check`, repository security gates and real Chromium workstation acceptance pass on the exact review SHA.
- [ ] User opens the page and distinguishes **rule triggered** from **notification eligible**. All three scenarios must say real notification eligible **NO**.
- [ ] Source and as-of dates visibly indicate **historical engineered synthetic** data, never current prices or independent data authenticity.
- [ ] Reviewer signs off on no alert/ticket/order side effects before merge. No deployment or automatic activation.

## Not solved by this demo

Real historical provenance and rights (#43), exchange calendars and freshness (#44), accepted signal/event idempotency and delivery failure recovery (#45), and independent strategy efficacy (#46). One green synthetic fixture does not demonstrate predictive skill or commercial readiness. No live trading or investment recommendations are authorized.
