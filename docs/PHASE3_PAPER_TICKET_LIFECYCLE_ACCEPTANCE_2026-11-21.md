# Project 9 — Phase 3 isolated paper-ticket lifecycle acceptance

**Status:** Candidate GitHub-side software acceptance. Real AAPL ticket creation **NOT RUN** because the independently reported 2026-11-20 AAPL scan produced `NO_PAPER_SETUP`. No finance account, broker, scheduler, market-data API, or existing local workstation state is touched.

## Why this gate exists

The separately reported AAPL acceptance on commit `ab9c88426a0c8888643d5c8fee8a1faeec30c108` confirmed close `$342.56`, score `55`, `NO_PAPER_SETUP`, no refresh errors, and zero new tickets. This correctly tests *rejection* but cannot establish a qualifying ticket's creation, persistence, recovery, subsequent observation, or duplicate protection.

This runner uses **only the existing engineered SIM09/SIM10 fixture generator** in a disposable OS temporary directory. It starts an ephemeral loopback-only server bound to `127.0.0.1`, with provider access replaced by a function that fails if called. It reopens the same disposable store to test restart behavior and removes the temporary data afterward. A real symbol such as AAPL is never added or evaluated.

## Repeatable commands

With a supported, patched Node runtime on this branch:

```bash
npm run accept:paper-lifecycle
node --test tests/paper-lifecycle-acceptance.test.mjs
npm run check
npm run security:baseline
npm run security:secrets
```

The first command prints a structured JSON evidence summary. The Node test invokes the same isolated acceptance and fails if any assertion fails. GitHub Actions run the full test suite for each PR; a passing workflow must be tied to the **exact final candidate commit**.

## Acceptance matrix

| Case | Expected result |
| --- | --- |
| Default manual cycle | Refresh and scan only; **zero** automatic ticket creations |
| SIM10 `NO_PAPER_SETUP` | HTTP 409 eligibility refusal; no persisted mutation |
| SIM09 missing or forged reviewed-scan binding | HTTP 409; journal unchanged byte-for-byte |
| Two simultaneous approved SIM09 requests | Exactly **one** HTTP 200 and **one** HTTP 409 |
| Repeated create on same session | HTTP 409; journal unchanged byte-for-byte |
| Restart and reload | Exact state equality, one open ticket, and duplicate rejection |
| Advance `HOLD` | Existing ticket stays open; no new ticket |
| Repeat stale `HOLD` request | HTTP 409; journal unchanged |
| Advance `TARGET` | Same ticket records `TARGET_REFERENCE_TOUCHED` |
| Refresh and second restart | Terminal outcome and ticket identity remain unchanged |
| Separation | SIM10 scan intact; no AAPL fixture or ticket; immutable SIM09/SIM10 seed files |
| Side effects | Provider calls **0**, real orders **0**, broker endpoint **404**, legacy paper state byte-identical |

Results are educational observations on wholly invented historical sessions. The `TARGET` scenario is deliberately generated **after** ticket opening and cannot be interpreted as a forecast, executed fill, trading performance, or AAPL result.

## Integration and stop conditions

- This branch **stacks on draft PR #68**, whose own base is draft PR #67, which stacks on #60. It does not claim to be ready to merge into `main`.
- The acceptance runner verifies one-process serialized persistence, restart, replay binding, and simulated outcome progression. It does **not** prove multi-process coordination, actual power-loss durability, or live vendor correctness.
- AAPL continues to require manual review and the observed `NO_PAPER_SETUP` stop rule. **Do not bypass classification** to manufacture a real-stock ticket.
- Pause all background scheduling; do not enable `--paper-auto`, brokerage routes, third-party APIs, or live trading.
- Re-run after merging the dependency chain; changed base code invalidates this candidate's exact-revision verification.
- If any test fails, mark that gate **FAIL**, leave the draft unmerged, and preserve all existing local data.

## Follow-on

After this controlled synthetic acceptance is verified, focus on a read-only historical scoring audit with time-split samples, separate transaction-cost/slippage stress, and data-provenance checks. Keep simulated performance explicitly separate from unobserved market execution quality.
