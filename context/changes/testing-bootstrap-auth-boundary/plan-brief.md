# Bootstrap + Auth Boundary — Plan Brief

> Full plan: `context/changes/testing-bootstrap-auth-boundary/plan.md`
> Research: `context/changes/testing-bootstrap-auth-boundary/research.md`

## What & Why

Test-plan Phase 1 installs Vitest and proves the two highest-priority failure scenarios for a parent-facing Supabase app: **unauthenticated callers must not reach protected dashboard routes or parent APIs** (risk #2), and **one family must not read or mutate another's child, flashcards, or practice data** (risk #1). The starter already ships cookie auth and RLS; this change makes those boundaries executable in `npm test` instead of manual smoke only.

## Starting Point

RafcioCzyta has middleware guarding `/dashboard`, eight parent APIs with inline `context.locals.user` checks, and `getMyChild`-scoped service calls backed by RLS — but **no Vitest**, no `npm test`, and CI runs lint + build only. Research mapped the 303 vs 401 split on `POST /api/children` and documented all integration points (`research.md`).

## Desired End State

Developers with a **hosted test Supabase project** and `.env.test` run `npm test` and get a green suite that fails fast if env is missing. Representative unauthenticated contracts and cross-parent IDOR cases (accept batch + practice session) run against real JWT + RLS. Handler logic lives in `src/lib/api-handlers/` for tested routes; test-plan cookbook §6.1–6.4 documents how to add the next test.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| RLS proof | Hosted test Supabase project | Real JWT + policies execute; matches test-plan anti-pattern on mocking DB away | Plan |
| API test harness | Extract handlers under `src/lib/api-handlers/` | Fast Vitest calls without dev server; thin page re-exports keep Astro routes | Plan |
| Auth API coverage | Representative matrix + shared helpers | Cost × signal; covers 303 vs 401 split and dashboard redirect | Plan / Research |
| Auth refactor | Tests only — no `requireAuth` helper | Smallest diff; Phase 1 is test bootstrap not API redesign | Plan |
| Fixtures | Checked-in SQL seed + manual apply | Deterministic UUIDs; agent never runs Docker on Windows | Plan |
| IDOR scenarios | Accept `generationId` + practice `sessionId` + RLS smoke | Two foreign-key shapes plus policy proof | Plan / Research |
| Missing `.env.test` | Fail fast | Forces explicit test-project setup | Plan |
| CI `npm test` | Out of scope | test-plan Phase 4 owns quality gates | Research / test-plan |

## Scope

**In scope:**

- Vitest, `npm test`, `.env.test.example`, fail-fast env guard
- Handler extraction for representative routes under test
- Unauthenticated tests (dashboard, children 303, JSON 401 samples)
- Hosted seed SQL, sign-in helpers, cross-parent IDOR + RLS smoke
- `AGENTS.md` update; test-plan §6.1–6.4 cookbook fill-in

**Out of scope:**

- GitHub Actions test job (Phase 4)
- `requireAuth` consolidation or 303→401 behavior change
- All eight APIs exhaustively; Playwright e2e
- Deck generation, practice SRS logic, OpenAI (Phases 2–3)

## Architecture / Approach

```
npm test
  ├─ unit: middleware guard, env smoke
  └─ integration (requires .env.test → hosted Supabase)
        ├─ signInAs(A|B) via auth handler + cookies
        ├─ handler(context) with real createClient → RLS applies
        └─ assert 401/303 (no user) or no cross-parent mutation
```

Production routes stay Astro `src/pages/api/*`; handlers hold logic. Test project seed supplies Parent B IDs for foreign-key IDOR attempts while Parent A is authenticated.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Vitest toolchain & test env | `npm test`, config, fail-fast, docs | `astro:env` not wired in Vitest → import failures |
| 2. Handler extraction + authn | Representative 401/303 + dashboard tests | Refactor drift from page behavior |
| 3. Hosted fixtures + authz | Seed SQL, IDOR + RLS integration | Seed/auth config wrong on test project |
| 4. Cookbook & test-plan sync | §6.1–6.4 patterns for future tests | Docs out of sync with actual helpers |

**Prerequisites:** Dedicated Supabase test project; operator can run SQL seed manually; Node 22 per `.nvmrc`.

**Estimated effort:** ~3–4 focused sessions across 4 phases.

## Open Risks & Assumptions

- Test project Auth settings (email confirmation) must allow programmatic sign-in or tests flake.
- Seed SQL for `auth.users` may need project-specific adjustments (Supabase version / triggers).
- `SUPABASE_KEY` in tests must remain **anon** key so RLS is meaningful; service role would invalidate risk #1 proof.
- Fail-fast means contributors without `.env.test` cannot run any tests until configured.

## Success Criteria (Summary)

- `npm test` proves unauthenticated protected surfaces return redirect or 401, not data.
- Parent A cannot mutate Parent B's generation or practice session via API with real Supabase.
- Cookbook sections let the next change add endpoint tests without re-deriving harness design.
