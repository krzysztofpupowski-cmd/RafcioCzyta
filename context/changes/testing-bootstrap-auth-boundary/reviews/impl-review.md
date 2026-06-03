<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Bootstrap + Auth Boundary Implementation Plan

- **Plan**: context/changes/testing-bootstrap-auth-boundary/plan.md
- **Scope**: Phases 1–4 of 4 (all completed)
- **Date**: 2026-06-03
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Missing `prerender = false` on sign-in route

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/signin.ts:1
- **Detail**: Plan Phase 2 and AGENTS.md require `export const prerender = false` on all API routes. Seven extracted re-export routes include it; `signin.ts` does not.
- **Fix**: Add `export const prerender = false` above the POST export in `signin.ts`.
- **Decision**: FIXED — Fix now

### F2 — `.env.test.example` emails disagree with `seed.sql`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: .env.test.example:8-11, tests/fixtures/seed.sql:21-22
- **Detail**: Example uses `parent-a@test.example` / `parent-b@test.example`; seed looks up `test@test.pl` / `test2@test.pl`. README documents seed emails but a copy-paste from the example alone leaves integration tests failing after seed apply.
- **Fix**: Change `.env.test.example` emails to `test@test.pl` and `test2@test.pl` to match seed defaults.
- **Decision**: SKIPPED

### F3 — Sign-in smoke test skips on auth error

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/integration/authn-protected-apis.test.ts:92-94
- **Detail**: When sign-in redirect contains `error=`, the test calls `ctx.skip(true)` instead of failing. Mis-seeded credentials or wrong Supabase project can hide as a skipped pass.
- **Fix**: Replace `ctx.skip(true)` with `expect(location).not.toContain("error=")` and a descriptive message, so misconfiguration fails loudly.
- **Decision**: FIXED — Fix now

### F4 — Cross-parent tests pin exact Polish error strings

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/integration/authz-cross-parent.test.ts:34,62,86
- **Detail**: IDOR tests assert full Polish `error` copy. Authorization still holds if status is 404 and `ok === false`, but copy changes break CI without a security regression.
- **Fix**: Assert `response.status === 404` and `body.ok === false`; optionally keep one representative string check or match a stable error code if introduced later.
- **Decision**: FIXED — Fix now

### F5 — `change.md` status ahead of plan Phase 4 contract

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/testing-bootstrap-auth-boundary/change.md:4
- **Detail**: Plan Phase 4 specified `status: ready_for_implement`; actual is `status: implemented`, which correctly reflects full delivery including manual seed confirmation.
- **Fix**: No change needed — `implemented` is the correct terminal status after all phases; plan wording was pre-ship.
- **Decision**: DISMISSED — no change needed; `implemented` is correct
