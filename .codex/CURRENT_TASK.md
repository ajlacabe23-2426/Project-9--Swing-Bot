# Project 9 — Entry/exit decision and code map

Task ID: P9-DECISION-MAP-2026-10-12
Status: VERIFYING
Risk Tier: TIER_2
Base SHA: 82b739de9a1a64abf5c56dd5d61f5b9f8d3c56ee
Base PR: #17 (unmerged frozen integration candidate)

## Objective
Implement the user's authorized 3D structure idea in the personal swing workstation: explore the code path and evidence behind existing paper entry/stop/target levels. Isolated feature branch; preserve #17 and existing paper data.

## Implementation
- Browser-local SVG perspective projection, rotation, keyboard/node buttons, flat view and code labels; no new dependencies, AI calls or WebGL/CDN.
- Pure read-only model projects exact scanner or explicitly selected frozen-ticket references. Current scan indicators never stand in for missing at-open evidence.
- Chart marks entry at its reference date and a subsequent paper stop/target touch at its observation date; an ambiguous daily bar never receives an invented exit marker.
- Explicit selector distinguishes current scan from individual historical tickets; ticket creation always uses the current scan.
- Existing scanner rules, risk formulas, persistence schema and execution boundary are unchanged.

## Required gates
- Syntax and complete offline Node test suite.
- Security baseline and full-history secret scan.
- Actual Chromium loopback acceptance using disposable synthetic data: rotate, select, keyboard, mobile layout, choose frozen ticket, refresh outcome, preserve paper state.
- GitHub Verify and Security Monitor on exact candidate SHA.
- Manual Mac/Lenovo acceptance remains owner verification, separately recorded.

## Boundaries
No merges, main changes, production deployments, broker integration, real orders, paid service activation or production secrets. Graph is a curated map of existing functions, not AI-extracted arbitrary code. No claim of improved trading performance or real-provider data verification.
