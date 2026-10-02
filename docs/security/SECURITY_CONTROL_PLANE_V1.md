# Project 9 Security Control Plane v1

Updated: 2026-10-01

This is a lightweight repository-level defensive layer for the research-first paper-trading project.

It provides reachable-history credential scanning with suppressed values, immutable GitHub Action pinning, explicit read-only workflow permissions, checkout credential removal, tracked secret-like file rejection, Dependabot coverage, conditional dependency auditing, and incident-response guidance.

The baseline deliberately does not add brokerage authentication, live order routing, public hosting, or financial-account access. If dependencies are introduced later, package-lock.json becomes mandatory before promotion and the existing advisory audit activates automatically.
