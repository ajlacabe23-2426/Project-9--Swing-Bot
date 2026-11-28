# Offline evidence quality — Issue #100

Scope: fictional educational software fixtures only. This report is not financial research validation or evidence of real-market performance.

## Verified baseline

Revision: edcffc02d69209505c553d607346030aa301507e

- [Software verification](https://github.com/ajlacabe23-2426/Project-9--Swing-Bot/actions/runs/45911942381): success.
- [Security monitor](https://github.com/ajlacabe23-2426/Project-9--Swing-Bot/actions/runs/45911942375): success.
- Main suite: 361 tests, 360 passed, zero failed, one skipped.
- Separate browser acceptance: one passed, zero failed.
- Shared gaps, extreme gaps and invalid UTF-8/schema cases: all passed.

## Evidence semantics

- FIXTURES_AGREE: the supplied fictional records match and their observed union contains no internal gaps. This does not establish that the requested coverage is complete.
- REVIEW_REQUIRED: missing records, value disagreements or shared internal timeline gaps exist.
- Invalid schema, encoding, ordering, size or numeric bounds: reject input.
- SHA-256 identifies original bytes, not authenticity or independence of sources.
- Determinism and fresh-process recovery do not establish statistical validity or financial usefulness.

## New unverified coverage

Revision 5aacf8bb78ea9aac7a03e8951252b36d0935f9d7 adds three property tests exercising 400 seeded cases: 200 finite-grid oracle comparisons, 100 direction-symmetry cases, and 100 invalid-record mutations. The seeds are reproducible; they do not constitute independent market samples. Exact-head CI is required.

## Remaining boundaries

Both fixtures may omit observations before the first or after the last supplied timestamp. The comparison does not declare an expected external coverage window. JSON duplicate member names are not detected by the native parser. Fictional source labels are not proof of independence. No real source ingestion, account access, order logic, or deployment is introduced by these changes. PR #101 remains stacked on #99; combined-branch acceptance is outstanding.
