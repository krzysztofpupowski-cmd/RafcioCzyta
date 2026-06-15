# E2E Browser Coverage — Implementation Plan

## Overview

Add two focused Playwright specs that cover browser-only gaps in risks #2 and #5 that Vitest integration tests structurally cannot reach: (1) sign-out cookie clearing verified by a second dashboard visit, and (2) the optimistic-UI accept flow in `FlashcardDashboardCard` verified by a `page.reload()` that triggers the untested `listAcceptedFlashcards` SSR path.

## Current State Analysis

The Playwright infrastructure is production-ready: `playwright.config.ts`, `tests/e2e/auth.setup.ts`, and two passing specs exist. All three tests are green.

**Risk #2 gap:** `tests/e2e/unauthenticated-dashboard-redirect.spec.ts` already covers cold-start unauthenticated redirect (heading + URL). The **sign-out** path — clicking "Wyloguj", clearing the cookie, and verifying the subsequent `/dashboard` visit redirects — has zero coverage anywhere (no Vitest test for sign-out either).

**Risk #5 gap:** `FlashcardDashboardCard` is `client:only="react"` — every post-mutation UI transition is invisible to Vitest. `listAcceptedFlashcards` is called only from `dashboard.astro:54` during SSR; it has never been exercised by any test. The `handleAccept` handler updates `draftBatches` and `acceptedCards` via `useState` only — no re-fetch — so a `page.reload()` is the only way to verify the SSR re-seed produces the correct output.

### Key Discoveries

- `src/pages/api/auth/signout.ts` — `POST /api/auth/signout` calls `supabase.auth.signOut()` + redirects to `/` (root, not `/auth/signin`)
- `src/pages/dashboard.astro:99-106` — sign-out button: `<button type="submit">Wyloguj</button>` inside `<form method="POST" action="/api/auth/signout">`. Accessible name: `"Wyloguj"`.
- `src/components/flashcards/FlashcardDashboardCard.tsx:108-111` — `handleAccept` filters draftBatches and prepends accepted cards; does NOT call `setActiveTab("accepted")`; user stays on "Przygotowane" tab after accept.
- `src/components/flashcards/DraftBatchPanel.tsx:42` — accept button `aria-label`: `"Akceptuj partię fiszek z ${dateLabel}"` (date-suffixed, use partial match `getByRole('button', { name: /Akceptuj partię/ })`).
- `src/components/flashcards/FlashcardDashboardCard.tsx:225-226` — prepared empty state text: `"Brak fiszek oczekujących na akceptację."`
- `supabase/migrations/20260526143400_reading_domain_schema.sql:92-99` — `flashcard_generations`: only `child_id` + `requested_level` are required (`model`, `prompt_version` are nullable). `flashcards`: `child_id`, `generation_id`, `level`, `front_text` required; `status` defaults to `'draft'`.
- `tests/helpers/openai-mock.ts` — Vitest-only (`vi.mock`); cannot be reused in Playwright. Playwright mocks at the HTTP API boundary via `page.route`.
- `.env.test.example:17` — `TEST_PARENT_A_CHILD_ID=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1` is available in `process.env` inside Playwright tests (loaded by `loadEnvFile` in `playwright.config.ts`).
- `tests/integration/flashcards-generate.test.ts:47-54` — cleanup pattern: `supabase.from('flashcards').delete().eq('generation_id', id)` then `supabase.from('flashcard_generations').delete().eq('id', id)`. Reuse in `afterEach`.

## Desired End State

After this plan:

1. `tests/e2e/auth-signout-redirect.spec.ts` exists and passes — it signs out via the UI, then navigates to `/dashboard` and asserts the middleware redirect fires.
2. `tests/e2e/flashcard-accept-reload.spec.ts` exists and passes — it seeds a draft batch, clicks "Generuj" (intercepted by `page.route` mock at HTTP layer), accepts the batch, asserts the UI update, then reloads and asserts the SSR-reseed via `listAcceptedFlashcards`.
3. All existing E2E tests continue to pass.
4. `npm run test:e2e` exits 0.

Verification: `npm run test:e2e` — all specs green.

Agent verification note: `npm run test:e2e` uses Playwright's `webServer` config, which can start `npm run dev`. Per repository rules on Windows, the agent should not start long-running dev server commands through its shell. The human should run `npm run test:e2e` and paste the result back, or provide an already-running compatible `PLAYWRIGHT_BASE_URL`.

### Key Discoveries

- `@supabase/supabase-js` (v2.99) is a direct dependency. Playwright `beforeEach`/`afterEach` can use `createClient(url, key)` + `supabase.auth.signInWithPassword(email, password)` directly — no path alias (`@/`) required in E2E spec files.
- RLS INSERT policies for `flashcard_generations` and `flashcards` allow the `authenticated` role to insert rows for their own child. Seeding in `beforeEach` using the anon key + signInWithPassword is sufficient; no service-role key is needed.
- The mock for `/api/flashcards/generate` at the HTTP layer (`page.route`) intercepts the browser's `fetch` call before it reaches the dev server. The mock response must include the `freshGenId` (from the DB seed) so that the subsequent real `POST /api/flashcards/accept` call finds real rows in the DB.
- `page.route` handlers are scoped to the `page` fixture — no explicit `unroute` needed in `afterEach`.

## What We're NOT Doing

- **Network-level 302 assertion** (`waitForResponse` on raw `/dashboard` response) — medium-priority per research; sign-out is the higher-value gap.
- **Reject two-step UX** — medium-priority per research; out of scope for this change.
- **Meta-refresh fallback** (`dashboard.astro:84`) — low-priority.
- **Cross-widget mastery event** after accept — low-priority, separate concern.
- **Adding E2E to CI** — orthogonal to this change; tracked separately in `context/foundation/test-plan.md §5`.
- **Modifying `flashcard-generation.ts`** — no source code changes; mocking is entirely in the test layer.

## Implementation Approach

Two independent specs, each with `beforeEach`/`afterEach` for clean state isolation:

**Phase 1** adds a single test in an authenticated context that proves sign-out clears the session cookie — using the real Astro form submission path, not a stub.

**Phase 2** uses a dual-track seed: a Supabase JS client seeds a real draft batch in the DB (so `POST /api/flashcards/accept` finds real rows), while `page.route` intercepts the generate HTTP call from the browser and returns the seeded `generationId` + cards as the mock response (so the UI is seeded without calling OpenAI).

## Critical Implementation Details

**page.route must be registered before page.goto in Phase 2.** The `page.route` intercept is registered in `beforeEach` after the DB seed (so `freshGenId` is known), but the `page.goto('/dashboard')` call inside the test happens after `beforeEach` completes. Playwright resolves routes lazily, so the order `beforeEach: route → test: goto` is correct.

**Supabase client in beforeEach is a fresh Node.js client, not the browser session.** Use `import { createClient } from '@supabase/supabase-js'` (not `@/lib/supabase`). After `signInWithPassword`, the client JWT is set on the client internally and RLS runs as Parent A for all subsequent queries.

**Playwright process env and app server env must target the same hosted test Supabase project.** The Node-side seed runs in the Playwright process, while the real browser `POST /api/flashcards/accept` runs through the app server. Before seeding, fail fast if required E2E env vars are missing, and document that `.env`, `.env.test`, and `.dev.vars` / the running server env must not point at different Supabase projects.

**Accept button has a date-suffix in its aria-label.** `DraftBatchPanel` renders `aria-label={\`Akceptuj partię fiszek z ${dateLabel}\`}`where`dateLabel`is the Polish locale date. Use`getByRole('button', { name: /Akceptuj partię/ })` (partial regex) to avoid locale/date fragility.

---

## Phase 1: Sign-out Auth Redirect Spec

### Overview

A new authenticated spec verifies that clicking "Wyloguj" clears the Supabase session cookie; a subsequent navigation to `/dashboard` must land at `/auth/signin`, not render protected content.

### Changes Required

#### 1. New E2E spec file

**File**: `tests/e2e/auth-signout-redirect.spec.ts`

**Intent**: An authenticated test that exercises the sign-out form POST, waits for the redirect to `/`, then navigates to `/dashboard` and asserts the middleware redirect fires — proving the cookie was actually cleared by `supabase.auth.signOut()`.

**Contract**: Uses the default `storageState` (Parent A session from `playwright/.auth/user.json`). No `test.use({ storageState: ... })` override needed. File-level comment citing risk #2 (pattern from `unauthenticated-dashboard-redirect.spec.ts`).

Test body outline:

- `page.goto('/dashboard')` + assert "Profil dziecka" heading visible (confirms authenticated state before sign-out)
- `page.getByRole('button', { name: 'Wyloguj' }).click()` — submits `POST /api/auth/signout`
- `page.waitForURL('/')` — signout handler redirects to root
- `page.goto('/dashboard')` — second visit with cleared cookie
- `page.waitForURL(/\/auth\/signin$/)` + `expect(page).toHaveURL(/\/auth\/signin$/)`
- `expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()`

### Success Criteria

#### Automated Verification

- `npm run test:e2e` exits 0 with `auth-signout-redirect.spec.ts` listed as passed
- Existing specs continue to pass (no regression)
- `npm run lint` exits 0 on the new file

#### Manual Verification

- Run `npm run test:e2e` locally — all specs green in the terminal reporter
- Inspect `playwright-report/index.html` — no failed or flaky tests

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 2. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Flashcard Accept + Reload Spec

### Overview

A new authenticated spec that seeds a real draft batch in the DB, mocks the generate HTTP API endpoint so the browser receives the seeded batch without calling OpenAI, accepts the batch via UI clicks, asserts the optimistic state update, then reloads the page and asserts that `listAcceptedFlashcards` (the previously untested SSR path) correctly surfaces the accepted cards.

### Changes Required

#### 1. New E2E spec file

**File**: `tests/e2e/flashcard-accept-reload.spec.ts`

**Intent**: Exercises the full accept + reload flow: DB seed → HTTP mock → UI accept → optimistic state check → SSR reload verification. Proves that `listAcceptedFlashcards` and the optimistic `handleAccept` mutation are consistent.

**Contract**: Uses the default `storageState` (authenticated as Parent A). `beforeEach` / `afterEach` are test-scoped (not `beforeAll`) to keep each test independently runnable per AGENTS.md rules.

**`beforeEach` contract** (all in Node.js, before any page interaction; assign `freshGenId`, `freshCards`, `freshFrontText1`, and `freshFrontText2` to test-scoped variables so the test body and cleanup can assert against them):

```ts
// 1. Supabase client — direct import, no path alias
import { createClient } from "@supabase/supabase-js";
const env = requireE2EEnv(); // validates SUPABASE_URL, SUPABASE_KEY, TEST_PARENT_A_* before seeding
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
await supabase.auth.signInWithPassword({
  email: env.TEST_PARENT_A_EMAIL,
  password: env.TEST_PARENT_A_PASSWORD,
});

// 2. Insert fresh draft batch
const childId = env.TEST_PARENT_A_CHILD_ID;
const uniqueSuffix = `${Date.now()}-${test.info().parallelIndex}`;
freshFrontText1 = `e2e-card-${uniqueSuffix}-1`;
freshFrontText2 = `e2e-card-${uniqueSuffix}-2`;
const { data: gen } = await supabase
  .from("flashcard_generations")
  .insert({ child_id: childId, requested_level: "letters" })
  .select("id")
  .single();
freshGenId = gen!.id;

const { data: cards } = await supabase
  .from("flashcards")
  .insert([
    { child_id: childId, generation_id: freshGenId, level: "letters", front_text: freshFrontText1 },
    { child_id: childId, generation_id: freshGenId, level: "letters", front_text: freshFrontText2 },
  ])
  .select("id, front_text");
freshCards = cards!;

// 3. Wire HTTP mock for generate before page navigation
await page.route("/api/flashcards/generate", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      generationId: freshGenId,
      requestedLevel: "letters",
      cards: freshCards.map((c) => ({ id: c.id, front_text: c.front_text, hint_text: null, level: "letters" })),
    }),
  }),
);
```

**Test body outline**:

- `page.goto('/dashboard')` + assert "Generuj 8 fiszek" button visible (confirms child profile exists)
- `page.getByRole('button', { name: 'Generuj 8 fiszek' }).click()` — intercepted by `page.route`; mock response feeds draft batch to UI optimistic state
- Wait for the draft batch panel to appear: `expect(page.getByRole('button', { name: /Akceptuj partię/ })).toBeVisible()`
- Click `page.getByRole('button', { name: /Akceptuj partię/ })` — real `POST /api/flashcards/accept` with `freshGenId`; finds real DB rows; returns accepted cards
- Assert the fresh batch left the prepared tab: the unique `freshFrontText1` / `freshFrontText2` values are no longer visible while the prepared tab is active (do **not** require the global prepared empty state, because seeded fixture draft batches may still exist)
- Navigate to Zaakceptowane tab: `page.getByRole('tab', { name: 'Zaakceptowane' }).click()`
- Assert accepted cards visible: at least one element in the accepted tabpanel contains `freshFrontText1` or `freshFrontText2`
- `page.reload()` — triggers SSR re-render; `dashboard.astro:53-54` calls `listDraftBatches` + `listAcceptedFlashcards`
- After reload, click "Zaakceptowane" tab (activeTab resets to "prepared" on every full page load)
- Assert the same unique accepted cards are still visible — proves `listAcceptedFlashcards` returns the accepted rows

**`afterEach` contract** (same Supabase client instance, or a fresh one):

```ts
if (freshGenId) {
  await supabase.from("flashcards").delete().eq("generation_id", freshGenId);
  await supabase.from("flashcard_generations").delete().eq("id", freshGenId);
}
```

### Success Criteria

#### Automated Verification

- `npm run test:e2e` exits 0 with `flashcard-accept-reload.spec.ts` listed as passed
- All existing specs continue to pass
- `npm run lint` exits 0 on the new file
- `freshGenId` rows are absent in the DB after the test run (cleanup verified by running the test twice consecutively without seed collisions)

#### Manual Verification

- Run `npm run test:e2e` locally — all specs green
- Inspect `playwright-report/index.html` — no flaky retries
- Confirm that after a test run, the seeded generation and flashcards are not visible in the Supabase dashboard (cleanup is complete)

---

## Testing Strategy

### Automated checks only (no unit tests)

Each spec is its own E2E test. No Vitest unit tests are added in this change — the Vitest layer already covers the server-side logic (state machine, API auth, RLS). The browser layer is the signal we're after.

### Manual Testing Steps

1. Run `npm run test:e2e` — auth setup plus 4 browser specs (2 existing + 2 new) pass.
2. Check `playwright-report/index.html` — no retries, all green.
3. For Phase 2, run the spec twice consecutively — second run must not fail due to leftover DB state (cleanup verified).
4. Temporarily set `TEST_PARENT_A_EMAIL` to a wrong value and rerun — Phase 2 `beforeEach` should throw a clear error, not silently seed with bad data.

If an agent is driving this plan, the human runs the E2E commands above when they would start the dev server through Playwright's `webServer` setting; the agent can still run `npm run lint` directly.

## References

- Research: `context/changes/e2e-browser-coverage/research.md`
- Existing unauthenticated spec: `tests/e2e/unauthenticated-dashboard-redirect.spec.ts`
- Exemplar seed spec: `tests/e2e/seed.spec.ts`
- Cleanup pattern: `tests/integration/flashcards-generate.test.ts:47-54`
- Sign-out handler: `src/pages/api/auth/signout.ts`
- Signout button: `src/pages/dashboard.astro:99-106`
- Accept optimistic handler: `src/components/flashcards/FlashcardDashboardCard.tsx:95-122`
- DraftBatchPanel aria-labels: `src/components/flashcards/DraftBatchPanel.tsx:42,56,79`
- DTO shapes: `src/lib/dto/flashcards.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Sign-out Auth Redirect Spec

#### Automated

- [ ] 1.1 `npm run test:e2e` passes with `auth-signout-redirect.spec.ts` listed as passed
- [ ] 1.2 Existing specs still pass (no regression)
- [x] 1.3 `npm run lint` exits 0 on `auth-signout-redirect.spec.ts`

#### Manual

- [ ] 1.4 All specs green in terminal reporter; `playwright-report/index.html` shows no failures

### Phase 2: Flashcard Accept + Reload Spec

#### Automated

- [ ] 2.1 `npm run test:e2e` passes with `flashcard-accept-reload.spec.ts` listed as passed
- [ ] 2.2 All existing specs still pass
- [x] 2.3 `npm run lint` exits 0 on `flashcard-accept-reload.spec.ts`
- [ ] 2.4 Test passes on second consecutive run (cleanup verified — no DB state bleed)

#### Manual

- [ ] 2.5 Auth setup plus 4 browser specs green in `playwright-report/index.html`; no retries logged
- [ ] 2.6 Seeded generation + flashcards absent from Supabase dashboard after test run
