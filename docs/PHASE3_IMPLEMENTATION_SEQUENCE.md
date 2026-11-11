# Phase 3 follow-on implementation sequence — #43 and #44

Planning only. No merge, deployment, provider requests/purchases, source promotion, alert activation, trading or unattended routines authorized. Scope each package to its own branch and frozen candidate; preserve accepted snapshots and old evidence.

## Prerequisite: #42 review gate

Review cash-outlay/reference identities, raw-precision aggregation and distinct strategy tuples in RETURN_WINDOW_CONTRACT_V2.md. Require focused regressions, full check/security, independent SHIKAMARU arithmetic review and KAGUYA integrity review on the frozen candidate. Carry browser/access gaps explicitly; do not mark #42 accepted or merged without owner action.

## 1. #43-A — evidence-backed data identity and quarantine

Owner TSUKUYOMI, reviewer KAGUYA. Add versioned credential-free evidence sidecar: stable security identity, MIC, currency/units, provider/product, request/response identity, raw hash, acquisition/available-at/known-at/decision timestamps, parser/transform versions, reviewer/reason codes, dated scope-specific rights. Unknown/expired rights quarantine; forged VERIFIED enums cannot promote. Keep synthetic, quarantined, research-accepted and alert-eligible separate. Tests: tampering, missing/expired evidence, no keys/signed URLs, synthetic non-promotion.

## 2. #43-B — immutable vintages, PIT and universe selection

Owner TSUKUYOMI; KAGUYA lineage/SHIKAMARU PIT review. Preserve revision-refusing atomic writer, add immutable snapshot parent hashes and correction proposals, concurrency/crash recovery. PIT selection excludes later-known facts; acquired-later data remains RETROSPECTIVE_UNVERIFIED_PIT absent archive proof. Include delisted losers, renames and dated membership without duplicating securities; unknown terminal proceeds remain unresolved. Tests: later vintage cannot change earlier eligible decisions, tamper/missing parent fails, exact replay from manifest.

## 3. #43-C — actions and independent reconciliation

Store raw plus named adjusted bases, factors/action ledger/methodology. Predeclare reconciliation samples before outcomes: min(N,30) distinct dates, earliest/latest/seeded interiors, all action/anomaly boundaries. Match venue/session/currency/basis; documented tick tolerance and exact normalized volume; same-vendor mirror is not independent. Unresolved discrepancies fail. Fixtures: 2:1 and reverse split preserve economic units/value without fake breakout/ATR; 100->99 plus dividend 1 distinguishes -1% price from 0% economic return before costs, with no double credit. Missing actions block affected windows. Actual source acceptance needs documentary evidence, not mocks.

## 4. #44-A — pinned calendar and central session freshness

After #43-A establishes MIC/time/rights identity. Owner TSUKUYOMI, reviewer KAGUYA. Pin calendar/version, IANA zone, session definition, documented provider timestamps, entitlement delay and finalization grace. Separate historical completeness from wall-clock freshness. Offline fixtures: weekend, authoritative holiday, early close, DST, cross-UTC session, missing expected session within a short calendar gap. Reject non-session/incomplete bars; reason-code halts; never forward-fill. Previous completed session valid before grace, missing latest blocks eligibility after grace. No alert activation.

## 5. #44-B — provider-history completeness and snapshot preservation

Mock pagination and finality without real provider calls. Cover every expected page, duplicate/truncated pages, wrong ticker/window, adjustment mismatch, incomplete/future bar and schema drift; never promote partial success. Every requested symbol accepted or explicit failure, no silent denominator omissions. Keep #43 reconciliation decisions and rejected-input snapshot preservation. Real vendor timestamp/rights certification remains separate documentary work.

## Each package's exit gate

Focused failing-before/passing-after tests, npm run check, security:secrets, security:baseline, deterministic replay, applicable PIT/cost/ledger tests, independent review on exact SHA and explicit PASS/FAIL/SKIPPED/UNAVAILABLE results. Browser/CI gates separately evidenced. Never equate software validation with authentic data, profitability or execution readiness.

Sources: GitHub Project-9--Swing-Bot issues #42, #43 and #44 read 2026-11-11; AGENTS.md and docs/ROADMAP.md.
