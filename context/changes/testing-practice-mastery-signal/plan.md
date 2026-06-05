# Practice + Mastery Signal Implementation Plan

## Overview

Test-plan Phase 3 (`context/foundation/test-plan.md` §3 row 3): cover **risk #7** — "Completing a practice session doesn't advance SRS state or the mastery indicator the parent sees on dashboard." Unit-test the FSRS adapter contract; integration-test the practice flow (start → review → end) end-to-end against the hosted Supabase test project with direct DB-state assertions; integration-test the mastery summary handler including the ≥90 threshold via a small ts-fsrs-backed test helper. Extract `src/pages/api/practice/start.ts` POST handler to mirror the Phase 2 reject extraction. No CI test job (test-plan Phase 4) and no Playwright in this change.

## Current State Analysis

- **Practice service** (`src/lib/services/practice-session.ts`): `countDueCards` (`:26-46`), `startPracticeSession` (`:48-87`), `recordPracticeReview` (`:89-190`), `endPracticeSession` (`:192-250`). All filter on `status='accepted'`, `not("next_review_at","is",null)`, `lte("next_review_at", nowIso)`. Six `PRACTICE_ERROR_*` constants declared — `NO_DUE_CARDS`, `SESSION_NOT_FOUND`, `CARD_NOT_IN_SESSION`, `CARD_ALREADY_REVIEWED`, `INVALID_SRS_STATE`, `NO_CHILD_LEVEL`. **`CARD_NOT_IN_SESSION` and `NO_CHILD_LEVEL` are declared but never thrown by this file** — dead code; we will not test them.
- **Review handler** (`src/lib/api-handlers/practice-review-post.ts`): translates `CARD_ALREADY_REVIEWED` → 400 + `"Ta fiszka została już oceniona w tej sesji."`, `INVALID_SRS_STATE` → 400 + `"Nie udało się odczytać stanu powtórki tej fiszki."`, `SESSION_NOT_FOUND` → 404 + `"Sesja ćwiczeniowa nie została znaleziona lub została zakończona."`, anything else → 500 + `"Wystąpił błąd serwera. Spróbuj ponownie."`.
- **End handler** (`src/lib/api-handlers/practice-end-post.ts`): translates `SESSION_NOT_FOUND` → 404 + `"Sesja ćwiczeniowa nie została znaleziona."`. `endPracticeSession` is **idempotent**: if `session.ended_at` is already set, the service returns the existing `endedAt` without re-updating (`practice-session.ts:211-213`).
- **Start route** (`src/pages/api/practice/start.ts`) is **still inlined** — the `POST` handler body lives in the page file, parallel to where `reject.ts` was before Phase 2. Translates `NO_DUE_CARDS` → 404 + `"Brak fiszek do powtórki."`, no-child → 400, no-child-level → 400 + `"Ustaw poziom czytania dziecka, aby rozpocząć ćwiczenie."`.
- **Mastery service** (`src/lib/services/mastery-indicator.ts`): `getMasterySummary` selects accepted+level rows, parses `srs_state` via `storedSrsStateSchema`, **skips null and malformed states silently** (the malformed branch logs `"getMasterySummary: invalid srs_state, skipping row"` via `console.warn`), and counts cards whose `masteryScoreFromCard(fromStored(state), now) >= MASTERY_THRESHOLD (90)`. Returns `{ acceptedCount, masteredCount, percentMastered }`; `percentMastered` rounds to int and is `0` when `acceptedCount === 0`.
- **SRS adapter** (`src/lib/services/srs-adapter.ts`): `initSrsState(now)` returns `{ stored, nextReviewAt: card.due, reps_count: 0, last_reviewed_at: null, mastery_score: 0 }`; `applyReview(card, rating, now)` schedules via `fsrs().next(...)` and returns `{ stored, nextReviewAt, reps_count, last_reviewed_at, mastery_score, practice_outcome }`; `ratingToPracticeOutcome(rating)` → `"incorrect"` when `rating <= Rating.Hard` (so Again=1 and Hard=2), `"correct"` for Good=3 / Easy=4. `masteryScoreFromCard(card, now)` is `Math.round(scheduler.get_retrievability(card, now, false) * 100)`.
- **Phase 1 + 2 toolchain in place**: `tests/setup.ts`, `vitest.config.ts` aliases, `tests/helpers/api-context.ts`, `tests/helpers/auth-session.ts`, `tests/helpers/env.ts` (`requireTestEnv` + `UUID_KEYS`), `tests/helpers/openai-mock.ts` (not used by Phase 3), `tests/fixtures/seed.sql` (Parent A draft batch + Parent B draft + Parent B open session).
- **Existing Phase 1 coverage**: `postPracticeReview` and `getMasterySummary` have 401 cases (`tests/integration/authn-protected-apis.test.ts`); `postPracticeReview` and `postPracticeEnd` have cross-parent 404 IDOR cases (`tests/integration/authz-cross-parent.test.ts`). **Practice start has neither.**
- **Seed lacks Parent A accepted+due cards.** Decision (interview Q5): build them programmatically in each integration file's `beforeAll` (insert draft → `postAcceptFlashcards` to install real SRS → `UPDATE next_review_at` to the past). No seed extension, no new env var — mirrors Phase 2 case 3/case 5 pattern.
- **L-001 ESLint constraint** (`context/foundation/lessons.md`): any service/handler we touch keeps its file-wide ESLint disable block.
- **Database schema** (`supabase/migrations/20260526143400_reading_domain_schema.sql`): `practice_attempts` has `(child_id, session_id, flashcard_id, outcome, answered_at)` with RLS scoped via `is_my_child(child_id)` and composite FKs binding `session_id ↔ child_id` and `flashcard_id ↔ child_id`. The test will assert one row per review with the expected `outcome`.

## Desired End State

- **Risk #7 (SRS update path)**: `tests/integration/practice-flow.test.ts` drives `postPracticeStart → postPracticeReview (×2 with Good then Again) → postPracticeEnd` against Parent A and asserts after each review that the targeted `flashcards` row has `srs_state` non-null and changed, `next_review_at` advanced to the future (Good ratings) or to a near-now learning step (Again), `reps_count` incremented, `last_reviewed_at` set to a recent timestamp, and `mastery_score` non-null. After both reviews, a direct `practice_attempts` SELECT shows two rows for the session with `outcome` `"correct"` then `"incorrect"` respectively.
- **Risk #7 (mastery signal)**: `tests/integration/mastery-summary.test.ts` calls `getMasterySummaryHandler` against Parent A in four scenarios: (a) no accepted cards → `{0,0,0}`; (b) one accepted card with a synthetic mastered `srs_state` installed via `buildMasteredSrsState()` → `acceptedCount=1, masteredCount=1, percentMastered=100`; (c) two accepted cards (one mastered, one fresh) → `{2,1,50}`; (d) one accepted card with null `srs_state` plus one mastered → `{2,1,50}` (null skipped silently, no crash).
- **SRS adapter contract** locked at `tests/unit/srs-adapter.test.ts`: `initSrsState` shape; `applyReview` advances `reps_count` and `nextReviewAt` for each of the four ratings; `ratingToPracticeOutcome` maps Again/Hard → `"incorrect"` and Good/Easy → `"correct"`; `masteryScoreFromCard` returns 0–100 integer.
- **Practice start handler extracted**: `src/lib/api-handlers/practice-start-post.ts` exports `postPracticeStart`; `src/pages/api/practice/start.ts` is a thin re-export. Behaviour unchanged.
- **Authn matrix completion**: `postPracticeStart` **and** `postPracticeEnd` 401 cases added to `tests/integration/authn-protected-apis.test.ts` so every parent-scoped practice API has at least an unauthenticated case (test-plan §6.4 rule).
- **Practice error matrix at the review handler**: integration cases for `CARD_ALREADY_REVIEWED` → 400 + Polish copy, `INVALID_SRS_STATE` → 400 + Polish copy, `SESSION_NOT_FOUND` → 404 + Polish copy. Plus `postPracticeStart` `NO_DUE_CARDS` → 404 + `"Brak fiszek do powtórki."` (against a child with no accepted-due rows). Plus `postPracticeEnd` idempotency (second call returns same `endedAt`).
- **Test helper**: `tests/helpers/srs-fixture.ts` exposes `buildMasteredSrsState(now?)` that uses ts-fsrs (`applyReview` against a fresh card with `Good`/`Easy` ratings) to land on a `StoredSrsState` whose `get_retrievability(now)` is ≥ 0.9. Asserts before returning. No magic numbers.
- **Cookbook §6.6** in `context/foundation/test-plan.md` documents the practice-flow integration pattern (programmatic accept + `UPDATE next_review_at` + direct DB-state assertions) and the `buildMasteredSrsState` helper pattern. Per-rollout-phase notes renumber to §6.7. Phase 3 row in §3 flips to `complete` (matching Phase 1/2 wording); §6.7 gains a Phase 3 bullet referencing this change.
- `npm test`, `npm run lint`, `npm run build` all green on a populated `.env.test`; `change.md` → `status: ready_for_implement`.

### Key Discoveries

- `endPracticeSession` is idempotent (`src/lib/services/practice-session.ts:211-213`) — a second call returns the existing `ended_at` rather than mutating the row. We assert this directly.
- `recordPracticeReview` does **not** check that the flashcard belongs to the session's seeded card set — it only requires `status='accepted'` on the flashcard and (implicitly) RLS-passing child ownership. So "card not in session" is not a real failure mode; the duplicate-attempt unique check is what guards repeated reviews.
- `PRACTICE_ERROR_CARD_NOT_IN_SESSION` and `PRACTICE_ERROR_NO_CHILD_LEVEL` are exported but unreachable in `practice-session.ts`. We do not test dead code.
- The synthetic-mastered path uses **ts-fsrs's own scheduler**: `buildMasteredSrsState` calls `applyReview(fromStored(state), Rating.Good)` in a small loop until `masteryScoreFromCard(card) >= MASTERY_THRESHOLD`. This keeps the test honest — the same library production uses computes the threshold — and avoids hand-rolled magic numbers in the stored JSON.
- The mastered-card install is a **direct `supabase.from("flashcards").update({ srs_state: stored })`** call on an already-accepted Parent A card. RLS applies (anon client + signed-in session). This avoids overlapping with `acceptBatch`'s SRS init, which always starts from `createEmptyCard` (reps=0, mastery=0).
- Phase 1 used the all-zero-UUID pattern in the unauthenticated 401 cases for review (`tests/integration/authn-protected-apis.test.ts:59-62`). For `postPracticeStart` 401 the request has no body, so this is even simpler.
- `practice_attempts` RLS scopes by `is_my_child(child_id)` and the composite FKs enforce session ↔ flashcard ↔ child alignment, so Parent A's anon client cannot read rows from other parents — direct SELECT after review will only return the rows the test created.
- Programmatic accept uses the production handler (`postAcceptFlashcards`), which exercises `initSrsState` for free — every test setup that wants "accepted+due" cards goes through the real SRS-init code path, then UPDATE's only `next_review_at` to a past timestamp.

## What We're NOT Doing

- CI wiring of `npm test` (test-plan §3 Phase 4).
- Playwright / browser e2e (test-plan §6.3 deferred; integration suffices for risk #7).
- Re-asserting auth boundaries already covered in Phase 1 (review 401, mastery 401, review cross-parent IDOR, end cross-parent IDOR).
- Testing dead error constants (`PRACTICE_ERROR_CARD_NOT_IN_SESSION`, `PRACTICE_ERROR_NO_CHILD_LEVEL`).
- Refactoring `recordPracticeReview` to add session-membership checks. The current contract is "any accepted card for this parent + non-duplicate attempt"; we test what exists.
- Snapshotting `/practice` or `/dashboard` UI. Risk #7 assertions are direct DB SELECTs after handler calls.
- Extending `tests/fixtures/seed.sql` or `tests/helpers/env.ts` `REQUIRED_KEYS` — Phase 3 setup is programmatic to avoid the operator-reseed friction Phase 2 caused.
- Adding `@vitest/coverage-v8` or coverage gates.
- Editing `eslint.config.js` `ignores` (L-001) or weakening any lint rule.
- Asserting Polish copy on success responses — only error-message assertions where the parent-facing string is a contract (per test-plan §6.4).
- Testing every individual rating in the integration layer (Hard / Easy stay at the unit layer — interview Q3 decision).

## Implementation Approach

1. Stand up the SRS-adapter unit + extract `practice/start.ts` POST handler so the rest of Phase 3 can drive every practice route via a `postPractice*` handler call (Phase 1).
2. Build the programmatic accepted-due fixture in `beforeAll` and write the practice-flow integration file: happy path (Good + Again), error matrix at review (`CARD_ALREADY_REVIEWED`, `INVALID_SRS_STATE`, `SESSION_NOT_FOUND`), and `endPracticeSession` idempotency. Also add the `postPracticeStart` `NO_DUE_CARDS` 404 case and the 401 case to `authn-protected-apis.test.ts` (Phase 2).
3. Ship `tests/helpers/srs-fixture.ts` and the mastery-summary integration file. Four cases: empty, one mastered, mixed mastered/fresh, null `srs_state` skipped (Phase 3).
4. Promote the patterns into `test-plan.md` §6.6, renumber per-phase notes to §6.7, flip Phase 3 row to `complete`, mark this change `ready_for_implement` (Phase 4).

Each phase ends with `npm test && npm run lint && npm run build` green and a commit.

## Critical Implementation Details

- **`buildMasteredSrsState` must self-verify before returning** — call `masteryScoreFromCard(fromStored(result))` and throw if `< MASTERY_THRESHOLD` so a future ts-fsrs tuning change fails the helper, not a downstream test with a confusing assertion. Cap the loop at ~20 iterations and throw if mastery never crosses.
- **Direct `srs_state` UPDATE bypasses `initSrsState`** — the mastery tests install the mastered JSON via `supabase.from("flashcards").update({ srs_state: stored, next_review_at: <future>, reps_count: <from stored>, last_reviewed_at: <iso>, mastery_score: <score> })`. We update **all five** SRS columns to keep production invariants happy (mastery_score column may be read elsewhere) — the source of truth for the test assertion is `srs_state` because that is what `getMasterySummary` recomputes from.
- **`UPDATE next_review_at` after `postAcceptFlashcards`** — accept installs `next_review_at = card.due`, which `createEmptyCard` sets to roughly "now + 0" (immediately due) but ts-fsrs may schedule learning-step delays. Tests that need "definitely due now" UPDATE explicitly to a fixed past timestamp (`'2000-01-01T00:00:00Z'`) after accept. Without this, the practice-flow file is flaky against the scheduler's initial steps.
- **Practice-flow test ordering** — happy path (review×2) leaves the session row in `ended_at: null` until the explicit `postPracticeEnd` case. The `CARD_ALREADY_REVIEWED` case reuses one of those reviewed cards (re-submitting review against the same flashcardId+sessionId). Keep that case in the same `describe` block so the in-memory `sessionId` + `flashcardId` are still in scope. Reset between blocks via `afterAll`.
- **`INVALID_SRS_STATE` test setup** — UPDATE a Parent A accepted card with `srs_state: { malformed: true }` (an object that fails `storedSrsStateSchema.safeParse`), then send a review for it. The handler should respond 400 + Polish text; direct DB SELECT after must show the row UN-changed (no partial mutation). Restore the card in `afterAll`.

## Phase 1: SRS Adapter Unit + Practice-Start Handler Extraction

### Overview

Lock the SRS adapter contract with cheap unit tests and unify the practice-route handler layout so Phase 2 can drive `postPracticeStart` like every other handler.

### Changes Required:

#### 1. Extract practice-start handler

**File**: `src/lib/api-handlers/practice-start-post.ts` (new)

**Intent**: Mirror `practice-end-post.ts` / `flashcards-accept-post.ts` so practice start is testable via a `postPracticeStart` handler call.

**Contract**: `export async function postPracticeStart(context: APIContext): Promise<Response>`. Body moved verbatim from `src/pages/api/practice/start.ts` `POST`: 401 if no user, 500 if no supabase client, `getMyChild` lookup with 500-on-throw and 400-on-null, 400 on missing `current_level`, `startPracticeSession` call, catch `PRACTICE_ERROR_NO_DUE_CARDS` → 404 + `"Brak fiszek do powtórki."`, default 500 + `"Wystąpił błąd serwera. Spróbuj ponownie."`. Keep the L-001 ESLint disable comment block at the top.

#### 2. Practice-start route re-export

**File**: `src/pages/api/practice/start.ts`

**Intent**: Make the page file a thin wrapper, matching `practice/review.ts` and `practice/end.ts`.

**Contract**: `export const prerender = false;` + `export const POST: APIRoute = postPracticeStart;` imported from `@/lib/api-handlers/practice-start-post`.

#### 3. SRS adapter unit test

**File**: `tests/unit/srs-adapter.test.ts` (new)

**Intent**: Prove the FSRS adapter contract without hosted Supabase. Acts as both regression guard and copy-paste reference for future SRS-touching work.

**Contract**: Five `describe` blocks:

- `initSrsState` — `reps_count === 0`, `last_reviewed_at === null`, `mastery_score === 0`, `stored.reps === 0`, `nextReviewAt instanceof Date`.
- `applyReview` × four ratings — for each of `Rating.Again`, `Rating.Hard`, `Rating.Good`, `Rating.Easy` applied to a fresh card: `reps_count === 1`, `last_reviewed_at` is a Date close to `now`, `stored.reps === 1`, `nextReviewAt` is a valid Date; `nextReviewAt > now` is asserted for `Good`/`Easy`, while `Again`/`Hard` assert schedule validity + state mutation without a strict future-time requirement, and `mastery_score` is an integer in `[0, 100]`.
- `ratingToPracticeOutcome` — `Again → "incorrect"`, `Hard → "incorrect"`, `Good → "correct"`, `Easy → "correct"`.
- `masteryScoreFromCard` — fresh card returns an integer in `[0, 100]`; after one `applyReview(card, Good)` the returned `mastery_score` matches `masteryScoreFromCard(fromStored(result.stored), now)`.
- `fromStored / toStored` round-trip — `fromStored(toStored(card))` preserves `difficulty`, `due.getTime()`, `stability`, `state`, `reps`, `lapses`.

No hosted Supabase, no `.env.test` dependencies.

### Success Criteria:

#### Automated Verification:

- `npm test` runs `tests/unit/srs-adapter.test.ts` green (no `.env.test` dependencies)
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Spot-check `/practice` start in dev (one local session start as the test user) — verifies the `practice/start.ts` re-export did not regress behaviour.

**Implementation Note**: After automated verification passes and manual start works, pause for explicit confirmation before Phase 2. Phase blocks use plain bullets; the canonical `## Progress` section owns the checkbox state.

---

## Phase 2: Practice Flow Integration + Authn Matrix Completion

### Overview

Drive `postPracticeStart → postPracticeReview ×2 → postPracticeEnd` against Parent A with direct DB-state assertions after each step. Add the review-error matrix and end-idempotency cases. Complete the test-plan §6.4 authn matrix by adding a `postPracticeStart` 401 case to `tests/integration/authn-protected-apis.test.ts`.

### Changes Required:

#### 1. Authn matrix — practice-start + practice-end 401

**File**: `tests/integration/authn-protected-apis.test.ts`

**Intent**: Cover both practice JSON handlers with unauthenticated cases per test-plan §6.4.

**Contract**: New 401 cases sibling to existing practice assertions:

- `it("postPracticeStart returns 401 JSON")`: builds `createApiContext({ method: "POST", pathname: "/api/practice/start" })` with no body (start has no body schema), calls `postPracticeStart(context)`, expects `response.status === 401`, `body.ok === false`, `body.error` truthy.
- `it("postPracticeEnd returns 401 JSON")`: builds `createApiContext({ method: "POST", pathname: "/api/practice/end", body: JSON.stringify({ sessionId: "<uuid>" }) })`, calls `postPracticeEnd(context)`, expects `response.status === 401`, `body.ok === false`, `body.error` truthy.

Imports: `postPracticeStart` from `@/lib/api-handlers/practice-start-post` and `postPracticeEnd` from `@/lib/api-handlers/practice-end-post`.

#### 2. Practice flow integration tests

**File**: `tests/integration/practice-flow.test.ts` (new)

**Intent**: Eight-case file exercising the full SRS-update path and the review/end error matrix under risk #7.

**Contract**: One signed-in Parent A session in `beforeAll` (`signInAs("A")`). Programmatic fixture: insert a fresh `flashcard_generations` row for the Parent A child, insert N draft `flashcards`, call `postAcceptFlashcards(makeAcceptContext(genId))` to install real SRS state, then `UPDATE flashcards SET next_review_at = '2000-01-01T00:00:00Z' WHERE generation_id = <genId>` so every card is definitively due. Track inserted generation IDs in `cleanupGenIds` and tear down in `afterAll`.

Cases:

1. **Happy path — start returns due cards, sessionId** — `postPracticeStart` returns 200; body `{ ok: true, sessionId, cards: PracticeCardDTO[], totalCount }`; `cards.length >= 2`. Capture `sessionId` and the first two `cards[].id` into `describe`-scope state.
2. **Review #1 — Good rating → correct outcome, SRS advanced** — `postPracticeReview({ sessionId, flashcardId: cards[0].id, rating: Rating.Good })` returns 200; body `{ ok: true, outcome: "correct", reviewedCount: 1 }`. Direct SELECT on the card shows `srs_state` non-null and different from a freshly accepted card (`reps >= 1`), `next_review_at` advanced (later than `'2000-01-01T00:00:00Z'`), `reps_count >= 1`, `last_reviewed_at` is a recent ISO timestamp, `mastery_score` non-null. Direct SELECT on `practice_attempts` shows one row with `session_id=sessionId, flashcard_id=cards[0].id, outcome='correct'`.
3. **Review #2 — Again rating → incorrect outcome, second attempt persisted** — `postPracticeReview({ sessionId, flashcardId: cards[1].id, rating: Rating.Again })` returns 200; body `outcome: "incorrect"`, `reviewedCount: 2`. SELECT on `practice_attempts` for the session returns two rows with outcomes `["correct", "incorrect"]` (order tolerant). SELECT on the reviewed card shows `reps_count >= 1` (note: ts-fsrs may keep `reps` at 1 on Again-during-learning but `last_reviewed_at` and `srs_state` definitely change — assert on those rather than `reps_count > previous`).
4. **Card already reviewed → 400 + Polish text** — repeat `postPracticeReview({ sessionId, flashcardId: cards[0].id, rating: Rating.Good })`; expect 400 + `"Ta fiszka została już oceniona w tej sesji."`; SELECT on `practice_attempts` shows row count unchanged (still 2).
5. **Invalid SRS state → 400 + Polish text** — UPDATE `flashcards SET srs_state = '{"malformed":true}'::jsonb WHERE id = <a third card from the fixture>`; `postPracticeReview` against that card returns 400 + `"Nie udało się odczytać stanu powtórki tej fiszki."`. SELECT on the card after shows `srs_state` UN-changed (still `{"malformed":true}`). Restore via UPDATE in `afterAll` only if the row survives cleanup.
6. **Session not found → 404 + Polish text** — `postPracticeReview({ sessionId: <random uuid>, flashcardId: cards[0].id, rating: Rating.Good })`; expect 404 + `"Sesja ćwiczeniowa nie została znaleziona lub została zakończona."`.
7. **End idempotency** — `postPracticeEnd({ sessionId })` returns 200 + `{ ok: true, sessionId, endedAt: <iso> }`; capture `endedAt`. Second `postPracticeEnd({ sessionId })` returns 200 + same `endedAt` (string equality). SELECT on `practice_sessions` confirms `ended_at` matches.

Plus one negative test outside the happy-path session:

8. **Practice start — no due cards → 404 + Polish text** — temporarily DELETE all due cards for the Parent A child (or use a child without any: actually we only have one Parent A child via `getMyChild` — easier to UPDATE all currently-accepted cards' `next_review_at` to a future ISO before calling start, then restore). `postPracticeStart` returns 404 + `"Brak fiszek do powtórki."`. Restore in `afterAll`.

Use `signInAs("A")` + `createApiContext` exactly like `tests/integration/flashcards-state-machine.test.ts`. Do not mock `recordPracticeReview` / `endPracticeSession` / `startPracticeSession`. Use the session's own Supabase client (anon, RLS-bound) for all SELECTs.

### Success Criteria:

#### Automated Verification:

- `npm test` — all ten Phase 2 cases pass (two in `authn-protected-apis.test.ts`, eight in `practice-flow.test.ts`) against the hosted test project with a populated `.env.test`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Spot-check `/practice` happy path in dev: start → rate one card → end. Confirms the practice-start extraction did not regress UI flow.

**Implementation Note**: After automated verification passes, confirm manual practice in dev before Phase 3.

---

## Phase 3: Mastery Summary Integration + SRS Fixture Helper

### Overview

Ship `tests/helpers/srs-fixture.ts` and the mastery-summary integration file. Cover the ≥90 threshold deterministically by installing a ts-fsrs-built mastered `srs_state` onto a Parent A accepted card, plus the empty/null/mixed edge cases.

### Changes Required:

#### 1. SRS test fixture helper

**File**: `tests/helpers/srs-fixture.ts` (new)

**Intent**: Single source of truth for "how do we land a deterministic mastered `srs_state` in a test", grounded in production's own ts-fsrs scheduler.

**Contract**: Exports `buildMasteredSrsState(now?: Date): { stored: StoredSrsState; mastery_score: number; reps_count: number; next_review_at: string; last_reviewed_at: string }`. Implementation: `let card = createEmptyCard(now)`. Apply `Rating.Good` (or `Easy`) up to `MAX_ITERATIONS = 20` times via the production `applyReview` helper from `@/lib/services/srs-adapter`; after each iteration check `masteryScoreFromCard(fromStored(toStored(card)), now)`. Stop when score `>= MASTERY_THRESHOLD (90)`. Throw `new Error("buildMasteredSrsState: did not reach mastery in <N> iterations")` if the loop exits without crossing — fails loud if ts-fsrs tuning changes. Return the full `{ stored, mastery_score, reps_count, next_review_at: nextReviewAt.toISOString(), last_reviewed_at: <Date>.toISOString() }` block ready for a Supabase `update`. Import `MASTERY_THRESHOLD` from `@/lib/services/mastery-indicator` — single source of truth.

#### 2. Mastery summary integration tests

**File**: `tests/integration/mastery-summary.test.ts` (new)

**Intent**: Prove the mastery indicator reads, parses, and thresholds `srs_state` end-to-end against hosted Supabase via `getMasterySummaryHandler`.

**Contract**: One signed-in Parent A session in `beforeAll`. Each case uses a programmatic fixture (insert generation + accept via `postAcceptFlashcards` + targeted UPDATE) and tears down in `afterAll`. The Parent A child is at `current_level: 'letters'` (from `seed.sql`) — assertions are scoped to that level. Each test starts by deleting any pre-existing accepted cards for Parent A's child at `level='letters'` so the count is deterministic. Restore is not needed because `afterAll` will sweep all inserted generation IDs.

Cases:

1. **Empty — no accepted cards** — pre-delete any Parent A accepted cards at level `letters`. Call `getMasterySummaryHandler(context)`. Expect 200, `body.ok === true`, `summary === { acceptedCount: 0, masteredCount: 0, percentMastered: 0 }`.
2. **Single mastered card** — insert a draft batch, accept it (1 card), UPDATE that one card with `buildMasteredSrsState()` results (srs_state, mastery_score, reps_count, last_reviewed_at, next_review_at). Call handler. Expect `summary === { acceptedCount: 1, masteredCount: 1, percentMastered: 100 }`.
3. **Mixed — one mastered, one fresh** — insert a 2-card draft batch, accept (both cards have `mastery_score=0` from `initSrsState`), UPDATE only the first card with `buildMasteredSrsState`. Expect `summary === { acceptedCount: 2, masteredCount: 1, percentMastered: 50 }`.
4. **Null `srs_state` skipped silently** — insert a 2-card draft batch, accept, UPDATE one card with `buildMasteredSrsState` and the other with `srs_state: null`. Expect `summary === { acceptedCount: 2, masteredCount: 1, percentMastered: 50 }`. Asserting the null card is **counted in `acceptedCount`** (it is `status='accepted'`) but not in `masteredCount`.

Cleanup strategy: track every inserted generation ID in `cleanupGenIds` and delete cards + generations in `afterAll`. Pre-test delete uses `supabase.from("flashcards").delete().eq("child_id", childId).eq("status","accepted").eq("level","letters")` — RLS-safe (Parent A's own data only).

### Success Criteria:

#### Automated Verification:

- `npm test` — all four cases in `mastery-summary.test.ts` pass
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Spot-check `/dashboard` mastery indicator renders the expected percentage for the test user after running the suite — confirms no regression in SSR consumer (`src/pages/dashboard.astro`).

**Implementation Note**: After Phase 3 automated tests pass, confirm dashboard mastery renders in dev before Phase 4. `buildMasteredSrsState` mastery threshold check should be the loudest failure path if ts-fsrs ever tunes away from the current behaviour.

---

## Phase 4: Cookbook §6.6 & Test-Plan Sync

### Overview

Promote the Phase 3 patterns into `context/foundation/test-plan.md` so a future contributor working on practice / mastery can copy without re-reading this plan. Mark Phase 3 shipped in §3 and the change `ready_for_implement`.

### Changes Required:

#### 1. Cookbook §6.6 — practice / mastery patterns

**File**: `context/foundation/test-plan.md`

**Intent**: New section `### 6.6 Adding a test for practice / mastery` modelled on §6.5's two-sub-pattern structure.

**Contract**: Two sub-patterns:

- **Sub-pattern A — Practice-flow integration via handlers**: snippet showing the programmatic fixture (`postAcceptFlashcards` + `UPDATE next_review_at` to past) plus a `postPracticeStart → postPracticeReview → postPracticeEnd` call with direct `practice_attempts` SELECT assertion. Note the end-idempotency contract.
- **Sub-pattern B — Mastery threshold via `buildMasteredSrsState`**: snippet showing how to install a mastered `srs_state` onto an accepted card via the helper. Note that the helper itself throws if the ts-fsrs tuning ever stops crossing the threshold — so a future "mastery test mysteriously breaks" failure points at the helper's own assertion message, not at the integration test.

Each sub-pattern follows the §6.2 / §6.5 prose style — under 40 lines including code.

#### 2. Renumber per-rollout-phase notes to §6.7

**File**: `context/foundation/test-plan.md`

**Intent**: Make room for §6.6 without disturbing existing in-file references.

**Contract**: Rename `### 6.6 Per-rollout-phase notes` to `### 6.7 Per-rollout-phase notes`. Update any cross-references within the document (search for `§6.6` and adjust to `§6.7` where they pointed at the per-phase notes; new §6.6 references are added in §6.5's "Phase 3 territory" pointer and §3 Phase 3 row).

#### 3. Phase 3 entry under §6.7

**File**: `context/foundation/test-plan.md` §6.7

**Intent**: Link Phase 3 rollout to this change folder and date shipped.

**Contract**: Append a bullet: `**Phase 3 — Practice + mastery signal** (shipped <date>): context/changes/testing-practice-mastery-signal/. SRS adapter unit on all four ratings; practice flow integration (start → review×2 → end) with direct practice_attempts assertion + review-error matrix + end-idempotency; mastery summary integration with buildMasteredSrsState helper landing the ≥90 threshold deterministically. Practice-start handler extracted to src/lib/api-handlers/practice-start-post.ts; authn matrix completed with postPracticeStart 401 case.`

#### 4. Rollout status row

**File**: `context/foundation/test-plan.md` §3

**Intent**: Move Phase 3's Status column to `complete` (mirroring Phase 1/2 wording) and confirm Change folder is `context/changes/testing-practice-mastery-signal/`.

**Contract**: Row 3: Status = `complete`, Change folder = `context/changes/testing-practice-mastery-signal/`.

#### 5. Change status

**File**: `context/changes/testing-practice-mastery-signal/change.md`

**Intent**: Mark change `ready_for_implement` once docs land.

**Contract**: Front-matter `status: ready_for_implement`, `updated: <ship date>`. Do not change `created`. Keep `archived_at: null`.

### Success Criteria:

#### Automated Verification:

- `npm test` still passes
- `npm run lint` passes

#### Manual Verification:

- Read §6.6 standalone — a contributor working on Phase 4 (CI quality gates) or a future practice / mastery enhancement can lift both sub-patterns without re-reading this plan
- `context/changes/testing-practice-mastery-signal/change.md` shows `status: ready_for_implement`

---

## Testing Strategy

### Unit Tests

- SRS adapter contract: `initSrsState` shape, `applyReview` for all four `Rating` values, `ratingToPracticeOutcome` mapping, `masteryScoreFromCard` range, `fromStored / toStored` round-trip (`tests/unit/srs-adapter.test.ts`).

### Integration Tests

- `postPracticeStart` 401 (`tests/integration/authn-protected-apis.test.ts`).
- Practice flow happy path: start → review (Good) → review (Again) → end (`tests/integration/practice-flow.test.ts` cases 1–3, 7).
- Practice review error matrix: card-already-reviewed 400, invalid srs_state 400, session-not-found 404 (cases 4–6).
- Practice start no-due-cards 404 (case 8).
- Mastery summary: empty, single mastered, mixed, null-srs-state-skipped (`tests/integration/mastery-summary.test.ts` cases 1–4).

### Manual Testing Steps

1. `/practice` start as the test user, rate one card, end the session — confirms practice-start extraction has not regressed UI flow.
2. `/dashboard` mastery indicator renders an integer percent for the test user — confirms `getMasterySummary` SSR consumer still works after Phase 3 lands.
3. Run `npm test` against a populated `.env.test`; verify ~17 new cases in green output (5 unit blocks ≈ 5–9 tests + 8 practice-flow + 4 mastery + 1 authn matrix).

## Performance Considerations

Phase 3 adds ~13 integration tests against hosted Supabase. Keep each file's matrix inside a single `describe` so Vitest's per-file isolation keeps sessions sequential. `buildMasteredSrsState` runs entirely in-process (no Supabase round-trip per iteration). If the suite drifts past ~30s overall, scope a `describe.serial` around the practice-flow happy path block before parallelising — Supabase free-tier auth + write rate limits make parallel runs flaky before they make the suite faster (same observation as Phase 2 plan).

## Migration Notes

- No production schema change.
- No new `.env.test` variables, no new seed UUIDs, no new `REQUIRED_KEYS` entry. Operator does not need to re-apply `tests/fixtures/seed.sql` for this phase. This is a deliberate departure from Phase 2 (decision recorded in interview Q5).
- No revert risk in production code — the only production-side change is extracting `practice/start.ts`'s `POST` into `src/lib/api-handlers/practice-start-post.ts` and re-exporting (behaviour preserved).

## References

- Test plan: `context/foundation/test-plan.md` (§2 risk #7, §3 row 3, §6.4 authn matrix, §6.6 TBD, §7 exclusions)
- Phase 1 plan + cookbook: `context/changes/testing-bootstrap-auth-boundary/plan.md`
- Phase 2 plan + cookbook: `context/changes/deck-generation-acceptance-gates/plan.md` (handler extraction precedent + programmatic fixture pattern)
- Production practice service: `src/lib/services/practice-session.ts`
- Production mastery service: `src/lib/services/mastery-indicator.ts`
- Production SRS adapter: `src/lib/services/srs-adapter.ts`
- Production review handler: `src/lib/api-handlers/practice-review-post.ts`
- Production end handler: `src/lib/api-handlers/practice-end-post.ts`
- Production mastery handler: `src/lib/api-handlers/mastery-summary-get.ts`
- Existing practice-start route (pre-extraction): `src/pages/api/practice/start.ts`
- Phase 2 programmatic fixture reference: `tests/integration/flashcards-state-machine.test.ts:33-72, 157-189, 229-293`
- Phase 1 authn matrix reference: `tests/integration/authn-protected-apis.test.ts`
- Lessons: `context/foundation/lessons.md` (L-001 — keep `database.types.ts` ESLint disable; do not weaken any lint rule for tests)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: SRS Adapter Unit + Practice-Start Handler Extraction

#### Automated

- [x] 1.1 `npm test` runs `tests/unit/srs-adapter.test.ts` green (no `.env.test` dependencies) — 925c8db
- [x] 1.2 `npm run lint` passes — 925c8db
- [x] 1.3 `npm run build` passes — 925c8db

#### Manual

- [x] 1.4 Local `/practice` start still works after `practice-start-post.ts` extraction — 925c8db

### Phase 2: Practice Flow Integration + Authn Matrix Completion

#### Automated

- [x] 2.1 `npm test` — all ten Phase 2 cases pass (two in `authn-protected-apis.test.ts`, eight in `practice-flow.test.ts`) against the hosted test project — b4f0dc6
- [x] 2.2 `npm run lint` passes — b4f0dc6
- [x] 2.3 `npm run build` passes — b4f0dc6

#### Manual

- [x] 2.4 Manual `/practice` happy path in dev still works after handler extraction + matrix completion — b4f0dc6

### Phase 3: Mastery Summary Integration + SRS Fixture Helper

#### Automated

- [x] 3.1 `npm test` — all four cases in `mastery-summary.test.ts` pass — 78aec7d
- [x] 3.2 `npm run lint` passes — 78aec7d
- [x] 3.3 `npm run build` passes — 78aec7d

#### Manual

- [x] 3.4 `/dashboard` mastery indicator renders the expected integer percent for the test user — 78aec7d

### Phase 4: Cookbook §6.6 & Test-Plan Sync

#### Automated

- [x] 4.1 `npm test` still passes
- [x] 4.2 `npm run lint` passes

#### Manual

- [x] 4.3 §6.6 readable standalone — Phase 4 (CI quality gates) contributor can copy the practice-flow + mastery patterns without re-reading the full plan
- [x] 4.4 `change.md` set to `status: implemented` with updated date
