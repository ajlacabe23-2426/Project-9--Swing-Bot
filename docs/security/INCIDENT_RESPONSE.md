# Project 9 Incident Response

Updated: 2026-10-01

## Priorities

1. Keep the system research-only and prevent unintended live execution paths.
2. Protect credentials and local research data.
3. Preserve evidence without exposing secrets.
4. Restore a known-good candidate and re-run deterministic research checks.

## Credential exposure

- Never paste the suspected value into issues, commits, CI logs, or chat.
- Identify the provider and affected scope.
- Revoke/rotate only through the provider's official control plane with explicit authorization.
- Scan reachable Git history and relevant artifacts.
- Verify the old credential is invalid before closing the incident.

## Suspicious repository or workflow change

- Freeze promotion.
- Compare against the last verified research candidate.
- Review Action SHAs, token permissions, checkout credential handling, package metadata, server routes, and any code touching AI/provider configuration.
- Re-run secret-history scan, repository baseline, dependency audit when applicable, syntax checks, and all Node tests.

## Trading-boundary incident

Any code path that can transmit a real order, authenticate to a brokerage for execution, or bypass the paper/simulation boundary is a release blocker unless it was separately designed, reviewed, authorized, and tested under a future execution-specific security model.

## Research-integrity incident

Unexpected mutation of paper ledger state, dataset handling, cost assumptions, holdout boundaries, or deterministic replay should be treated as a candidate-integrity failure. Preserve the input fingerprint and exact commit, reproduce offline, and do not present results as evidence until consistency is restored.

## Recovery evidence

Record the affected commit, corrected commit, exact passing verification runs, known limitations, and any external action still requiring owner approval.
