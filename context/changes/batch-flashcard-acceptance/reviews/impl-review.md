<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Batch Flashcard Acceptance (S-03)

- **Plan**: context/changes/batch-flashcard-acceptance/plan.md
- **Scope**: Phase 1–2 of 2 (full plan)
- **Date**: 2026-06-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Stale draft batch after “already actioned” (404)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/flashcards/FlashcardDashboardCard.tsx:102-107
- **Detail**: On accept/reject failure, the handler only calls `setError(data.error)` and leaves the batch in `draftBatches`. When the API returns 404 for `FLASHCARD_ERROR_BATCH_EMPTY`, the batch is already gone server-side but the UI keeps showing a ghost batch until full page refresh.
- **Fix**: On 404 (or when error matches the “already actioned” message), remove that `generationId` from `draftBatches`. Optionally prepend returned cards on accept-404 if another tab may have accepted.
  - Strength: Aligns UI with server truth; idempotent UX for double-click and multi-tab cases.
  - Tradeoff: Accept-404 without refetch may miss cards for `acceptedCards` if accepted elsewhere.
  - Confidence: HIGH — API contract explicitly signals empty batch via stable error code.
  - Blind spot: Haven't verified multi-tab accept scenario end-to-end.
- **Decision**: FIXED

### F2 — SSR flashcard fetch error never clears

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/flashcards/FlashcardDashboardCard.tsx:175
- **Detail**: `initialError` is rendered unconditionally via `<ServerError message={initialError} />` and is never cleared after successful client-side generate/accept/reject. A transient SSR list failure leaves a permanent error banner even when mutations succeed.
- **Fix**: Merge `initialError` into mutable error state on mount, or clear it on first successful client mutation.
- **Decision**: SKIPPED

### F3 — Raw Supabase error messages shown on SSR fetch failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:51-52
- **Detail**: Flashcard fetch catch blocks surface `err.message` directly to the UI. Service layer throws `new Error(error.message)` from Supabase, which can expose internal DB/PostgREST details. API routes map these to generic Polish messages; SSR path does not.
- **Fix A ⭐ Recommended**: Use fixed user-facing copy for SSR flashcard fetch failures (log raw error server-side only).
  - Strength: Matches API route pattern; removes info disclosure at SSR boundary.
  - Tradeoff: Less diagnostic detail for users (acceptable for MVP).
  - Confidence: HIGH — same pattern used in API routes.
  - Blind spot: Child-profile fetch on same page still exposes raw messages (pre-existing).
- **Fix B**: Wrap service calls to return `{ data, error: string | null }` with sanitized errors at service layer.
  - Strength: Centralizes error sanitization for all callers.
  - Tradeoff: Broader refactor beyond S-03 scope.
  - Confidence: MED — cleaner long-term but more churn.
- **Decision**: FIXED (Fix A)

### F4 — Reject is destructive with no confirmation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/components/flashcards/DraftBatchPanel.tsx:45-55
- **Detail**: “Odrzuć partię” permanently sets all draft cards to `rejected` with a single click and no confirm step. Rejected cards are intentionally hidden with no undo tab. Mis-clicks are irreversible in the UI.
- **Fix A ⭐ Recommended**: Add a lightweight confirm dialog for reject only (accept stays one-click).
  - Strength: Reduces irreversible mis-clicks; common pattern for destructive actions.
  - Tradeoff: Extra click for every reject; slightly more UI code.
  - Confidence: HIGH — plan did not forbid confirmation; PRD trust gate favors caution on reject.
  - Blind spot: User testing may prefer speed over safety at MVP scale.
- **Fix B**: Skip confirmation; document as accepted MVP risk
  - Strength: Fastest reject flow; matches current plan implementation.
  - Tradeoff: Irreversible mis-clicks remain possible.
  - Confidence: MED — depends on parent usage patterns.
  - Blind spot: No analytics on reject frequency.
- **Decision**: FIXED (Fix A)

### F5 — Reject 404 message mentions “akceptację”

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/flashcards/reject.ts:96
- **Detail**: Reject endpoint reuses accept-oriented copy: “Ta partia nie oczekuje już na akceptację.” Semantically fine but reject-specific wording would be clearer.
- **Fix**: Change reject 404 copy to e.g. “Ta partia nie oczekuje już na decyzję.” or “Ta partia została już rozpatrzona.”
- **Decision**: SKIPPED

### F6 — Client-side `createdAt` for newly generated batches

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/flashcards/FlashcardDashboardCard.tsx:72
- **Detail**: After generate, new batch uses `createdAt: new Date().toISOString()` instead of server `flashcard_generations.created_at`. Can mis-order batches vs SSR-loaded batches within a session. Refresh corrects order.
- **Fix**: Return `createdAt` from `POST /api/flashcards/generate` and use it when appending to `draftBatches`.
- **Decision**: SKIPPED

### F7 — Accept/reject lack AbortController cleanup

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/flashcards/FlashcardDashboardCard.tsx:89-138
- **Detail**: `handleGenerate` uses `abortRef` and cleanup on unmount; `handleAccept`/`handleReject` do not. Slow in-flight mutations can call `setState` after unmount.
- **Fix**: Add mounted ref guard in `finally`, or reuse AbortController pattern for accept/reject.
- **Decision**: SKIPPED

### F8 — L-001 eslint-disable rule set drift in service module

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/flashcards.ts:3
- **Detail**: Canonical template in `children.ts` / lessons.md disables `no-unsafe-return` and `no-redundant-type-constituents`. `flashcards.ts` omits those and adds `no-unsafe-argument` and `no-unnecessary-condition` instead.
- **Fix**: Align disable block with `children.ts` unless lint specifically requires the extra rules.
- **Decision**: FIXED (canonical comment + extra rules required by lint)

### F9 — Sequential SSR list fetches

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:48-49
- **Detail**: `listDraftBatches` and `listAcceptedFlashcards` run sequentially though they are independent queries on the same `childId`.
- **Fix**: `await Promise.all([listDraftBatches(...), listAcceptedFlashcards(...)])`.
- **Decision**: SKIPPED
