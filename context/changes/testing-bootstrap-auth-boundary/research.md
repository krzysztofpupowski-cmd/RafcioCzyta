---
date: 2026-06-03T12:00:00+02:00
researcher: Composer
git_commit: 43fc9f3b731aef3c38b1f858474fa209cfdc473a
branch: main
repository: RafcioCzyta
topic: "Bootstrap + auth boundary"
tags: [research, codebase, vitest, auth, rls, middleware, test-plan]
status: complete
last_updated: 2026-06-03
last_updated_by: Composer
---

# Research: Bootstrap + auth boundary

**Date**: 2026-06-03T12:00:00+02:00  
**Researcher**: Composer  
**Git Commit**: `43fc9f3b731aef3c38b1f858474fa209cfdc473a`  
**Branch**: main  
**Repository**: RafcioCzyta (krzysztofpupowski-cmd/RafcioCzyta)

## Research Question

`/10x-research Bootstrap + auth boundary` — Where does authentication and authorization live today, what must Phase 1 tests prove (test-plan risks #1 and #2), and what is missing to install Vitest and exercise those boundaries?

## Summary

The **10x Astro Starter bootstrap** left a cookie-based Supabase SSR stack (`@supabase/ssr`) with middleware that only guards **`/dashboard`** and eight parent APIs that each inline-check `context.locals.user`. There is **no shared `requireAuth` helper** and **no automated test runner** yet. **Risk #2** (unauthenticated access) is addressed in code by middleware plus per-API checks, but responses differ: most APIs return **401 JSON**, while `POST /api/children` returns **303** to sign-in. **Risk #1** (cross-family IDOR) relies on **`getMyChild(supabase, user.id)`** at every child-scoped entry point (no client-supplied `child_id`) plus **RLS** on all five domain tables via `is_my_child()` / `parent_user_id = auth.uid()`. Phase 1 must add **Vitest** and integration tests that assert both layers without mocking away RLS or depending on `supabase start` in CI (per test-plan §7 and AGENTS.md). The change folder `testing-bootstrap-auth-boundary` was listed as opened in the test plan but was created by this research pass.

## Detailed Findings

### Bootstrap hand-off (auth shipped with starter)

- Starter: `10x-astro-starter` with `has_auth: true` ([verification log](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/context/changes/bootstrap-verification/verification.md#L1-L34)).
- Tech stack documents Supabase cookie auth as the default for this MVP ([tech-stack.md](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/context/foundation/tech-stack.md#L15-L24)).
- Post-bootstrap domain work (F-01, S-01) added RLS and `POST /api/children` without changing the middleware contract ([parent-auth plan](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/context/changes/parent-auth-and-reading-level/plan.md#L24-L59)).

### Session pipeline (risk #2 — authentication)

**Middleware** resolves the user once per request and guards only HTML prefixes in `PROTECTED_ROUTES`:

```4:24:src/middleware.ts
const PROTECTED_ROUTES = ["/dashboard"];
// ...
  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }
```

- [`src/middleware.ts`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/src/middleware.ts#L4-L24) — `getUser()` → `context.locals.user`; Supabase unset → `user = null`.
- [`src/env.d.ts`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/src/env.d.ts#L1-L5) — only `user` on `App.Locals`.
- [`src/lib/supabase.ts`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/src/lib/supabase.ts#L6-L24) — `createServerClient` with cookie `getAll`/`setAll`; no service-role client in app code.

**API routes** are not in `PROTECTED_ROUTES`; each parent handler checks `context.locals.user` independently (documented in S-01 plan). Inventory:

| Route | Unauthenticated behavior |
|-------|--------------------------|
| `POST /api/children` | 303 → `/auth/signin` ([children.ts](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/src/pages/api/children.ts#L10-L12)) |
| `POST /api/flashcards/generate`, accept, reject | 401 JSON ([generate.ts](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/src/pages/api/flashcards/generate.ts#L25-L29)) |
| `POST /api/practice/start`, review, end | 401 JSON (same pattern) |
| `GET /api/mastery/summary` | 401 JSON ([summary.ts](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/src/pages/api/mastery/summary.ts#L17-L19)) |
| `POST /api/auth/signin`, signup, signout | Public |

**Gaps for #2 tests:**

- New parent pages under paths other than `/dashboard` are unprotected until added to `PROTECTED_ROUTES` ([AGENTS.md](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/AGENTS.md#L9)).
- Dashboard has a meta refresh fallback if `user` is missing ([dashboard.astro](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/src/pages/dashboard.astro#L86)) — middleware is primary.
- Test fixtures: sign in via `POST /api/auth/signin` and replay `Set-Cookie`; cookie names are Supabase-managed (not hardcoded in repo).

### Authorization boundary (risk #1 — IDOR / tenancy)

**Application layer:** Every child-scoped API calls `getMyChild(supabase, user.id)` then passes only `child.id` into services — never a body `child_id`:

- [`src/lib/services/children.ts`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/src/lib/services/children.ts#L17-L29) — `.eq("parent_user_id", parentUserId)`.
- Accept/reject: `generationId` from body + `childId` from `getMyChild` — [`flashcards.ts`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/src/lib/services/flashcards.ts#L88-L92).
- Practice: `sessionId` / `flashcardId` paired with server `childId` — [`practice-session.ts`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/src/lib/services/practice-session.ts#L93-L105).

**Database layer:** Migration `20260526143400_reading_domain_schema.sql`:

- [`is_my_child`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/supabase/migrations/20260526143400_reading_domain_schema.sql#L200-L216) — `SECURITY DEFINER`, filters `parent_user_id = auth.uid()`.
- [`children` policies](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/supabase/migrations/20260526143400_reading_domain_schema.sql#L231-L246) — direct `parent_user_id` check.
- Domain tables (`flashcard_generations`, `flashcards`, `practice_sessions`, `practice_attempts`) — `is_my_child(child_id)` ([policies](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/supabase/migrations/20260526143400_reading_domain_schema.sql#L248-L320)).
- Policies are `TO authenticated` only — no `anon` policies on domain tables.

**Residual risks:** Misconfigured `SUPABASE_KEY` (service role) would bypass RLS; future APIs accepting `childId` from the client without `getMyChild` would weaken the app layer (RLS still helps if JWT is correct).

### Test infrastructure (Phase 1 bootstrap gap)

| Present | Missing |
|---------|---------|
| Auth/RLS production code | Vitest, `npm test`, `vitest.config.*` |
| `npm run lint` / `build` in CI | `*.test.ts` / `*.spec.ts` (zero files) |
| Manual verification norms in S-01/F-01 plans | CI test step (deferred to test-plan Phase 4) |

- [`package.json`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/package.json#L5-L13) — no `test` script.
- [`AGENTS.md`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/AGENTS.md#L24-L36) — states no automated test runner (stale vs test-plan).
- [`.github/workflows/ci.yml`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/.github/workflows/ci.yml#L19-L25) — lint + build only.

**Test-plan constraints for implementation:**

- Cheapest layer: unit + integration; defer Playwright unless cookies cannot be exercised ([test-plan.md](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/context/foundation/test-plan.md#L54-L55), [#86](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/context/foundation/test-plan.md#L86-L87)).
- Do not depend on `supabase start` in CI without explicit infra ([§7](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/context/foundation/test-plan.md#L152-L154)).
- Anti-pattern: mocking internal services so RLS never runs ([§2 risk #1](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/context/foundation/test-plan.md#L54)).

## Code References

- `src/middleware.ts:4-24` — `PROTECTED_ROUTES`, session → `locals.user`
- `src/lib/supabase.ts:6-24` — SSR cookie client (test harness hook)
- `src/lib/services/children.ts:17-29` — `getMyChild` ownership filter
- `src/pages/api/children.ts:10-12` — 303 unauth (outlier vs 401)
- `src/pages/api/flashcards/generate.ts:25-29` — canonical 401 JSON pattern
- `supabase/migrations/20260526143400_reading_domain_schema.sql:200-320` — RLS + `is_my_child`
- `package.json:5-13` — no test script yet
- `context/foundation/test-plan.md:70` — Phase 1 goals and risks #1–#2

## Architecture Insights

1. **Defense in depth:** Middleware (pages) → inline API auth → `getMyChild` → service `.eq("child_id", …)` → Supabase JWT → RLS.
2. **Convention drift:** S-01 chose form POST + 303 for children; S-02+ JSON APIs use 401 — tests must assert per-endpoint contracts.
3. **Single child per parent:** Unique index + `getMyChild` assume one row; no `child_id` selector in APIs yet.
4. **ESLint lesson L-001:** Service modules use file-wide unsafe-type disables; tests should prefer primitive assertions or typed fixtures, not weakening ESLint ([lessons.md](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/context/foundation/lessons.md#L7-L40)).

## Historical Context (from prior changes)

- **F-01 `reading-domain-schema`:** Landed RLS/`is_my_child`; no API routes; manual Studio RLS A/B ([plan.md](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/context/changes/reading-domain-schema/plan.md#L83-L86), [#190-196](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/context/changes/reading-domain-schema/plan.md#L190-L196)).
- **S-01 `parent-auth-and-reading-level`:** `POST /api/children`, dashboard onboarding, explicit “no test runner” ([plan.md](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/context/changes/parent-auth-and-reading-level/plan.md#L14-L15), [#272-280](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/context/changes/parent-auth-and-reading-level/plan.md#L272-L280)).
- **S-02+:** JSON `fetch()` APIs standardized on 401 ([ai-flashcard-generation plan](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/context/changes/ai-flashcard-generation/plan.md)).
- **Deployment phase 3:** Manual production auth smoke ([phase-3-record.md](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/context/changes/deployment/phase-3-record.md)).
- **`context/archive/`:** No archived auth changes yet.

## Related Research

- [`context/changes/llm-flashcard-provider/research.md`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/context/changes/llm-flashcard-provider/research.md) — API template from S-01 (`children.ts` auth pattern)
- [`context/changes/srs-adapter/research.md`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/43fc9f3b731aef3c38b1f858474fa209cfdc473a/context/changes/srs-adapter/research.md) — domain services (practice/mastery build on same child scoping)

## Open Questions

1. **RLS in CI without Supabase CLI:** Use in-memory policy tests, Testcontainers, or hosted test project? Test-plan forbids agent-driven `supabase start` on Windows; plan phase should pick one strategy.
2. **Astro API route testing:** Vitest + `astro:env` mocking vs extracting handlers to testable modules — needs a spike in `/10x-plan`.
3. **Coverage breadth:** Test all eight parent APIs or a representative matrix (children 303 + one 401 JSON + one IDOR vector)?
4. **Update AGENTS.md** when Vitest lands — currently contradicts test-plan Phase 1.

## Suggested test matrix (for `/10x-plan`)

### Risk #2 (authn)

- `GET /dashboard` without cookies → redirect to `/auth/signin`
- Each parent API without session → 401 JSON except `POST /api/children` → 303
- `POST /api/auth/signin` → `Set-Cookie` → representative parent API succeeds

### Risk #1 (authz)

- Parent A session + Parent B `generationId` on accept → no mutation (404 / empty batch)
- Parent B `sessionId` on Parent A practice review/end → session not found
- (If RLS test harness exists) Parent A JWT cannot `select` Parent B `children` row
