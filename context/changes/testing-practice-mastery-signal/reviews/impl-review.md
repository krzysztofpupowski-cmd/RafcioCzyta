<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Practice + Mastery Signal Implementation Plan

- **Plan**: `context/changes/testing-practice-mastery-signal/plan.md`
- **Scope**: Full plan review (Phases 1-4 completed)
- **Date**: 2026-06-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 3 warnings 3 observations

## Verification Evidence

- `npm test` (full suite): PASS (`11` files, `53` tests)
- `npm run lint`: PASS
- `npm run build`: PASS
- Post-fix re-run: `npm test -- tests/integration/practice-flow.test.ts tests/integration/mastery-summary.test.ts` PASS (`12` tests)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — No-due-cards test mutates too broad a card set, with partial restore

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/integration/practice-flow.test.ts:314-332
- **Detail**: Case 8 updated `next_review_at` for all accepted cards of the child, then restored only one generation, risking state leakage.
- **Fix**: Scope both mutation and restore to test-owned generations (`cleanupGenIds`).
  - Strength: Eliminates cross-test contamination while preserving intended behavior.
  - Tradeoff: Slightly more coupling to fixture tracking.
  - Confidence: HIGH — aligns with existing generation-scoped cleanup patterns.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix now)

### F2 — Mastery test setup deletes all accepted letters cards each case

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/integration/mastery-summary.test.ts:42-45
- **Detail**: `beforeEach` performed blanket delete of accepted `letters` cards for Parent A, creating broad destructive side effects.
- **Fix**: Remove blanket delete and assert per-test deltas from a baseline summary.
  - Strength: Avoids mutating unrelated rows while keeping deterministic expectations.
  - Tradeoff: Assertions become relative instead of fixed absolutes.
  - Confidence: HIGH — directly removes the broad mutation pattern.
  - Blind spot: Baseline data quality still influences final absolute totals.
- **Decision**: FIXED (Fix now)

### F3 — Practice-flow assertions are weaker than the planned contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tests/integration/practice-flow.test.ts:187,214-220
- **Detail**: Plan described stronger temporal/state assertions (future/near-now and state checks) than currently implemented checks.
- **Fix**: Tighten case 2/3 assertions to match planned temporal/state guarantees.
- **Decision**: SKIPPED

### F4 — Manual checks are marked complete without durable evidence in diff

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/testing-practice-mastery-signal/plan.md:368,380,392
- **Detail**: Manual verification steps are checked as complete, but no durable artifacts are referenced.
- **Fix**: Add short evidence notes/log references, or mark pending until re-verified.
- **Decision**: SKIPPED

### F5 — Extra doc files changed beyond planned implementation file list

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/testing-practice-mastery-signal/plan-brief.md
- **Detail**: `plan-brief.md` and plan-document edits were not explicitly listed in `Changes Required`.
- **Fix**: Record these as explicit addendum/epilogue scope.
- **Decision**: SKIPPED

### F6 — Status target wording is inconsistent between plan contract and final state

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/testing-practice-mastery-signal/change.md:4
- **Detail**: Contract text references `ready_for_implement`, while plan progress/final state reference `implemented`.
- **Fix**: Normalize status wording across plan docs.
- **Decision**: SKIPPED
