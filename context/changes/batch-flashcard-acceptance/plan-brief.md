# Batch Flashcard Acceptance (S-03) — Plan Brief

> Full plan: `context/changes/batch-flashcard-acceptance/plan.md`

## What & Why

Parents must review AI-generated flashcards before they become practice material — this is the PRD trust gate (FR-004, FR-005). S-02 persists draft batches; S-03 adds batch-level accept/reject actions and browsing of prepared vs accepted cards on `/dashboard`, enforcing the business rule that only parent-approved material can eventually reach practice.

## Starting Point

F-01 schema ships `flashcard_status`, `generation_id`, and parent-scoped RLS UPDATE on `flashcards`. S-02 adds generation (`POST /api/flashcards/generate`) and a read-only `DraftFlashcardList` showing only the latest client-side batch. Multiple draft generations stack in the DB with no review UI, no list/update service, and no accept/reject API.

## Desired End State

On `/dashboard`, below the profile card, parents see one flashcard card with the existing generate button plus two tabs: **Przygotowane** (all pending batches, oldest first, with **Akceptuj partię** / **Odrzuć partię** buttons) and **Zaakceptowane** (all accepted cards, read-only). Actions update optimistically; initial data loads via SSR. Rejected cards vanish from the UI.

## Key Decisions Made

| Decision            | Choice                                 | Why (1 sentence)                                           | Source |
| ------------------- | -------------------------------------- | ---------------------------------------------------------- | ------ |
| Action granularity  | Batch-level only (whole generation)    | Matches FR-004 "partiami" and F-01's `generation_id` model | Plan   |
| Partial acceptance  | All-or-nothing per batch               | Simplest service — one UPDATE per action                   | Plan   |
| Draft backlog       | Show all pending batches, oldest first | Nothing hidden; parent clears backlog explicitly           | Plan   |
| Browse layout       | Tabs: Przygotowane / Zaakceptowane     | Clean FR-005 separation; familiar mobile pattern           | Plan   |
| Accepted list scope | All accepted cards for child           | Full browse per FR-005; acceptable at MVP scale            | Plan   |
| Rejected cards      | Hidden (no third tab)                  | Simplest MVP; PRD doesn't require rejection audit          | Plan   |
| Initial data load   | SSR in `dashboard.astro`               | Instant visible backlog; no loading flash                  | Plan   |
| Post-action UX      | Optimistic local state update          | Snappy feel; reconcile on error only                       | Plan   |

## Scope

**In scope:**

- New service `src/lib/services/flashcards.ts` (list drafts, list accepted, accept/reject batch).
- DTO extensions in `src/lib/dto/flashcards.ts`.
- `POST /api/flashcards/accept` and `POST /api/flashcards/reject` with zod-validated `{ generationId }`.
- Refactor to `FlashcardDashboardCard` island (generation + tabs + optimistic actions).
- SSR hydration of draft batches and accepted cards in `dashboard.astro`.

**Out of scope:**

- Per-card accept/reject, partial batches, rejected tab, content editor.
- Schema/RLS changes, GET list APIs, practice/SRS wiring.
- Dedicated `/flashcards` route, automated tests, rate limits.

## Architecture / Approach

```
dashboard.astro (SSR)
  └─ listDraftBatches + listAcceptedFlashcards when child exists
  └─ <FlashcardDashboardCard client:load initialDraftBatches initialAcceptedCards>
       ├─ Generuj 8 fiszek → POST /api/flashcards/generate → append to draftBatches
       └─ Tabs
            ├─ Przygotowane: DraftBatchPanel × N
            │     └─ Akceptuj → POST /accept → remove batch + prepend to acceptedCards
            │     └─ Odrzuć   → POST /reject → remove batch
            └─ Zaakceptowane: AcceptedFlashcardList (read-only)
```

Batch mutation: `UPDATE flashcards SET status = … WHERE generation_id = ? AND child_id = ? AND status = 'draft'`. RLS scopes to parent's child.

## Phases at a Glance

| Phase                                    | What it delivers                                                           | Key risk                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1. Backend — service + accept/reject API | List/transition functions + two JSON POST endpoints                        | Batch-empty guard must return 404, not silent 200 — breaks optimistic UI trust       |
| 2. Frontend — tabs + SSR + optimistic UI | Single island replacing `FlashcardGenerationCard`; full parent review flow | Must be one React island for shared state; two islands cannot sync generate + accept |

**Prerequisites:** F-01, F-02, S-01, S-02 (all done per roadmap).
**Estimated effort:** ~2 after-hours sessions across 2 phases.

## Open Risks & Assumptions

- **Unbounded accepted list.** All accepted cards render without pagination — fine at MVP scale; revisit if parents accumulate hundreds.
- **Optimistic UI vs concurrent tabs.** Two browser tabs accepting the same batch could desync local state — acceptable at PRD scale; refresh reconciles.
- **No DB enforcement of practice eligibility.** Status transitions are correct here; S-04 must still filter to accepted cards at child's level.

## Success Criteria (Summary)

- Parent sees every pending AI batch and can accept or reject each whole batch with one click.
- Accepted cards appear in a browsable **Zaakceptowane** tab and survive page refresh.
- Rejected cards disappear; no draft reaches "accepted" without explicit parent action.
