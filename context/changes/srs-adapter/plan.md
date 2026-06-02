# SRS Adapter (F-03) Implementation Plan

## Overview

Integrate the `ts-fsrs` library as the application's ready-made SRS engine. Extend the `flashcards` table with full scheduler persistence (`srs_state jsonb`, `next_review_at timestamptz`), implement a normalization adapter service, wire SRS initialization into `acceptBatch` (S-03 hook), and eagerly backfill cards already accepted before F-03. This foundation slice unlocks S-04 (practice session) and S-05 (mastery indicator) without shipping their UI or API routes.

## Current State Analysis

- F-01 migration (`supabase/migrations/20260526143400_reading_domain_schema.sql:107-126`) defines SRS-agnostic columns only: `reps_count`, `last_reviewed_at`, `mastery_score`. No `srs_state`, no `next_review_at`, no due-queue index.
- S-03 `acceptBatch` (`src/lib/services/flashcards.ts:83-107`) performs a single bulk `.update({ status: "accepted" })` — incompatible with per-card `createEmptyCard()` output.
- `ts-fsrs` is not in `package.json`. No `src/lib/services/srs-adapter.ts` or `src/lib/schemas/srs.ts`.
- Accept API (`src/pages/api/flashcards/accept.ts`) is a thin delegate — must stay thin; SRS logic belongs in the service layer per research.
- Stack fit confirmed: Astro 6 SSR on Cloudflare Workers, ESM, Zod at boundaries, service ESLint pattern from L-001 (`src/lib/services/children.ts`).
- No automated test runner; verification follows lint + build + manual Supabase/API smoke (AGENTS.md).

### Key Discoveries:

- Research verdict: `ts-fsrs-docs.md` is compatible; gap is implementation, not design (`context/changes/srs-adapter/research.md`).
- `practice_attempts.outcome` binary enum matches adapter's four-rating → two-outcome normalization (`supabase/migrations/20260526143400_reading_domain_schema.sql:56-59`).
- Bulk accept must become per-card updates because each `createEmptyCard()` produces distinct FSRS state.
- SQL migration cannot call `ts-fsrs`; eager backfill runs via application code using the same `initSrsState()` path as accept.
- `repeat()` vs `next()`: S-04 must call only `next()` to commit a review — documented here for downstream; F-03 exports both for S-04 consumption.

## Desired End State

After all phases complete and manual verification passes:

- `flashcards` has nullable `srs_state jsonb` and `next_review_at timestamptz` columns plus index `(child_id, status, next_review_at)` for S-04 due queries.
- Every row with `status = 'accepted'` has non-null `srs_state` and `next_review_at` (including pre-F-03 cards after backfill).
- `src/lib/services/srs-adapter.ts` exports `initSrsState`, `previewReview`, `applyReview`, `isDue`, `toStored`, `fromStored`, and documents `ratingToPracticeOutcome`.
- `acceptBatch` initializes SRS state on accept: `reps_count = 0`, `last_reviewed_at = null`, `mastery_score = 0`, plus full `srs_state` and `next_review_at`.
- `src/db/database.types.ts` regenerated; `npm run lint` and `npm run build` pass.
- No new HTTP routes; accept API response shape unchanged for the dashboard.

## What We're NOT Doing

- **No S-04 practice session UI or API routes** — adapter exports functions; S-04 wires HTTP and UX.
- **No S-05 mastery indicator UI** — `get_retrievability()` mapping lives in `applyReview` for S-04/S-05 reuse.
- **No `ReviewLog` persistence** — optional later; `practice_attempts` has no metadata column.
- **No per-child FSRS parameter tuning** — module-level default `fsrs()` parameters.
- **No vitest or automated unit tests** — manual smoke only (project norm).
- **No UI changes** — `AcceptedFlashcardDTO` omits SRS fields until S-04/S-05 need them.
- **No RLS policy changes** — existing `flashcards` policies cover new columns.
- **No DB CHECK enforcing `srs_state` on accepted rows** — application layer owns invariant after backfill.

## Implementation Approach

Three incremental phases: schema first (columns + index + typegen), then pure adapter layer (install dependency, Zod schema, service with serialization), then behavioral integration (refactor `acceptBatch`, add backfill function). The adapter is the single normalization boundary between `ts-fsrs` `Card`/`Rating` types and F-01 denormalized columns + binary `practice_attempt_outcome`.

## Critical Implementation Details

- **`acceptBatch` ordering:** SELECT draft cards for the generation first, then UPDATE each row individually with its own `srs_state`. A single bulk UPDATE cannot assign distinct JSON per row.
- **`next_review_at` invariant:** Always set from `card.due` (via `toStored().due` as timestamptz) whenever SRS state is written — accept, backfill, and future S-04 `applyReview`. S-04 must not update `next_review_at` without updating `srs_state`.
- **Backfill uses `initSrsState()`** — same code path as accept; do not hand-craft JSON in SQL. Run `backfillAcceptedCardsWithoutSrs()` once manually after migration (user's terminal per AGENTS.md Windows rule).
- **`acceptBatch` updates are sequential and fail-fast** — per-card UPDATEs run one after another; throw on the first Supabase error. Do not use `Promise.all` (MVP batch ~8 cards). Partial accept on mid-loop failure is a known edge case; recovery is manual (Studio or ops), not automatic rollback.

## Phase 1: Schema migration & typegen

### Overview

Add SRS persistence columns and a due-queue index to `flashcards`. Regenerate Supabase TypeScript bindings. No application code changes in this phase.

### Changes Required:

#### 1. Migration file

**File**: `supabase/migrations/20260602120000_flashcard_srs_state.sql`

**Intent**: Extend `flashcards` with full FSRS persistence and an index optimized for S-04's "due accepted cards for child" query.

**Contract**:

- `ALTER TABLE public.flashcards ADD COLUMN srs_state jsonb NULL`
- `ALTER TABLE public.flashcards ADD COLUMN next_review_at timestamptz NULL`
- `CREATE INDEX flashcards_child_status_next_review_idx ON public.flashcards (child_id, status, next_review_at)` — supports `WHERE child_id = $1 AND status = 'accepted' AND next_review_at <= now() ORDER BY next_review_at`
- Columns remain nullable so draft/rejected rows need no SRS data
- No RLS or policy changes — existing `flashcards` policies apply
- Comment on columns documenting F-03 ownership and sync with `srs_state.due`

#### 2. Regenerate database types

**File**: `src/db/database.types.ts`

**Intent**: Reflect new columns in generated Supabase types after local migration applies.

**Contract**: Run `npx supabase gen types typescript --local > src/db/database.types.ts` after user runs `npx supabase db reset --local`. Commit regenerated file. `Flashcard` row type in `src/types.ts` picks up new fields automatically via Database alias — no hand edits to `src/types.ts` required unless adding non-DB helper types.

### Success Criteria:

#### Automated Verification:

- Migration file exists at `supabase/migrations/20260602120000_flashcard_srs_state.sql`
- `npm run lint` exits 0
- `npm run build` exits 0

#### Manual Verification:

- User runs `npx supabase db reset --local` — migration applies without error
- `\d public.flashcards` shows `srs_state` and `next_review_at` columns and new index
- Regenerated `database.types.ts` includes `srs_state` and `next_review_at` on `flashcards.Row`

**Implementation Note**: Pause after manual migration verification before Phase 2.

---

## Phase 2: Adapter layer — ts-fsrs, schemas, service

### Overview

Install `ts-fsrs`, define Zod-validated `StoredSrsState` for JSON persistence, and implement the adapter service with init/preview/apply/isDue and Date ↔ millisecond serialization helpers.

### Changes Required:

#### 1. Install dependency

**File**: `package.json`

**Intent**: Add the chosen SRS library to production dependencies.

**Contract**: `npm install ts-fsrs` — record resolved version in lockfile. No other dependency changes.

#### 2. SRS Zod schema

**File**: `src/lib/schemas/srs.ts`

**Intent**: Validate `srs_state` JSON at service boundaries and provide a stable stored shape independent of `Date` objects.

**Contract**:

- Export `storedSrsStateSchema` (Zod object matching fields in `ts-fsrs-docs.md` `StoredSrsState`: `difficulty`, `due` as number ms, `stability`, `state`, `reps`, `lapses`, `learning_steps`, `scheduled_days`, `elapsed_days`, `last_review` as number ms or null)
- Export type `StoredSrsState = z.infer<typeof storedSrsStateSchema>`
- Export `reviewRatingSchema` — Zod enum or native enum wrapper for `Rating.Again | Hard | Good | Easy` values used by S-04 request bodies later
- No Supabase imports; mirror pattern from `src/lib/schemas/child.ts`

#### 3. SRS adapter service

**File**: `src/lib/services/srs-adapter.ts`

**Intent**: Centralize all `ts-fsrs` interaction. Downstream slices import from here — never from `ts-fsrs` directly except this file.

**Contract**:

- File-wide ESLint disable block per L-001 (same rules as `src/lib/services/flashcards.ts`)
- Module-level `const scheduler = fsrs()` with default parameters
- `toStored(card: Card): StoredSrsState` — serialize `Date` fields to epoch ms
- `fromStored(stored: StoredSrsState): Card` — deserialize; cast `state` to `State`
- `initSrsState(now?: Date): { stored: StoredSrsState; nextReviewAt: Date; reps_count: 0; last_reviewed_at: null; mastery_score: 0 }` — wraps `createEmptyCard(now)` + `toStored`
- `previewReview(card: Card, now?: Date)` — returns `scheduler.repeat(card, now)`
- `applyReview(card: Card, rating: Rating, now?: Date)` — returns `{ stored, nextReviewAt, reps_count, last_reviewed_at, mastery_score, practice_outcome }` where `practice_outcome` uses standard mapping: `rating <= Rating.Hard ? 'incorrect' : 'correct'`
- `isDue(card: Card, now?: Date): boolean` — `card.due.getTime() <= now.getTime()`
- `ratingToPracticeOutcome(rating: Rating): 'correct' | 'incorrect'` — exported for S-04 reuse
- `masteryScoreFromCard(card: Card, now?: Date): number` — `Math.round(scheduler.get_retrievability(card, now, false) * 100)`

No HTTP, no Supabase client in this file — pure functions only.

### Success Criteria:

#### Automated Verification:

- `ts-fsrs` appears in `package.json` dependencies
- `src/lib/schemas/srs.ts` and `src/lib/services/srs-adapter.ts` exist
- `npx astro sync` exits 0
- `npm run lint` exits 0
- `npm run build` exits 0

#### Manual Verification:

- In dev REPL or temporary scratch (removed before commit), call `initSrsState()` and confirm `stored.state === 0` (New), `reps === 0`, `due` is approximately now
- Round-trip `fromStored(toStored(card))` preserves schedulable state for a `createEmptyCard()` result
- `applyReview` with `Rating.Good` returns `practice_outcome: 'correct'`; `Rating.Again` returns `'incorrect'`

**Implementation Note**: Pause after manual adapter checks before Phase 3.

---

## Phase 3: Accept integration & eager backfill

### Overview

Refactor `acceptBatch` to initialize per-card SRS state on accept. Add `backfillAcceptedCardsWithoutSrs` for pre-F-03 accepted cards. Accept API route unchanged.

### Changes Required:

#### 1. Refactor acceptBatch

**File**: `src/lib/services/flashcards.ts`

**Intent**: On batch accept, each draft card gets unique FSRS initialization instead of a status-only bulk update.

**Contract**:

- Import `initSrsState` from `@/lib/services/srs-adapter`
- Replace single `.update({ status: "accepted" })` with:
  1. SELECT draft cards: `.eq("generation_id", …).eq("child_id", …).eq("status", "draft")`
  2. If zero rows → throw `FLASHCARD_ERROR_BATCH_EMPTY` (preserve existing behavior)
  3. For each card: call `initSrsState()`, then `.update({ status: "accepted", srs_state: stored, next_review_at: nextReviewAt.toISOString(), reps_count: 0, last_reviewed_at: null, mastery_score: 0 }).eq("id", card.id).eq("child_id", input.childId).select()`
  4. Return `{ updatedCount, cards }` with same DTO mapping as today (`toAcceptedFlashcardDTO`)
- Apply per-card UPDATEs **sequentially**; throw on the first error (fail-fast). Do not use `Promise.all`.
- Do not change `rejectBatch`, `listDraftBatches`, or `listAcceptedFlashcards` signatures

#### 2. Backfill function

**File**: `src/lib/services/flashcards.ts` (or `srs-adapter.ts` if cleaner — prefer `flashcards.ts` since it owns Supabase writes)

**Intent**: One-time eager backfill for accepted cards created before F-03.

**Contract**:

- Export `backfillAcceptedCardsWithoutSrs(supabase: AppSupabase, childId: string): Promise<{ updatedCount: number }>`
- Query: `.eq("child_id", childId).eq("status", "accepted").is("srs_state", null)`
- For each row: `initSrsState()`, same UPDATE payload as accept path
- Return count of updated rows
- **Not** called automatically on every request — invoked once manually post-deploy (document in manual verification)

#### 3. Accept API — no structural change

**File**: `src/pages/api/flashcards/accept.ts`

**Intent**: Confirm route remains a thin delegate; no new imports from `ts-fsrs`.

**Contract**: No code changes expected unless lint/type fixes from service signature drift. Response shape unchanged.

### Success Criteria:

#### Automated Verification:

- `acceptBatch` imports and calls `initSrsState`
- `backfillAcceptedCardsWithoutSrs` exported from flashcards service
- `npx astro sync` exits 0
- `npm run lint` exits 0
- `npm run build` exits 0

#### Manual Verification:

- User runs local Supabase + dev server
- Accept a draft batch via UI or `POST /api/flashcards/accept` — Studio shows each accepted card with distinct non-null `srs_state` jsonb and `next_review_at` ≈ now; `reps_count = 0`, `mastery_score = 0`
- Run backfill for child with pre-existing accepted cards (if any) — all accepted rows have non-null `srs_state`
- Repeat accept on same `generationId` → 404 (unchanged S-03 behavior)
- Reject flow unaffected — rejected cards remain without `srs_state`

**Implementation Note**: After full manual verification, F-03 is complete — S-04 can begin importing `previewReview`, `applyReview`, `isDue`.

---

## Testing Strategy

### Unit Tests

No automated test runner configured. Adapter pure functions are the most test-worthy surface — verified manually in Phase 2 smoke checks per project norm.

### Integration Tests

Not applicable — no test runner.

### Manual Testing Steps

1. User runs `npx supabase db reset --local` after Phase 1 migration lands.
2. User runs `npm run dev` in their terminal.
3. Sign in, generate batch, accept — inspect `flashcards` in Studio for SRS columns.
4. If pre-F-03 accepted rows exist, invoke backfill (temporary dev call or one-liner in user's terminal) and verify all accepted rows populated.
5. Confirm reject and list endpoints unchanged.
6. Run `npm run lint` and `npm run build`.

## Performance Considerations

Accept batch size is ~8 cards (F-02 default). Per-card UPDATE loop is negligible vs network latency. Due-queue index supports S-04 session query under NFR (<10 min session). Eager backfill runs once — O(n) accepted cards at MVP scale is acceptable.

## Migration Notes

- **New accepts after F-03:** SRS init automatic in `acceptBatch`.
- **Pre-F-03 accepted cards:** Run `backfillAcceptedCardsWithoutSrs` once per child after deploy. All backfilled cards get `due = now` — first S-04 session may surface many cards; S-04 should cap session size.
- **Rollback:** Drop columns via new migration if needed; accept flow reverts to status-only update (loses SRS state).
- **Q-SRS closure:** Lock roadmap Open Question #1 to `ts-fsrs` when marking F-03 done.

## References

- Research: `context/changes/srs-adapter/research.md`
- Library research: `context/changes/srs-adapter/library-research.md`
- API reference: `context/changes/srs-adapter/ts-fsrs-docs.md`
- F-01 schema: `context/changes/reading-domain-schema/plan.md`
- S-03 accept flow: `context/changes/batch-flashcard-acceptance/plan.md`
- Accept service: `src/lib/services/flashcards.ts:83-107`
- L-001: `context/foundation/lessons.md`
- Roadmap F-03: `context/foundation/roadmap.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema migration & typegen

#### Automated

- [x] 1.1 Migration file exists at `supabase/migrations/20260602120000_flashcard_srs_state.sql`
- [x] 1.2 `npm run lint` exits 0
- [x] 1.3 `npm run build` exits 0

#### Manual

- [x] 1.4 `npx supabase db reset --local` applies migration; `\d public.flashcards` shows new columns and index
- [x] 1.5 `database.types.ts` regenerated with `srs_state` and `next_review_at` on flashcards Row

### Phase 2: Adapter layer — ts-fsrs, schemas, service

#### Automated

- [ ] 2.1 `ts-fsrs` in `package.json`; `src/lib/schemas/srs.ts` and `src/lib/services/srs-adapter.ts` exist
- [ ] 2.2 `npx astro sync` exits 0
- [ ] 2.3 `npm run lint` exits 0
- [ ] 2.4 `npm run build` exits 0

#### Manual

- [ ] 2.5 `initSrsState()` produces New card with reps 0 and due ≈ now
- [ ] 2.6 `applyReview` maps Good → correct, Again → incorrect
- [ ] 2.7 Round-trip `fromStored(toStored(card))` preserves schedulable state

### Phase 3: Accept integration & eager backfill

#### Automated

- [ ] 3.1 `acceptBatch` calls `initSrsState`; `backfillAcceptedCardsWithoutSrs` exported
- [ ] 3.2 `npx astro sync` exits 0
- [ ] 3.3 `npm run lint` exits 0
- [ ] 3.4 `npm run build` exits 0

#### Manual

- [ ] 3.5 Accept batch writes per-card `srs_state` and `next_review_at` in Studio
- [ ] 3.6 Backfill populates pre-F-03 accepted cards; repeat accept still returns 404
