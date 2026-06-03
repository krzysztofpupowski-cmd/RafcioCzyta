# Bootstrap + Auth Boundary Implementation Plan

## Overview

Test-plan Phase 1 (`context/foundation/test-plan.md` §3 row 1): install **Vitest**, add a repeatable **hosted Supabase test project** workflow, and prove **risks #1 and #2** on the existing starter auth stack (middleware + per-route checks + `getMyChild` + RLS). No `requireAuth` refactor, no CI test job (deferred to test-plan Phase 4), no Playwright in this change.

## Current State Analysis

- **Auth shipped with bootstrap** (`10x-astro-starter`, `has_auth: true`): `@supabase/ssr` cookie client in `src/lib/supabase.ts`, middleware sets `context.locals.user` and guards only `PROTECTED_ROUTES = ["/dashboard"]` (`src/middleware.ts:4-24`).
- **Eight parent APIs** each inline-check `context.locals.user`; JSON routes return **401** `{ ok: false, error: "Musisz być zalogowany." }`; `POST /api/children` returns **303** → `/auth/signin` (`src/pages/api/children.ts:10-12`).
- **Authorization**: child-scoped APIs resolve `child.id` via `getMyChild(supabase, user.id)` only — no client `child_id`. RLS on domain tables uses `is_my_child()` / `parent_user_id = auth.uid()` (`supabase/migrations/20260526143400_reading_domain_schema.sql:200-320`).
- **No test runner**: `package.json` has no `test` script; `AGENTS.md` still says manual-only; CI runs lint + build only (`.github/workflows/ci.yml`).

## Desired End State

- `npm test` runs Vitest locally and **fails fast** if `.env.test` (or documented test env vars) is missing.
- **Risk #2**: Representative unauthenticated checks — `/dashboard` redirect, `POST /api/children` → 303, at least one JSON parent API → 401, plus `GET /api/mastery/summary` → 401; documented pattern for adding more routes in test-plan §6.4.
- **Risk #1**: On a **hosted test Supabase project** with SQL-seeded Parent A/B — cross-parent `generationId` on accept does not mutate B's data; cross-parent `sessionId` on practice review/end fails closed; optional direct Supabase client proves Parent A JWT cannot `select` Parent B's `children` row (RLS smoke).
- **Handler extraction** in place for tested routes; thin `src/pages/api/*` re-exports preserve Astro contracts.
- `AGENTS.md` and test-plan cookbook §6.1–6.4 updated so future agents follow the same patterns.

### Key Discoveries

- Defense in depth: middleware (pages) → API auth → `getMyChild` → service filters → JWT → RLS (`context/changes/testing-bootstrap-auth-boundary/research.md`).
- `astro:env/server` imports require Vitest/Vite aliasing or env injection — do not mock away Supabase in integration tests (`test-plan.md` §2 risk #1 anti-pattern).
- Agent shell must not run `supabase start` on Windows (`AGENTS.md`); seed apply is **manual** (SQL editor or user terminal).

## What We're NOT Doing

- Wiring `npm test` into GitHub Actions (test-plan Phase 4).
- Introducing a shared `requireAuth` helper or changing `POST /api/children` from 303 to 401.
- Exhaustive unauthenticated tests on all eight parent APIs in Phase 1.
- Playwright / browser e2e for cookie flows.
- Real OpenAI calls or deck-generation / practice business-logic tests (Phases 2–3).
- Running `supabase start` / Docker from the agent.

## Implementation Approach

1. Bootstrap Vitest with `@/` path alias, `astro:env/server` test doubles, and a **fail-fast** env module loaded before integration suites.
2. Extract request logic from **representative** API routes into `src/lib/api-handlers/`; keep `prerender = false` and `APIRoute` exports in page files.
3. Add **unit-level** middleware test (synthetic `APIContext`) and **integration** tests that sign in via `POST /api/auth/signin` against the hosted project.
4. Ship **SQL seed** + setup doc for the test project; integration tests assume seed IDs documented in `tests/fixtures/README.md` (or env vars for UUIDs).
5. Update foundation cookbook sections so Phase 2+ can copy patterns.

## Critical Implementation Details

**Vitest + Astro virtual modules:** Production imports `astro:env/server` and middleware imports `astro:middleware` — `process.env` / `test.env` alone do not satisfy those imports. Use `tests/setup.ts` to load `.env.test` into `process.env`, then Vitest `resolve.alias`: `astro:env/server` → `tests/stubs/astro-env-server.ts`, `astro:middleware` → `tests/stubs/astro-middleware.ts`. Stubs read `process.env` (`SUPABASE_URL`, `SUPABASE_KEY`, and `OPENAI_API_KEY` when generate handlers load). Prefer the anon/publishable key (not service role) so RLS applies. Do not import production handlers before setup runs.

**Fail-fast:** A shared `requireTestEnv()` (or Vitest `globalSetup`) throws with a single actionable message listing `.env.test.example` if any required variable is absent — per planning decision; no silent skip of integration suites.

**Seed apply:** `tests/fixtures/seed.sql` targets the **test** Supabase project only. Document that operators run it manually once (Supabase SQL editor). Seed must create two `auth.users` (or use Supabase Auth Admin patterns documented in fixture README), two `children` rows, at least one `flashcard_generations` + `flashcards` draft batch per parent, and one `practice_sessions` row per parent for IDOR vectors.

## Phase 1: Vitest Toolchain & Test Env

### Overview

Install Vitest, `npm test`, env contract, and test helpers without touching production API behavior.

### Changes Required:

#### 1. Dependencies and scripts

**File**: `package.json`

**Intent**: Add Vitest as devDependency and expose `npm test` / `npm run test:watch` for local verification.

**Contract**: `devDependencies` includes `vitest` (and `@vitest/coverage-v8` only if needed later — omit in Phase 1). `scripts.test` runs `vitest run`; optional `test:watch` runs `vitest`.

#### 2. Vitest configuration

**File**: `vitest.config.ts` (new)

**Intent**: Run tests in Node with ESM, resolve `@/*` like `tsconfig.json`, load `tests/setup.ts` for env + path aliases.

**Contract**: `test.include` → `tests/**/*.test.ts`; `resolve.alias` `@` → `./src`, `astro:env/server` → `tests/stubs/astro-env-server.ts`, `astro:middleware` → `tests/stubs/astro-middleware.ts`; `setupFiles` includes env bootstrap; exclude `dist`, `.astro`.

#### 3. Astro test stubs

**Files**: `tests/stubs/astro-env-server.ts` (new), `tests/stubs/astro-middleware.ts` (new)

**Intent**: Satisfy production imports of `astro:env/server` and `astro:middleware` under Vitest without the Astro compiler.

**Contract**: `astro-env-server.ts` re-exports `SUPABASE_URL`, `SUPABASE_KEY`, `OPENAI_API_KEY` from `process.env` (empty string if unset). `astro-middleware.ts` exports `defineMiddleware` as a pass-through wrapper around the handler fn. Aliases wired in `vitest.config.ts` (see § Critical Implementation Details).

#### 4. Environment contract

**Files**: `.env.test.example` (new), `tests/helpers/env.ts` (new)

**Intent**: Document required variables for hosted test project; fail fast when missing.

**Contract**: Example documents at minimum `SUPABASE_URL`, `SUPABASE_KEY` (anon), `OPENAI_API_KEY` (dummy e.g. `sk-test-dummy` — required when Phase 2 imports generate handler / `flashcard-generation.ts`), `TEST_PARENT_A_EMAIL`, `TEST_PARENT_A_PASSWORD`, `TEST_PARENT_B_EMAIL`, `TEST_PARENT_B_PASSWORD`, and stable UUIDs for cross-parent IDs (`TEST_PARENT_B_GENERATION_ID`, `TEST_PARENT_B_SESSION_ID`) populated after seed. `requireTestEnv()` throws with pointer to `.env.test.example` if any required key is empty.

#### 5. Agent and contributor docs

**Files**: `AGENTS.md`, `.env.example`

**Intent**: Replace "no automated test runner" with Vitest + `.env.test` requirement; note test project is separate from production.

**Contract**: Build/Test section lists `npm test` and states integration tests require `.env.test` copied from `.env.test.example`. Hard rule unchanged: agent does not run Supabase CLI/Docker on Windows.

#### 6. Smoke test

**File**: `tests/smoke/env.test.ts` (new)

**Intent**: Prove toolchain runs and fail-fast triggers when env is wrong.

**Contract**: One test calls `requireTestEnv()` and asserts defined strings; second test optional `describe.skip` not used — fail-fast is global.

### Success Criteria:

#### Automated Verification:

- `npm test` executes Vitest (fails with clear message when `.env.test` absent)
- `npm run lint` passes
- `npm run build` passes (with `SUPABASE_URL` / `SUPABASE_KEY` set as today)

#### Manual Verification:

- Copy `.env.test.example` → `.env.test` with real test-project values; `npm test` runs smoke suite green

**Implementation Note**: After automated checks pass, confirm manual env copy before Phase 2.

---

## Phase 2: Handler Extraction & Risk #2 (Authentication)

### Overview

Extract testable handlers for the representative route matrix; assert unauthenticated access contracts without a logged-in session.

### Changes Required:

#### 1. Handler module layout

**Directory**: `src/lib/api-handlers/` (new)

**Intent**: Hold pure `APIRoute`-compatible functions that accept Astro `APIContext` and return `Response` / redirect, mirroring existing logic.

**Contract**: New modules (names illustrative): `auth-signin-post.ts`, `children-post.ts`, `flashcards-generate-post.ts`, `flashcards-accept-post.ts`, `practice-review-post.ts`, `practice-end-post.ts`, `mastery-summary-get.ts`. Each exports one named handler function moved verbatim from the current page file (auth check, supabase null check, validation, service calls). `auth-signin-post.ts` is required for Phase 3 `signInAs` (form body + cookie `setAll` via `createClient`).

#### 2. Thin API route re-exports

**Files**: `src/pages/api/auth/signin.ts`, `src/pages/api/children.ts`, `src/pages/api/flashcards/generate.ts`, `src/pages/api/flashcards/accept.ts`, `src/pages/api/practice/review.ts`, `src/pages/api/practice/end.ts`, `src/pages/api/mastery/summary.ts`

**Intent**: Page files become thin wrappers so Astro routing unchanged; behavior identical.

**Contract**: `export const POST` / `GET` delegates to handler import; `prerender = false` retained.

#### 3. Synthetic API context helper

**File**: `tests/helpers/api-context.ts` (new)

**Intent**: Build minimal `APIContext` for handler tests (URL, method, headers, cookies stub, `locals.user = null`).

**Contract**: Factory accepts `{ method, pathname, headers?, body?, cookies?, locals? }` and returns object assignable to handler/middleware parameter type. Default `locals.user = null`. `cookies` must implement `get`/`set`/`delete` (or AstroCookies-compatible stub) so `createClient(headers, cookies)` in middleware and sign-in handlers does not throw before auth/redirect logic runs.

#### 4. Middleware auth tests

**File**: `tests/middleware/protected-routes.test.ts` (new)

**Intent**: Prove risk #2 for `/dashboard` without full HTTP server.

**Contract**: Import `onRequest` from `src/middleware.ts` with synthetic context from `api-context` helper (including cookie stub); unauthenticated request to `/dashboard` yields redirect to `/auth/signin`; unauthenticated `/` proceeds. Fallback to testing only the `PROTECTED_ROUTES` guard extract only if full middleware import remains blocked after stubs.

#### 5. Unauthenticated API matrix

**File**: `tests/integration/authn-protected-apis.test.ts` (new)

**Intent**: Representative risk #2 coverage per test-plan and planning decisions.

**Contract**:

| Case | Expected |
|------|----------|
| `postChildren` handler, no user | 303, `Location` sign-in |
| `postGenerate` (or chosen JSON route), no user | 401, `{ ok: false }` |
| `getMasterySummary`, no user | 401 |
| One practice handler (`review` or `start`), no user | 401 |

Optional positive control: `POST /api/auth/signin` with test Parent A credentials returns `Set-Cookie`; one handler with cookies + user stubbed or real sign-in returns non-401 (smoke only, no domain mutation). **Prerequisite:** test-project auth users only (manual or minimal auth setup) — full `seed.sql` with generation/session UUIDs is Phase 3.

### Success Criteria:

#### Automated Verification:

- `npm test` — all Phase 2 tests pass with valid `.env.test` (sign-in smoke may need seeded users)
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Hit `/dashboard` logged out in browser — still redirects to sign-in (no regression)

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Hosted Fixtures & Risk #1 (Authorization)

### Overview

SQL seed for Parent A/B on hosted test project; integration tests for cross-parent IDOR and RLS smoke.

### Changes Required:

#### 1. Fixture SQL and documentation

**Files**: `tests/fixtures/seed.sql` (new), `tests/fixtures/README.md` (new)

**Intent**: Deterministic two-parent dataset for IDOR and RLS tests; manual apply workflow.

**Contract**: Seed creates Parent A and B (auth + `children`), Parent B owns a draft `flashcard_generations` row with known UUID, Parent B owns an active `practice_sessions` row with known UUID; README lists apply steps (SQL editor), mapping UUIDs → `.env.test` vars, and **never** run against production.

#### 2. Auth session helper

**File**: `tests/helpers/auth-session.ts` (new)

**Intent**: Obtain cookie header for Parent A/B via `POST /api/auth/signin` (handler or `fetch` to local preview only if handlers insufficient — prefer calling `signin` handler with test env).

**Contract**: `signInAs(parent: 'A' | 'B'): Promise<Headers>` calls `auth-signin-post` handler with test credentials and returns `Set-Cookie` / `Cookie` headers suitable for `createClient` / handler context (no preview-server `fetch` unless handler path fails).

#### 3. RLS smoke

**File**: `tests/integration/authz-rls-smoke.test.ts` (new)

**Intent**: Prove JWT-bound client cannot read other family's `children` row.

**Contract**: Parent A Supabase client (user JWT from sign-in) `select` on Parent B `children.id` returns empty or error — not a service mock.

#### 4. Cross-parent IDOR integration

**File**: `tests/integration/authz-cross-parent.test.ts` (new)

**Intent**: Prove risk #1 for accept + practice paths.

**Contract**:

- Parent A session + `POST` accept with Parent B `generationId` → **404** and `error: "Ta partia nie oczekuje już na akceptację."` (no row update; optional count query)
- Parent A session + practice `review` with Parent B `sessionId` → **404** and `error: "Sesja ćwiczeniowa nie została znaleziona lub została zakończona."`
- Parent A session + practice `end` with Parent B `sessionId` → **404** and `error: "Sesja ćwiczeniowa nie została znaleziona."` — assert JSON `error` + status, not internal service constant names

Use real handlers + real Supabase client from cookies; do not mock `acceptBatch` / `recordPracticeReview`.

### Success Criteria:

#### Automated Verification:

- `npm test` — RLS smoke + cross-parent tests pass against hosted test project
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Operator applied `seed.sql` to test project; spot-check in Supabase Table Editor that A/B children and B's generation/session IDs match `.env.test`

**Implementation Note**: Pause for manual seed confirmation before Phase 4.

---

## Phase 4: Cookbook & Test-Plan Sync

### Overview

Record patterns in foundation test-plan so Phase 2 deck work can copy them.

### Changes Required:

#### 1. Cookbook sections

**File**: `context/foundation/test-plan.md`

**Intent**: Replace §6.1–6.4 TBD stubs with concrete patterns from this change.

**Contract**:

- §6.1 — unit example (env/middleware or zod-free helper)
- §6.2 — integration with `signInAs` + handler + hosted Supabase
- §6.3 — still “deferred / integration preferred”
- §6.4 — unauthenticated 401/303 + cross-parent IDOR template

#### 2. Per-phase notes

**File**: `context/foundation/test-plan.md` §6.6

**Intent**: Link Phase 1 rollout to `testing-bootstrap-auth-boundary` and date shipped.

**Contract**: Short bullet under §6.6 referencing change folder and representative matrix choice.

#### 3. Change status

**File**: `context/changes/testing-bootstrap-auth-boundary/change.md`

**Intent**: Mark change planned → ready for implement.

**Contract**: After Phase 4 docs land, set `status: ready_for_implement` and `updated: <ship date>` (not `planned`).

### Success Criteria:

#### Automated Verification:

- `npm test` still passes
- `npm run lint` passes

#### Manual Verification:

- Read §6.2 and §6.4 — a new contributor can add a test for a hypothetical `POST /api/foo` without re-reading the full plan

---

## Testing Strategy

### Unit Tests

- `requireTestEnv()` / smoke
- Middleware protected-route guard with `locals.user = null`

### Integration Tests

- Unauthenticated handler matrix (303 vs 401 contracts)
- Authenticated sign-in cookie smoke
- RLS `children` select across parents
- Cross-parent accept `generationId` and practice `sessionId`

### Manual Testing Steps

1. Create dedicated Supabase test project; disable email confirm or use test inboxes per README.
2. Apply `tests/fixtures/seed.sql`; copy UUIDs into `.env.test`.
3. Run `npm test` locally; confirm fail-fast without `.env.test`.
4. Logged-out browser: `/dashboard` → sign-in.

## Performance Considerations

Integration tests hit hosted Supabase over network — keep suite small (representative matrix). Parallelize cautiously (`vitest` pool) to avoid auth rate limits on free tier.

## Migration Notes

No production schema migration. Test project seed is idempotent only if README documents wipe/reseed steps.

## References

- Research: `context/changes/testing-bootstrap-auth-boundary/research.md`
- Test plan: `context/foundation/test-plan.md` (§3 Phase 1, §2 risks #1–#2, §7 exclusions)
- Bootstrap auth: `context/changes/bootstrap-verification/verification.md`
- S-01 auth pattern: `context/changes/parent-auth-and-reading-level/plan.md`
- RLS migration: `supabase/migrations/20260526143400_reading_domain_schema.sql`
- Lessons: `context/foundation/lessons.md` (L-001 — avoid weakening ESLint in tests; use primitive assertions)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Vitest Toolchain & Test Env

#### Automated

- [x] 1.1 `npm test` runs Vitest and fails fast with clear message when `.env.test` is absent — 1aaf7ef
- [x] 1.2 `npm run lint` passes — 1aaf7ef
- [x] 1.3 `npm run build` passes — 1aaf7ef

#### Manual

- [x] 1.4 `.env.test` populated from example — smoke suite passes locally — 1aaf7ef

### Phase 2: Handler Extraction & Risk #2 (Authentication)

#### Automated

- [x] 2.1 `npm test` — middleware and unauthenticated API matrix pass — c9e0ab7
- [x] 2.2 `npm run lint` passes — c9e0ab7
- [x] 2.3 `npm run build` passes — c9e0ab7

#### Manual

- [x] 2.4 Logged-out `/dashboard` still redirects to sign-in in browser — c9e0ab7

### Phase 3: Hosted Fixtures & Risk #1 (Authorization)

#### Automated

- [x] 3.1 `npm test` — RLS smoke and cross-parent IDOR tests pass — 3cfe4a2
- [x] 3.2 `npm run lint` passes — 3cfe4a2
- [x] 3.3 `npm run build` passes — 3cfe4a2

#### Manual

- [x] 3.4 `seed.sql` applied to test project; Table Editor IDs match `.env.test` — 3cfe4a2

### Phase 4: Cookbook & Test-Plan Sync

#### Automated

- [x] 4.1 `npm test` still passes
- [x] 4.2 `npm run lint` passes

#### Manual

- [x] 4.3 test-plan §6.2 / §6.4 readable as standalone cookbook for next endpoint
