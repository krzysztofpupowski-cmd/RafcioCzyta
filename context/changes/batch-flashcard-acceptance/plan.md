# Batch Flashcard Acceptance (S-03) Implementation Plan

## Overview

Implement the parent trust gate for AI-generated flashcards: batch-level accept/reject actions on pending draft generations, plus browsing prepared (draft) and accepted cards on `/dashboard`. S-02 already persists 8-card batches as `status = 'draft'`; this slice adds the service layer, JSON mutation endpoints, SSR-hydrated backlog UI with tabs, and optimistic state updates — no schema changes.

## Current State Analysis

- **Schema + RLS are ready.** `flashcards.status` (`draft | accepted | rejected`), `generation_id` FK, and `(child_id, status)` index exist in `supabase/migrations/20260526143400_reading_domain_schema.sql`. RLS policy `flashcards_update` lets authenticated parents update their child's rows.
- **S-02 ships generation only.** `POST /api/flashcards/generate` inserts drafts; `FlashcardGenerationCard` shows the latest client-side batch in local state with no accept/reject actions. Multiple generations stack in the DB (S-02 policy).
- **No read/update application code.** Only `generateFlashcards()` in `src/lib/services/flashcard-generation.ts` touches `flashcards`. `DraftFlashcardList` is read-only with a static "oczekuje na akceptację" badge.
- **F-01 batch model.** FR-004 batch actions map to `generation_id`; per-card `status` is the unit of truth. Business rule "only accepted material reaches practice" is app-layer only — S-03 sets status but does not wire practice (S-04).

### Key Discoveries:

- `src/lib/dto/flashcards.ts` — existing DTO boundary (L-001); extend here, do not pass `Flashcard` to React.
- `src/pages/api/flashcards/generate.ts` — canonical JSON `{ ok: true | false }` + Polish error pattern for new endpoints.
- `src/pages/dashboard.astro` — already SSR-fetches child primitives; same pattern applies for flashcard lists.
- `context/changes/ai-flashcard-generation/plan.md` — explicitly deferred accept/reject, historical draft backlog, and interactive list replacement to S-03.

## Desired End State

A parent with a child profile visits `/dashboard`, sees a single flashcard card below the profile card with:

1. The existing "Generuj 8 fiszek" button (unchanged pending UX from S-02).
2. A tabbed review area: **Przygotowane** lists every pending generation batch (oldest first), each with read-only card previews and two action buttons — **Akceptuj partię** / **Odrzuć partię** — that transition all draft cards in that batch to `accepted` or `rejected`.
3. **Zaakceptowane** lists all accepted cards for the child (newest first), read-only, no edit actions.
4. Rejected cards disappear from the UI (no third tab).
5. Initial tab content is SSR-hydrated from the database; accept/reject updates optimistically without full reload.
6. A newly generated batch appears in **Przygotowane** immediately after generation succeeds.

Verify: generate two batches without accepting → both appear in **Przygotowane** → accept one → it moves to **Zaakceptowane**, the other remains → reject the other → it vanishes from **Przygotowane** → accepted cards persist after refresh.

## What We're NOT Doing

- Per-card accept/reject or partial acceptance within a batch.
- Rejected-card browsing, undo, or a third tab.
- Full flashcard content editor (FR-005 explicitly excludes this).
- Schema migrations, new tables, or RLS policy changes.
- `GET` list API routes — reads happen via SSR in `dashboard.astro` and service calls; mutations use `POST` only.
- Practice sessions, SRS adapter (F-03), or mastery indicator (S-05).
- Dedicated `/flashcards` route.
- Server-side rate limits or concurrency locks on accept/reject.
- Automated test suite (no runner configured).
- Middleware changes.

## Implementation Approach

Add `src/lib/services/flashcards.ts` for listing and batch status transitions. Extend `src/lib/dto/flashcards.ts` with review DTOs and response types. Add `POST /api/flashcards/accept` and `POST /api/flashcards/reject` following S-02's auth + `{ ok }` JSON contract with zod-validated `{ generationId }` body.

Replace the standalone `FlashcardGenerationCard` island with `FlashcardDashboardCard` — one React tree sharing state between generation, draft batches, and accepted cards. `dashboard.astro` SSR-calls the list service functions when a child exists and passes serializable initial props. Accept/reject handlers call the new POST endpoints then update local state optimistically on success.

Batch mutations use a single Supabase update per action:

```sql
UPDATE flashcards SET status = 'accepted' -- or 'rejected'
WHERE generation_id = $1 AND child_id = $2 AND status = 'draft'
```

RLS scopes this to the parent's child automatically.

## Critical Implementation Details

**Single React island required.** Astro cannot share React state between separate `client:load` islands. Generation success must prepend/append to the same draft-batch array that accept/reject mutates — refactor `FlashcardGenerationCard` into `FlashcardDashboardCard` rather than mounting a second island.

**Draft batch ordering.** Pending batches render oldest-first (by `flashcard_generations.created_at asc`) so parents clear backlog in generation order. A just-generated batch appends to the end of the local draft list.

**Idempotent guard.** If accept/reject is called for a `generationId` with zero remaining `draft` cards (already actioned or unknown), the service throws a stable error code mapped to `404` + Polish copy — prevents silent no-ops that would confuse optimistic UI.

## Phase 1: Backend — flashcard service + accept/reject API

### Overview

Create the flashcard read/update service, extend DTOs, and wire two JSON mutation endpoints. After this phase, `curl` against accept/reject with a session cookie transitions batch status in Supabase.

### Changes Required:

#### 1. Flashcard review service

**File**: `src/lib/services/flashcards.ts`

**Intent**: Own all flashcard reads and batch status transitions for S-03. Keeps generation (`flashcard-generation.ts`) separate — that file continues to insert drafts only.

**Contract**:

- File-wide L-001 disable header (same shape as `src/lib/services/children.ts`).
- Import `AppSupabase` from `./children`.
- Export stable error code constant: `FLASHCARD_ERROR_BATCH_EMPTY` (zero rows updated — already actioned, unknown `generationId`, or not this child's batch).
- Export `listDraftBatches(supabase, childId: string)` → `DraftBatchDTO[]` (import DTO type from dto module or define return shape inline — prefer importing from `@/lib/dto/flashcards`). **Implement via two flat queries** (no nested PostgREST embed — matches existing service style): (1) `flashcard_generations` where `child_id = childId`, order `created_at asc`; (2) `flashcards` where `child_id = childId`, `status = 'draft'`, `generation_id` not null. Group draft cards by `generation_id` in TS; build batches from generation rows that have ≥1 draft card; preserve generation `created_at asc` order. Each batch includes `generationId`, `requestedLevel`, `createdAt` (ISO string from generation row), and `cards` array.
- Export `listAcceptedFlashcards(supabase, childId: string)` → `AcceptedFlashcardDTO[]`. Query `flashcards` where `child_id = childId` and `status = 'accepted'`, order by `updated_at desc` (fallback `created_at desc` if needed). Map the four display fields plus `acceptedAt` from `updated_at`.
- Export `acceptBatch(supabase, { childId, generationId })` → `{ updatedCount: number; cards: AcceptedFlashcardDTO[] }`. Update all rows matching `generation_id`, `child_id`, `status = 'draft'` to `'accepted'`, `.select()` the updated rows. If zero rows updated, throw `FLASHCARD_ERROR_BATCH_EMPTY`. Verify generation belongs to child (implicit via update filter + RLS).
- Export `rejectBatch(supabase, { childId, generationId })` → `{ updatedCount: number }`. Same update pattern with `status = 'rejected'`. Throw `FLASHCARD_ERROR_BATCH_EMPTY` when zero rows.

#### 2. DTO extensions

**File**: `src/lib/dto/flashcards.ts`

**Intent**: Extend the existing DTO boundary with review types and mappers. React components import only from here — never `@/types`.

**Contract**:

- Keep existing generation types untouched.
- Add `FlashcardSummaryDTO { id, front_text, hint_text, level }` — shared card preview shape (same four fields as `GeneratedFlashcardDTO`; may alias or reuse).
- Add `DraftBatchDTO { generationId, requestedLevel, createdAt, cards: FlashcardSummaryDTO[] }`.
- Add `AcceptedFlashcardDTO extends FlashcardSummaryDTO { acceptedAt: string }`.
- Add request/response types for mutations:
  - `AcceptBatchRequestBody { generationId: string }`
  - `RejectBatchRequestBody { generationId: string }`
  - `AcceptBatchSuccessResponse { ok: true; generationId; updatedCount; cards: AcceptedFlashcardDTO[] }`
  - `RejectBatchSuccessResponse { ok: true; generationId; updatedCount }`
  - `FlashcardMutationErrorResponse { ok: false; error: string }`
  - Union types `AcceptBatchResponse`, `RejectBatchResponse`.
- Export mapper functions `toFlashcardSummaryDTO(card: Flashcard)`, `toAcceptedFlashcardDTO(card: Flashcard)` using the existing L-001 disable block already in the file.

#### 3. Accept batch API route

**File**: `src/pages/api/flashcards/accept.ts`

**Intent**: Authenticated JSON endpoint that accepts an entire draft generation batch.

**Contract**:

- `export const prerender = false;`
- `POST` handler: auth check → `401` `{ ok: false, error: "Musisz być zalogowany." }` (same copy as generate).
- `getMyChild` → `400` if no child (_"Najpierw utwórz profil dziecka..."_).
- Parse JSON body with zod: `z.object({ generationId: z.string().uuid() })` → `400` on invalid (_"Nieprawidłowe żądanie."_).
- Call `acceptBatch(supabase, { childId: child.id, generationId })`.
- Success: `200` `{ ok: true, generationId, updatedCount, cards }`.
- Catch service errors: `FLASHCARD_ERROR_BATCH_EMPTY` → `404` _"Ta partia nie oczekuje już na akceptację."_; other errors → `500` generic Polish fallback.
- L-001 disable header (touches `Child` via `getMyChild`).

#### 4. Reject batch API route

**File**: `src/pages/api/flashcards/reject.ts`

**Intent**: Authenticated JSON endpoint that rejects an entire draft generation batch.

**Contract**:

- Mirror `accept.ts` structure and auth/child/zod/error-mapping pattern.
- Call `rejectBatch` instead of `acceptBatch`.
- Success: `200` `{ ok: true, generationId, updatedCount }` (no cards returned — rejected cards are hidden from UI).

### Success Criteria:

#### Automated Verification:

- `src/lib/services/flashcards.ts`, extended `src/lib/dto/flashcards.ts`, `src/pages/api/flashcards/accept.ts`, and `src/pages/api/flashcards/reject.ts` all exist.
- `accept.ts` and `reject.ts` export `const prerender = false`.
- `npx astro sync` exits 0.
- `npm run lint` exits 0.
- `npm run build` exits 0.

#### Manual Verification:

- With local Supabase running, sign in as a test parent who has at least one draft batch (generate via UI or insert test data). Send `POST /api/flashcards/accept` with `{ "generationId": "<uuid>" }` and session cookie. Confirm `200` `{ ok: true, updatedCount: 8, cards: [...] }` and Supabase shows those rows with `status = 'accepted'`.
- Send `POST /api/flashcards/reject` on a different draft batch. Confirm `200` and rows become `status = 'rejected'`.
- Repeat accept on the same `generationId`. Confirm `404` with Polish error (no silent success).
- Send accept while signed out. Confirm `401`.
- Send accept with invalid body (`{}` or bad uuid). Confirm `400`.

**Implementation Note**: After Phase 1 automated checks pass and manual API smoke tests succeed, pause for confirmation before starting Phase 2.

---

## Phase 2: Frontend — tabbed review UI + SSR hydration

### Overview

Refactor the flashcard UI into one dashboard island with generation + tabbed review. SSR-load draft batches and accepted cards in `dashboard.astro`. Wire batch action buttons with optimistic updates and integrate the generation flow so new batches appear in **Przygotowane**.

### Changes Required:

#### 1. Accepted flashcard list (presentational)

**File**: `src/components/flashcards/AcceptedFlashcardList.tsx`

**Intent**: Read-only list for the **Zaakceptowane** tab. Reuses the card row visual language from `DraftFlashcardList` but with a green "zaakceptowana" badge instead of amber pending badge.

**Contract**:

- Props: `{ cards: AcceptedFlashcardDTO[] }`.
- Render empty state copy when `cards.length === 0`: _"Brak zaakceptowanych fiszek."_
- Each row shows `front_text`, optional `hint_text`, level badge via `STORED_LEVEL_LABELS`, and a green accepted badge.
- Accessible: `aria-label="Zaakceptowane fiszki"`.

#### 2. Draft batch panel (presentational + actions)

**File**: `src/components/flashcards/DraftBatchPanel.tsx`

**Intent**: Renders one pending generation batch: card previews, batch metadata (level + date), and accept/reject buttons. Buttons delegate to parent via callbacks — this component does not fetch.

**Contract**:

- Props: `{ batch: DraftBatchDTO; pending: boolean; onAccept: (generationId: string) => void; onReject: (generationId: string) => void }`.
- Reuse card row markup from `DraftFlashcardList` for the card previews (extract shared row sub-component inline or import list items — avoid duplication of level badge styling).
- Two buttons: **Akceptuj partię** (primary/green accent) and **Odrzuć partię** (secondary/destructive muted). Both `disabled` when `pending`.
- Show batch header with `requestedLevel` label and formatted `createdAt` (locale `pl-PL`, date only or relative — keep simple).
- Accessible button labels include batch context for screen readers.

#### 3. Flashcard dashboard island

**File**: `src/components/flashcards/FlashcardDashboardCard.tsx`

**Intent**: Replace `FlashcardGenerationCard` as the single flashcard island. Combines generation button, error handling, tabbed review, and optimistic accept/reject state management.

**Contract**:

- Default export. Props (all primitives/DTOs, L-001 compliant):
  - `childExists: boolean`
  - `childLevel: string | null`
  - `initialDraftBatches: DraftBatchDTO[]`
  - `initialAcceptedCards: AcceptedFlashcardDTO[]`
  - `initialError: string | null` — SSR flashcard-list fetch failure; render via `ServerError` above tabs (separate from mutation `error` state)
- State:
  - `draftBatches` initialized from `initialDraftBatches`.
  - `acceptedCards` initialized from `initialAcceptedCards`.
  - `activeTab: 'prepared' | 'accepted'` (default `'prepared'`).
  - `pendingAction: boolean` — true while accept/reject/generate in flight.
  - `error: string | null`.
  - Generation state from S-02: `cards` from latest generate is **not** a separate list — on generate success, merge the new batch into `draftBatches` (append if `generationId` not already present).
  - `abortRef` for generation `AbortController` (preserve S-02 cleanup `useEffect`).
- Tab UI: two tab buttons **Przygotowane** / **Zaakceptowane** with active-state styling matching cosmic theme. Tab panels render `DraftBatchPanel` list (or empty state _"Brak fiszek oczekujących na akceptację."_) and `AcceptedFlashcardList`.
- `handleAccept(generationId)`:
  - Set `pendingAction`, clear error.
  - `fetch POST /api/flashcards/accept` with JSON body.
  - On success: optimistically remove batch from `draftBatches`, prepend returned `cards` to `acceptedCards`, clear `pendingAction`.
  - On failure: set Polish error via `ServerError`, clear `pendingAction`, do **not** mutate lists.
- `handleReject(generationId)`: same pattern without adding to accepted list.
- Generation `handleClick`: preserve S-02 fetch to `/api/flashcards/generate` verbatim; on success append `{ generationId, requestedLevel, createdAt: new Date().toISOString(), cards }` to `draftBatches` if not duplicate.
- Outer card shell matches existing `FlashcardGenerationCard` aesthetic. Generation section stays above tabs.
- No `@/types` import, no eslint-disable in this file.

#### 4. Deprecate standalone generation card

**File**: `src/components/flashcards/FlashcardGenerationCard.tsx`

**Intent**: Remove from dashboard mount point. Either delete the file or leave it unused — prefer **delete** if nothing else imports it after the refactor to avoid drift.

**Contract**: No remaining imports of `FlashcardGenerationCard` in the codebase after Phase 2.

#### 5. Dashboard SSR hydration

**File**: `src/pages/dashboard.astro`

**Intent**: Fetch initial draft batches and accepted cards server-side when a child exists; pass them to the new island.

**Contract**:

- Import `listDraftBatches`, `listAcceptedFlashcards` from `@/lib/services/flashcards`.
- Import `FlashcardDashboardCard` instead of `FlashcardGenerationCard`.
- When `child` row exists and `supabase` is available, call both list functions with `child.id` in a **separate** try/catch from the child-profile fetch. On failure set `flashcardFetchError: string | null` — do **not** reuse `fetchError` / `serverError` (those feed `ChildProfileForm` only).
- Serialize results to props: `initialDraftBatches`, `initialAcceptedCards`, `initialError={flashcardFetchError}`. Pass through Astro → React (JSON-serializable DTO arrays).
- Replace `<FlashcardGenerationCard …>` with `<FlashcardDashboardCard childExists={childExists} childLevel={childLevel} initialDraftBatches={…} initialAcceptedCards={…} initialError={flashcardFetchError} client:load />`.
- Astro frontmatter uses inline eslint-disable on the specific lines touching service results (L-001 pattern from existing child extraction).

#### 6. Keep DraftFlashcardList for internal reuse (optional)

**File**: `src/components/flashcards/DraftFlashcardList.tsx`

**Intent**: Either keep as the card-row renderer used inside `DraftBatchPanel`, or inline the markup — implementer's choice as long as visual consistency is preserved. If kept, it may accept an optional prop to hide the pending badge when rendered inside a batch panel that already has action buttons.

### Success Criteria:

#### Automated Verification:

- `src/components/flashcards/FlashcardDashboardCard.tsx` exists; `FlashcardGenerationCard.tsx` is deleted or unreferenced.
- `src/pages/dashboard.astro` imports `FlashcardDashboardCard` and passes SSR initial props.
- `npx astro sync` exits 0.
- `npm run lint` exits 0.
- `npm run build` exits 0.

#### Manual Verification:

- Sign in, visit `/dashboard`. Confirm **Przygotowane** tab shows all pending batches from DB (not just the latest generate result). Empty state renders when no drafts.
- Generate a new batch. Confirm it appears at the bottom of **Przygotowane** without page reload.
- Click **Akceptuj partię** on one batch. Confirm the batch disappears from **Przygotowane**, cards appear at top of **Zaakceptowane**, buttons re-enable — no full page reload.
- Click **Odrzuć partię** on a batch. Confirm it disappears from **Przygotowane** and does not appear in **Zaakceptowane**.
- Refresh page. Confirm accepted cards persist in **Zaakceptowane**; acted-on drafts do not reappear.
- Switch tabs while drafts exist. Confirm both tabs render correctly on mobile (≤375px) without horizontal overflow.
- Double-click accept rapidly. Confirm only one mutation runs (button disabled while pending).
- Sign out mid-action (edge case): confirm graceful error banner, no corrupted local state requiring hard refresh.

**Implementation Note**: After Phase 2 automated checks pass and the full accept/reject/browse flow feels right end-to-end, pause for final confirmation before marking S-03 complete.

---

## Testing Strategy

### Unit Tests

No automated test runner configured. The accept/reject API error mapping and batch-empty guard are the most test-worthy units — verified manually in Phase 1 smoke tests.

### Integration Tests

Not applicable — no test runner.

### Manual Testing Steps

1. Start local Supabase and dev server in the user's own terminal.
2. Sign in as test parent with child profile.
3. Generate two batches without accepting — confirm both visible oldest-first in **Przygotowane**.
4. Accept first batch — confirm **Zaakceptowane** populated, second batch still pending.
5. Reject second batch — confirm it vanishes.
6. Refresh — confirm state matches DB.
7. Run `npm run lint` and `npm run build`.

## Performance Considerations

At PRD scale (small users, one child per parent, ~8 cards per batch), listing all drafts and accepted cards in one SSR query is sufficient. No pagination in MVP. Index `(child_id, status)` supports both list queries. Accept/reject is a single bulk UPDATE per action.

## Migration Notes

No migration required. Existing draft rows from S-02 are immediately visible once Phase 2 ships.

## References

- PRD: `context/foundation/prd.md` — FR-004, FR-005, US-01, Business Logic
- Roadmap: `context/foundation/roadmap.md` — S-03 slice definition
- Upstream: `context/changes/ai-flashcard-generation/plan.md` — S-02 deferrals and JSON API pattern
- Schema: `context/changes/reading-domain-schema/plan-brief.md` — batch + status model
- L-001: `context/foundation/lessons.md`
- Similar implementation: `src/pages/api/flashcards/generate.ts`, `src/lib/services/children.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — flashcard service + accept/reject API

#### Automated

- [x] 1.1 Backend files exist (`flashcards.ts` service, DTO extensions, `accept.ts`, `reject.ts`; API routes export `prerender = false`) — db9d2b5
- [x] 1.2 `npx astro sync` exits 0 — db9d2b5
- [x] 1.3 `npm run lint` exits 0 — db9d2b5
- [x] 1.4 `npm run build` exits 0 — db9d2b5

#### Manual

- [x] 1.5 Accept endpoint transitions draft batch to accepted (200 + DB verified) — db9d2b5
- [x] 1.6 Reject endpoint transitions draft batch to rejected (200 + DB verified) — db9d2b5
- [x] 1.7 Repeat accept on same generationId returns 404 Polish error — db9d2b5
- [x] 1.8 Unauthenticated and invalid-body requests return 401/400 — db9d2b5

### Phase 2: Frontend — tabbed review UI + SSR hydration

#### Automated

- [x] 2.1 Frontend files exist (`FlashcardDashboardCard`, dashboard SSR props; `FlashcardGenerationCard` deleted/unreferenced) — d628ddb
- [x] 2.2 `npx astro sync` exits 0 — d628ddb
- [x] 2.3 `npm run lint` exits 0 — d628ddb
- [x] 2.4 `npm run build` exits 0 — d628ddb

#### Manual

- [x] 2.5 SSR shows all pending draft batches on page load — d628ddb
- [x] 2.6 Generate appends new batch to Przygotowane without reload — d628ddb
- [x] 2.7 Accept moves batch to Zaakceptowane optimistically; persists after refresh — d628ddb
- [x] 2.8 Reject removes batch from UI; rejected cards not listed anywhere — d628ddb
- [x] 2.9 Mobile layout (≤375px) — tabs and lists usable without overflow — d628ddb
