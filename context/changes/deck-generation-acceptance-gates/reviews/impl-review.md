<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Deck Generation & Acceptance Gates

- **Plan**: `context/changes/deck-generation-acceptance-gates/plan.md`
- **Scope**: Phases 1-4 (completed)
- **Date**: 2026-06-04
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 8 warnings 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | FAIL |

## Findings

### F1 — Lint gate fails despite Progress marked complete

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `.cursor/hooks/lint-after-edit.mjs`, `.cursor/hooks/typecheck-after-edit.mjs`, multiple `src/lib/**`
- **Detail**: `npm run lint` fails at HEAD while Phase 3/4 lint checkboxes were marked complete.
- **Fix A ⭐ Recommended**: Re-baseline checklist truthfully and track lint cleanup as follow-up.
  - Strength: Preserves process integrity and keeps status truthful.
  - Tradeoff: Requires explicit follow-up work.
  - Confidence: HIGH — direct command output.
  - Blind spot: New vs pre-existing lint ownership not fully mapped.
- **Fix B**: Block this change until lint is fully green in scope.
  - Strength: Strict gate discipline.
  - Tradeoff: Can delay delivery for unrelated lint debt.
  - Confidence: MEDIUM — depends on ownership split.
  - Blind spot: Requires full error ownership analysis.
- **Decision**: FIXED (Fix A)

### F2 — Generate error-matrix tests miss no-insert side-effect assertions

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `tests/integration/flashcards-generate.test.ts`
- **Detail**: Negative branches lacked explicit assertions that no `flashcard_generations` rows were inserted.
- **Fix**: Add before/after visible generation counts for timeout/failure/missing-key cases.
  - Strength: Aligns with plan contract and catches persistence regressions.
  - Tradeoff: Slightly more test setup.
  - Confidence: HIGH — direct plan-vs-test mismatch.
  - Blind spot: None significant.
- **Decision**: FIXED

### F3 — State-machine matrix diverges from seeded-ID and no-mutation checks

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `tests/integration/flashcards-state-machine.test.ts`
- **Detail**: Accept flow used runtime IDs and double-accept case lacked explicit no-mutation assertion.
- **Fix**: Use `TEST_PARENT_A_GENERATION_ID` for accept setup and assert accepted count unchanged across second accept.
  - Strength: Restores deterministic fixture coverage and idempotence proof.
  - Tradeoff: More coupling to fixture state.
  - Confidence: HIGH — explicitly required by plan contract.
  - Blind spot: None significant.
- **Decision**: FIXED

### F4 — Unplanned scope expansion in unrelated tooling/runtime files

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Scope Discipline
- **Location**: `.cursor/hooks.json`, `.cursor/hooks/*.mjs`, `src/lib/services/srs-adapter.ts`, `src/lib/supabase.ts`, `src/db/database.types.ts`, `astro.config.mjs`, `tests/helpers/api-context.ts`
- **Detail**: Changed-file set extends beyond declared Phase 1-4 deliverables.
- **Fix A ⭐ Recommended**: Keep supporting edits with plan addendum and track unrelated files as follow-up split.
  - Strength: Preserves useful work while restoring traceability.
  - Tradeoff: Leaves split as explicit follow-up work.
  - Confidence: HIGH — changed-file set is objective.
  - Blind spot: External dependencies on each extra file not fully mapped.
- **Fix B**: Revert all non-plan files from this scope.
  - Strength: Maximum scope purity.
  - Tradeoff: Risk of breaking supporting adjustments.
  - Confidence: MEDIUM — depends on coupling.
  - Blind spot: Dependency verification required first.
- **Decision**: FIXED (Fix A)

### F5 — Reject handler misses L-001 file-wide eslint-disable convention

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/lib/api-handlers/flashcards-reject-post.ts:1`
- **Detail**: L-001 recommends file-wide disable block in touched handler/service files.
- **Fix**: Add the same file-wide block used in sibling handlers.
- **Decision**: SKIPPED

### F6 — Generation service misses L-001 file-wide eslint-disable convention

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/lib/services/flashcard-generation.ts:1`
- **Detail**: Touched service file does not include the canonical L-001 file-wide block.
- **Fix**: Add/restore the L-001 file-wide disable block at file top.
- **Decision**: SKIPPED

### F7 — UUID validator is looser than documented v4 contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `tests/helpers/env.ts:22`
- **Detail**: UUID regex accepts non-v4 formats while docs/error text say v4.
- **Fix**: Tighten regex to v4+variant nibble.
- **Decision**: SKIPPED

### F8 — Case-5 setup lacked explicit mutation-success assertions

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `tests/integration/flashcards-state-machine.test.ts:222`
- **Detail**: Setup mutations were awaited without asserting successful insert/transition before exclusion assertions.
- **Fix**: Assert DB insert errors are null and accept/reject setup responses are 200/ok.
  - Strength: Prevents false positives in state-machine coverage.
  - Tradeoff: Slightly larger setup block.
  - Confidence: HIGH — setup path was under-asserted.
  - Blind spot: None significant.
- **Decision**: FIXED

### F9 — Manual checks lacked explicit evidence notes

- **Severity**: 👀 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `context/changes/deck-generation-acceptance-gates/plan.md` (manual checks 1.4, 2.4, 3.6)
- **Detail**: Manual steps were checked but lacked explicit evidence annotations in the progress lines.
- **Fix**: Add concise evidence notes to each affected checklist line.
- **Decision**: FIXED
