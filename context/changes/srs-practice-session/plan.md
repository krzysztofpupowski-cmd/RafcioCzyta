# SRS Practice Session (S-04) Implementation Plan

## Overview

Implement FR-006: a parent on `/dashboard` can start a simple practice session on **accepted** flashcards that are **due** and match the child's **current reading level**. Each card shows `front_text`, optional hint reveal, then four FSRS ratings (Again / Hard / Good / Easy). Reviews persist via F-03's `applyReview`, write `practice_sessions` and `practice_attempts`, and cap at **10 cards** per session for the &lt;10 min NFR. S-05 mastery UI stays out of scope.

## Current State Analysis

- **F-03 done.** `src/lib/services/srs-adapter.ts` exports `initSrsState`, `applyReview`, `previewReview`, `isDue`, `fromStored`, `toStored`, `ratingToPracticeOutcome`. Accepted cards have `srs_state` + `next_review_at` after accept/backfill.
- **S-03 done.** Parents accept batches on `/dashboard` via `FlashcardDashboardCard`; only `status = 'accepted'` cards are practice-eligible.
- **Schema ready, unused.** `practice_sessions` and `practice_attempts` exist in F-01 with RLS (`is_my_child`) and composite FK alignment — no application writes yet.
- **No practice code.** No `/api/practice/*`, no practice service, no practice React UI.
- **Index for due queue.** `flashcards_child_status_next_review_idx` on `(child_id, status, next_review_at)` from F-03 migration supports the due query.

### Key Discoveries:

- `src/pages/api/flashcards/accept.ts` — canonical auth + zod body + `{ ok: true | false }` + Polish errors for new routes.
- `src/lib/schemas/srs.ts` — `storedSrsStateSchema`, `reviewRatingSchema` already defined for review bodies.
- `src/lib/dto/flashcards.ts` — L-001 DTO boundary; practice DTOs should live in a sibling `practice.ts` module.
- `context/changes/srs-adapter/ts-fsrs-docs.md` — due SQL, binary outcome mapping, **`next()` only** to commit a review (do not call `repeat()` then `next()` for the same card).
- `context/changes/srs-adapter/plan-brief.md` — first session may be large after backfill; **cap 10** addresses this (planning decision).
- `src/middleware.ts` — only `/dashboard` is protected; practice APIs enforce auth internally like flashcard routes.

## Desired End State

A parent with a child profile and at least one **due** accepted card at the child's `current_level` visits `/dashboard` and:

1. Sees a **Ćwicz teraz** (or equivalent) CTA on the flashcard area when practice is available.
2. Taps start → an in-dashboard session UI replaces or overlays the review tabs (no `/practice` route).
3. For each card (up to 10): sees `front_text` → taps **Pokaż podpowiedź** to reveal `hint_text` → taps one of **Again / Hard / Good / Easy** (Polish labels).
4. Each rating updates SRS state on the flashcard, inserts a `practice_attempts` row linked to the active `practice_sessions` row, and advances to the next card.
5. On completion or **Zakończ**, `practice_sessions.ended_at` is set.
6. If zero cards are due at start, the parent sees **Brak fiszek do powtórki** and returns to the normal dashboard view.

Verify manually: accept a batch → start practice → rate 2–3 cards → refresh dashboard → accepted cards show updated SRS (later reviews due) → Supabase shows session + attempts rows.

## What We're NOT Doing

- S-05 mastery indicator UI or aggregate progress display (FR-007).
- Dedicated `/practice` route or middleware route additions.
- Schema migrations or RLS changes (F-01 tables are sufficient).
- `previewReview` / `repeat()` interval hints on rating buttons.
- Practicing cards that are not yet due or at a different `level` than `children.current_level`.
- Automated test suite (no runner in repo).
- `ReviewLog` table or `practice_attempts.metadata`.
- Per-child FSRS parameter tuning.
- Child-facing login or separate child role.

## Implementation Approach

Add `src/lib/services/practice-session.ts` for due-queue selection, session lifecycle, and review persistence (delegating FSRS math to `srs-adapter`). Add `src/lib/dto/practice.ts` for wire types. Add three JSON endpoints under `src/pages/api/practice/` matching S-02/S-03 patterns.

Mount a new React island `PracticeSessionCard` on `dashboard.astro` (below `FlashcardDashboardCard`) with SSR-provided `dueCount` (or `canPractice` boolean) for CTA visibility. The island owns session state machine: `idle` → `active` → `complete` / `empty`. Mutations call `POST` start → repeated `POST` review → `POST` end.

Due query (app-layer invariant from F-01):

```sql
SELECT id, front_text, hint_text, level, srs_state, next_review_at
FROM flashcards
WHERE child_id = $1
  AND status = 'accepted'
  AND level = $2  -- children.current_level; abort practice if level IS NULL
  AND next_review_at IS NOT NULL
  AND next_review_at <= now()
ORDER BY next_review_at ASC
LIMIT 10;
```

On review: parse `srs_state` with `storedSrsStateSchema` → `fromStored` → `applyReview(rating)` → `UPDATE flashcards` (srs_state, next_review_at, reps_count, last_reviewed_at, mastery_score) → `INSERT practice_attempts` (session_id, flashcard_id, child_id, outcome).

## Critical Implementation Details

**Child without `current_level`.** If `children.current_level` is `NULL` (S-01 "Nie wiem"), do not start a session — return a Polish error directing the parent to set the reading level first. Aligns with `current_level`-only eligibility.

**Commit path uses `next()` only.** `applyReview` already wraps `scheduler.next`. Do not call `previewReview`/`repeat()` in the same request before `applyReview` for the committed rating.

**Session end on abandon.** Call `POST /api/practice/end` when the parent taps **Zakończ** mid-session and when the last card is reviewed (client may auto-end after final review). Idempotent end (already ended) should return success.

**Ordering vs concurrent tabs.** Server loads the due queue at `start` and returns card IDs; client sends those IDs back on `review`. If another tab reviews the same card, the update still applies FSRS once — acceptable at MVP scale.

## Phase 1: Backend — practice service + API routes

### Overview

Implement due-queue reads, session creation/completion, review persistence, and three authenticated JSON endpoints. After this phase, `curl` with a session cookie can start a session, submit a review, and end the session while rows appear in Supabase.

### Changes Required:

#### 1. Practice session service

**File**: `src/lib/services/practice-session.ts`

**Intent**: Own all practice-session reads and writes. Keep flashcard listing/acceptance in `flashcards.ts` and FSRS math in `srs-adapter.ts`.

**Contract**:

- File-wide L-001 disable header (same shape as `src/lib/services/children.ts`).
- Import `AppSupabase` from `./children`.
- Export stable error codes as string constants (throw `new Error(CODE)` pattern from `flashcards.ts`):
  - `PRACTICE_ERROR_NO_CHILD_LEVEL` — `current_level` is null.
  - `PRACTICE_ERROR_NO_DUE_CARDS` — zero due cards at start.
  - `PRACTICE_ERROR_SESSION_NOT_FOUND` — session missing or not owned.
  - `PRACTICE_ERROR_CARD_NOT_IN_SESSION` — flashcard not in the started queue (optional guard).
  - `PRACTICE_ERROR_CARD_ALREADY_REVIEWED` — attempt already exists for `(session_id, flashcard_id)`.
  - `PRACTICE_ERROR_INVALID_SRS_STATE` — `storedSrsStateSchema` parse failure.
- Export `countDueCards(supabase, { childId, level })` → `number` — same filters as due query, `count` head only (for SSR CTA).
- Export `startPracticeSession(supabase, { childId, level })` → `{ sessionId: string; cards: PracticeCardDTO[] }`. Select up to 10 due accepted cards at `level`, order `next_review_at asc`. If zero rows, throw `PRACTICE_ERROR_NO_DUE_CARDS` (**no session row created**). Insert `practice_sessions` (`child_id`, `started_at`) only when at least one due card exists. Map rows to DTOs (no raw `Flashcard` leaves this module).
- Export `recordPracticeReview(supabase, { sessionId, childId, flashcardId, rating: ReviewRating })` → `{ outcome: 'correct' | 'incorrect'; reviewedCount: number }`. Verify open session (`ended_at` is null) for `childId`. **Reject duplicate:** if a `practice_attempts` row already exists for `(session_id, flashcard_id)`, throw `PRACTICE_ERROR_CARD_ALREADY_REVIEWED`. Load flashcard; validate `status = 'accepted'`, matching `child_id`, parse `srs_state`. `applyReview(fromStored(...), rating)` → update flashcard columns + insert `practice_attempts` with `outcome` (from `practice_outcome`). Return `reviewedCount` = count of `practice_attempts` for this session after insert (client owns queue progress and completion from local `cards[]`).
- Export `endPracticeSession(supabase, { sessionId, childId })` → `{ endedAt: string }`. Set `ended_at = now()` where `id` + `child_id` match; throw `PRACTICE_ERROR_SESSION_NOT_FOUND` if zero rows updated and session never existed.

**Note**: Session queue membership can be enforced by storing attempted `flashcard_id`s in client state from `start` response; server re-validates card belongs to child and session is open on each review.

#### 2. Practice DTOs

**File**: `src/lib/dto/practice.ts`

**Intent**: Wire types for practice API and React island. Primitives only — no `@/types` in components.

**Contract**:

- L-001 disable header at top.
- `PracticeCardDTO { id, front_text, hint_text, level }` — same display fields as `FlashcardSummaryDTO`.
- `StartPracticeSuccessResponse { ok: true; sessionId: string; cards: PracticeCardDTO[]; totalCount: number }`.
- `ReviewPracticeRequestBody { sessionId: string; flashcardId: string; rating: ReviewRating }` — rating is numeric FSRS enum (1–4).
- `ReviewPracticeSuccessResponse { ok: true; outcome: 'correct' | 'incorrect'; reviewedCount: number }` — client detects completion when local card index reaches `cards.length` from start; server `reviewedCount` is sanity-only.
- `EndPracticeSuccessResponse { ok: true; sessionId: string; endedAt: string }`.
- `PracticeErrorResponse { ok: false; error: string }`.
- Union types for each endpoint response.
- Mapper `toPracticeCardDTO(card: Flashcard)` using known columns only.

#### 3. `POST /api/practice/start`

**File**: `src/pages/api/practice/start.ts`

**Intent**: Authenticated endpoint to open a session and return up to 10 due cards.

**Contract**:

- `export const prerender = false`.
- Auth: same as `accept.ts` — `context.locals.user`, `createClient`, `getMyChild`.
- No request body (or empty JSON).
- If child missing → 400 Polish error (match `accept.ts`).
- If `child.current_level` null → 400 + `PRACTICE_ERROR_NO_CHILD_LEVEL` message.
- Call `startPracticeSession(supabase, { childId, level: child.current_level })`.
- Map errors: `PRACTICE_ERROR_NO_DUE_CARDS` → 404 or 409 with friendly Polish copy.
- Success: `StartPracticeSuccessResponse`.

#### 4. `POST /api/practice/review`

**File**: `src/pages/api/practice/review.ts`

**Intent**: Apply one FSRS rating for a card in an active session.

**Contract**:

- Zod body: `{ sessionId: z.uuid(), flashcardId: z.uuid(), rating: reviewRatingSchema }`.
- Auth + child resolution as above.
- Call `recordPracticeReview`.
- Map `PRACTICE_ERROR_*` to 400/404 with Polish messages.
- Success: `ReviewPracticeSuccessResponse`.

#### 5. `POST /api/practice/end`

**File**: `src/pages/api/practice/end.ts`

**Intent**: Close a session (completion or early exit).

**Contract**:

- Zod body: `{ sessionId: z.uuid() }`.
- Call `endPracticeSession`.
- Success even if session already ended (idempotent): return existing `ended_at` or no-op update.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes without errors
- `npm run lint` passes
- `npm run build` passes (with `SUPABASE_URL` / `SUPABASE_KEY` set)

#### Manual Verification:

- With due accepted cards: `POST /api/practice/start` returns `sessionId` and ≤10 cards
- `POST /api/practice/review` updates `flashcards.next_review_at` / `srs_state` and inserts `practice_attempts`
- `POST /api/practice/end` sets `practice_sessions.ended_at`
- Zero due cards → start returns Polish error, no session row

**Implementation Note**: Pause for human confirmation after manual API checks before Phase 2.

---

## Phase 2: Dashboard integration — SSR + practice island

### Overview

Expose practice on `/dashboard`: SSR due count, CTA, in-page session flow (reveal hint → four ratings → progress), empty and no-level states. Reuse cosmic/Tailwind patterns from `FlashcardDashboardCard`.

### Changes Required:

#### 1. SSR due count on dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Hydrate practice CTA visibility without an extra client round-trip on first paint.

**Contract**:

- When `childExists && childId && childLevel`, call `countDueCards(supabase, { childId, level: childLevel })`.
- Pass `practiceDueCount` (number) and `childLevel` to the new island.
- On flashcard fetch failure, practice count can default to 0 with same error surfacing pattern.

#### 2. Practice session React island

**File**: `src/components/practice/PracticeSessionCard.tsx`

**Intent**: Single island for CTA + full session UX on the dashboard (no separate route).

**Contract**:

- Props: `childExists: boolean`, `childLevel: string | null`, `initialDueCount: number`, `initialError?: string | null`.
- States:
  - **idle** — show CTA when `childExists && childLevel && initialDueCount > 0`; disabled/hidden when no child or no level; if level set but count 0, subtle copy that nothing is due yet.
  - **empty** — after start returns no due (should not happen if count &gt; 0; handle race).
  - **active** — card counter `n/total`, front text, **Pokaż podpowiedź** toggles hint, four rating buttons (Polish: e.g. *Jeszcze raz*, *Trudne*, *Dobrze*, *Łatwe* — align tone with existing UI).
  - **complete** — short summary (cards reviewed) + **Wróć do fiszek** resets to idle.
- `POST /api/practice/start` on CTA → store `sessionId` + `cards` queue locally.
- On rating click → `POST /api/practice/review` → advance index; when local index reaches `cards.length` → `POST /api/practice/end` → **complete**.
- **Zakończ** during session → `end` then return to idle.
- Loading/disabled states on buttons during fetch; show API `error` strings.
- Mobile-first layout: large tap targets, readable `front_text` on small screens.
- Use `cn()` for class merging; no `@/types` imports.

#### 3. Mount island on dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Render practice below flashcard management.

**Contract**:

- Import and render `<PracticeSessionCard ... client:load />` after `FlashcardDashboardCard`.
- When `childLevel` is null, pass `initialDueCount={0}` and let island show “ustaw poziom” copy near CTA.

#### 4. Optional: due count refresh hook

**File**: `src/components/practice/PracticeSessionCard.tsx` (same file)

**Intent**: After session completes, parent sees updated CTA state without full page reload.

**Contract**:

- Decrement local `dueCount` by `reviewedCount` on complete, or re-fetch count via a lightweight approach (local math is enough if only session cards were due).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Dashboard shows **Ćwicz teraz** when due count &gt; 0
- Full session: reveal hint → four ratings → progress through up to 10 cards → completion message
- **Zakończ** mid-session sets `ended_at` in DB
- No level → CTA explains level is required
- Zero due → no start CTA (or disabled) with appropriate copy
- Mobile viewport: readable card text and tappable buttons
- Flashcard accept/generate tabs still work after session

**Implementation Note**: Pause for human UX confirmation before calling the slice complete.

---

## Testing Strategy

### Unit Tests:

- None in repo for this slice.

### Integration Tests:

- None automated; manual API + UI flow above.

### Manual Testing Steps:

1. Set child level, accept a batch, confirm cards have `next_review_at <= now()` in Supabase (or wait / adjust for test).
2. Open `/dashboard` — CTA visible with due count.
3. Start session — 10 or fewer cards; verify `practice_sessions` row.
4. Review with each rating type — confirm `practice_attempts.outcome` matches Again/Hard → incorrect, Good/Easy → correct.
5. Complete session — `ended_at` set; CTA reflects fewer due cards.
6. Start with zero due — Polish empty message, no orphan session.
7. Child with null level — cannot start; profile form still works.

## Performance Considerations

- Due query uses existing `(child_id, status, next_review_at)` index; limit 10 keeps payloads small.
- One session row + up to 10 attempt inserts + 10 flashcard updates — well within NFR for &lt;10 min sessions on low QPS MVP.
- No `repeat()` previews on each render — avoids extra FSRS work per card.

## Migration Notes

- No migration. Use existing F-01 + F-03 columns.
- Cards accepted before F-03 should already be backfilled; if `srs_state` is null on an accepted card, `recordPracticeReview` should surface `PRACTICE_ERROR_INVALID_SRS_STATE` — parent can re-accept or run backfill manually (out of slice scope).

## References

- PRD FR-006: `context/foundation/prd.md`
- Roadmap S-04: `context/foundation/roadmap.md`
- F-03 adapter: `context/changes/srs-adapter/plan.md`, `src/lib/services/srs-adapter.ts`
- ts-fsrs usage: `context/changes/srs-adapter/ts-fsrs-docs.md`
- S-03 patterns: `context/changes/batch-flashcard-acceptance/plan.md`
- Schema: `supabase/migrations/20260526143400_reading_domain_schema.sql`, `supabase/migrations/20260602120000_flashcard_srs_state.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend — practice service + API routes

#### Automated

- [x] 1.1 `npx astro sync` completes without errors — 94d40d9
- [x] 1.2 `npm run lint` passes — 94d40d9
- [x] 1.3 `npm run build` passes — 94d40d9

#### Manual

- [x] 1.4 Start/review/end API verified against Supabase (session + attempts + SRS columns) — 94d40d9
- [x] 1.5 Zero due and null level error paths verified — 94d40d9

### Phase 2: Dashboard integration — SSR + practice island

#### Automated

- [x] 2.1 `npm run lint` passes — 6af9f85
- [x] 2.2 `npm run build` passes — 6af9f85

#### Manual

- [x] 2.3 Full dashboard practice flow on mobile viewport — 6af9f85
- [x] 2.4 Mid-session Zakończ and empty-due / no-level UX verified — 6af9f85
- [x] 2.5 Flashcard generate/accept tabs still work after practice — 6af9f85
