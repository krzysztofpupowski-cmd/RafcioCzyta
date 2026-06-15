# E2E Browser Coverage — Plan Brief

> Full plan: `context/changes/e2e-browser-coverage/plan.md`
> Research: `context/changes/e2e-browser-coverage/research.md`

## What & Why

Add two Playwright specs that close browser-only gaps in risks #2 and #5. Vitest cannot observe cookie-clearing after sign-out, nor can it see the `client:only="react"` optimistic UI mutations in `FlashcardDashboardCard` or the `listAcceptedFlashcards` SSR path that only runs on `page.reload()`.

## Starting Point

Playwright infrastructure is live and green: `playwright.config.ts`, an auth setup project, and two passing specs (`unauthenticated-dashboard-redirect.spec.ts` + `seed.spec.ts`). `@supabase/supabase-js` is already a direct dependency. No source code changes are required — everything is in the test layer.

## Desired End State

Two new spec files pass in `npm run test:e2e`: (1) a sign-out spec that proves the auth cookie is cleared and `/dashboard` redirects after sign-out, and (2) an accept+reload spec that seeds a real draft batch, accepts it via UI clicks with an HTTP-layer mock for the generate endpoint, and verifies the accepted cards survive a full `page.reload()`.

## Key Decisions Made

| Decision          | Choice                                                                      | Why (1 sentence)                                                                                                                       | Source          |
| ----------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Phase 1 scope     | Sign-out flow only                                                          | Research rates sign-out as the highest-priority gap (#2); network 302 assertion is medium-priority                                     | Research        |
| Phase 2 seeding   | `beforeEach` Supabase JS client inserts fresh generation + cards            | Fresh seed per test prevents shared-state pollution; reuses the cleanup pattern from `flashcards-generate.test.ts`                     | Plan            |
| LLM mock strategy | `page.route('/api/flashcards/generate', ...)` returns seeded `generationId` | Intercepts browser's HTTP call without touching source code; seeded `generationId` ensures real `/api/flashcards/accept` finds DB rows | Plan            |
| Reject flow       | Out of scope                                                                | Medium-priority per research; accept+reload is the high-value gap                                                                      | Research + Plan |
| E2E in CI         | Not wired in this change                                                    | Orthogonal concern; tracked in `test-plan.md §5`                                                                                       | Plan            |

## Scope

**In scope:**

- `tests/e2e/auth-signout-redirect.spec.ts` — sign-out clears cookie; `/dashboard` redirects
- `tests/e2e/flashcard-accept-reload.spec.ts` — accept batch + `page.reload()` persists accepted cards

**Out of scope:**

- Reject two-step UX, meta-refresh fallback, cross-widget mastery event
- Network-level 302 assertion
- E2E wiring in CI workflow
- Any modifications to `src/` application code

## Architecture / Approach

Phase 1 uses the default authenticated `storageState`; the form submit triggers a real `POST /api/auth/signout` (server clears the cookie), Playwright follows the redirect to `/`, then the test navigates to `/dashboard` and asserts the middleware redirect fires.

Phase 2 uses a dual-track seed: a Node.js Supabase client (direct `@supabase/supabase-js` import, `signInWithPassword`) inserts a fresh `flashcard_generations` + `flashcards` row so `/api/flashcards/accept` finds real DB data. `page.route` intercepts the browser's `fetch /api/flashcards/generate` call and returns the seeded `generationId` — LLM is never called, but the accept → reload path exercises real DB reads/writes and the previously untested `listAcceptedFlashcards` function.

## Phases at a Glance

| Phase                     | What it delivers                                                | Key risk                                                                                                                        |
| ------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1. Sign-out redirect spec | Proves sign-out clears the auth cookie; `/dashboard` redirects  | Sign-out button selector may differ if markup changes                                                                           |
| 2. Accept + reload spec   | Proves `handleAccept` + `listAcceptedFlashcards` are consistent | `beforeEach` Supabase client needs valid env vars from `.env.test`; seeded `TEST_PARENT_A_CHILD_ID` must match the test project |

**Prerequisites:** `.env.test` configured against the hosted test project; `TEST_PARENT_A_EMAIL`, `TEST_PARENT_A_PASSWORD`, `TEST_PARENT_A_CHILD_ID` set; dev server running (or started by `webServer` in `playwright.config.ts`).  
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- The child profile for Parent A in the test project must have `childExists = true` (child row present with a known level) so "Generuj 8 fiszek" button renders. If the test project was recently reset, running `seed.spec.ts` first ensures the child exists.
- `listAcceptedFlashcards` ordering (`order("updated_at", { ascending: false })`) may diverge from the optimistic `[...data.cards, ...prev]` order after reload — the test should assert card presence by `front_text`, not by position.

## Success Criteria (Summary)

- `npm run test:e2e` exits 0 with auth setup plus 4 browser specs (2 existing + 2 new) green.
- Running the Phase 2 spec twice consecutively does not fail (cleanup verified).
- Sign-out spec fails if `supabase.auth.signOut()` is removed from the handler — regression protection confirmed.
