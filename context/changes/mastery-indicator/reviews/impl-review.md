<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Mastery Indicator (S-05)

- **Plan**: context/changes/mastery-indicator/plan.md
- **Scope**: Phases 1–2 of 2 (all completed)
- **Date**: 2026-06-02
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Wrong guided copy when SSR summary fails

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/mastery/MasteryIndicatorCard.tsx:63
- **Detail**: When `initialSummary` is null but `initialError` is set, `renderBody()` shows „Zaakceptuj fiszki…” via `!summary` while `ServerError` shows the real error. Plan intended accept-fiszki copy only when summary loaded with `acceptedCount === 0`.
- **Fix**: Split conditions — accept-fiszki when `summary?.acceptedCount === 0`; when `summary === null` with error, show neutral fallback or body copy only via `ServerError`.
- **Decision**: SKIPPED

### F2 — ESLint disable header differs from L-001 template

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/mastery-indicator.ts:7
- **Detail**: Plan required same shape as `children.ts`. Implementation disables only `no-unsafe-member-access` and `no-unnecessary-condition`; canonical adds `no-unsafe-assignment` and `no-unsafe-return`.
- **Fix**: Align disable list with `children.ts` L-001 header.
- **Decision**: SKIPPED

### F3 — Unused MASTERY_ERROR_* constants

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/mastery-indicator.ts:18-19
- **Detail**: `MASTERY_ERROR_NO_CHILD` and `MASTERY_ERROR_NO_CHILD_LEVEL` exported but unused; API uses inline Polish strings.
- **Fix**: Remove unused exports or wire into `summary.ts` like `PRACTICE_ERROR_*` in practice routes.
- **Decision**: SKIPPED
