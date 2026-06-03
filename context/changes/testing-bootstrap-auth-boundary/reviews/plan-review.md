<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Bootstrap + Auth Boundary Implementation Plan

- **Plan**: context/changes/testing-bootstrap-auth-boundary/plan.md
- **Mode**: Deep
- **Date**: 2026-06-03
- **Verdict**: SOUND (after triage fixes)
- **Findings**: 1 critical, 4 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING → PASS (F2 fixed) |
| Lean Execution | PASS |
| Architectural Fitness | WARNING → PASS (F1, F6 fixed) |
| Blind Spots | WARNING → PASS (F5 fixed) |
| Plan Completeness | WARNING → PASS (F1, F3, F4, F7 fixed) |

## Grounding

Grounding: 12/12 existing paths ✓, 5/5 symbols ✓, brief↔plan ✓ (new files correctly marked `(new)`)

## Findings

### F1 — Vitest must stub Astro virtual modules

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — vitest.config.ts / tests/setup.ts
- **Detail**: `astro:env/server` and `astro:middleware` are virtual modules; `process.env` alone does not satisfy production imports.
- **Fix A ⭐ Recommended**: `tests/stubs/` + Vitest `resolve.alias`
- **Decision**: FIXED via Fix A

### F2 — signInAs needs sign-in handler extraction

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 2 vs Phase 3
- **Detail**: Phase 3 `signInAs` depended on sign-in handler not in Phase 2 extraction list.
- **Fix**: Add `auth-signin-post.ts` to Phase 2
- **Decision**: FIXED

### F3 — IDOR assertions use Polish API errors

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — authz-cross-parent.test.ts
- **Detail**: HTTP JSON uses Polish `error` strings, not service constant names.
- **Fix**: Assert status + documented `error` strings
- **Decision**: FIXED

### F4 — Phase 4 change.md status typo

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — change.md
- **Detail**: Contract said `status: planned` while intent was ready for implement.
- **Fix**: `status: ready_for_implement` after Phase 4
- **Decision**: FIXED

### F5 — OPENAI_API_KEY in test env

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 env contract
- **Detail**: Generate handler import chain loads `OPENAI_API_KEY`.
- **Fix**: Dummy key in `.env.test.example` + stub export
- **Decision**: FIXED

### F6 — Middleware tests need cookie stub

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — api-context helper
- **Detail**: `onRequest` calls `createClient` with `context.cookies`.
- **Fix**: Document AstroCookies-compatible stub in helper contract
- **Decision**: FIXED

### F7 — Phase 2 sign-in vs Phase 3 seed ordering

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Blind Spots
- **Location**: Phase 2 optional control
- **Detail**: Optional sign-in smoke needs auth users only, not full seed.
- **Fix**: One-line prerequisite note
- **Decision**: FIXED

### F8 — reject.ts IDOR sibling omitted

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Lean Execution
- **Location**: Phase 3 matrix
- **Detail**: Representative scope; reject mirrors accept IDOR shape.
- **Fix**: Optional cookbook footnote
- **Decision**: SKIPPED
