<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: CI Quality Gates Implementation Plan

- **Plan**: `context/changes/testing-ci-quality-gates/plan.md`
- **Scope**: Phase 1-3 of 3
- **Date**: 2026-06-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | FAIL |

## Findings

### F1 — README CI section lags behind implemented gates

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `README.md:179`
- **Detail**: README CI section omitted the `test` gate and `TEST_*` secret family despite workflow changes.
- **Fix**: Update CI section to include `ci` + `test` + `deploy` ordering and test-secret reference.
- **Decision**: FIXED (Fix now)

### F2 — Preflight annotation can misdiagnose unrelated failures

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `.github/workflows/ci.yml:59`
- **Detail**: Single annotation path previously labeled all preflight failures as stale fixtures.
- **Fix A ⭐ Recommended**: Split preflight annotation into `fixtures-stale` and generic branches using preflight output classification.
  - Strength: Keeps fixture-drift signal while reducing false diagnosis.
  - Tradeoff: Adds a small classification branch in workflow logic.
  - Confidence: MEDIUM — straightforward logic; not yet proven across all failure modes.
  - Blind spot: Classification currently relies on message matching.
- **Decision**: FIXED (Fix A)

### F3 — Preflight probe is brittle if Parent A has multiple children

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: `tests/smoke/fixtures-preflight.test.ts:16`
- **Detail**: `maybeSingle()` on `parent_user_id` could fail when Parent A has >1 row.
- **Fix A ⭐ Recommended**: Probe deterministic seeded Parent A child ID via `TEST_PARENT_A_CHILD_ID`.
  - Strength: Aligns with deterministic seeded-fixture testing style.
  - Tradeoff: Requires env/CI/docs contract extension.
  - Confidence: MEDIUM — robust and explicit, but expands required test config.
  - Blind spot: Existing local `.env.test` files must be updated.
- **Decision**: FIXED (Fix A)

### F4 — Workflow validation command in criteria is not reproducible as written

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `context/changes/testing-ci-quality-gates/plan.md:201`
- **Detail**: `npx --yes @action-validator/cli --quiet .github/workflows/ci.yml` exits with usage error and is not replayable as documented.
- **Fix**: Replace criterion command with a reproducible workflow linter command and refresh Progress evidence.
- **Decision**: SKIPPED

### F5 — Extra documentation artifacts landed outside explicit Changes Required

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `context/changes/testing-ci-quality-gates/plan-brief.md`
- **Detail**: `plan-brief.md` and close-out plan edits landed outside explicit "Changes Required" list.
- **Fix**: Add a scope note allowing close-out/documentation sync artifacts.
- **Decision**: SKIPPED

### F6 — Manual checks are marked done but not auditable from repo evidence

- **Severity**: 👀 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `context/changes/testing-ci-quality-gates/plan.md:357`
- **Detail**: Manual checklist items are checked but do not include run links/screenshots/log references.
- **Fix**: Add compact evidence pointers next to manual checklist items.
- **Decision**: SKIPPED
