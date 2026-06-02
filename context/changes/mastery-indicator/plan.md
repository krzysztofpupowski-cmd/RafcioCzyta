# Mastery Indicator (S-05) Implementation Plan

## Overview

Implement FR-007: a parent on `/dashboard` sees a **simple mastery indicator** — the share of accepted flashcards at the child's **current reading level** that FSRS considers **mastered** (live retrievability ≥ 90). The metric is **not** a reading diagnosis; it closes the US-01 north star after level → generate → accept → practice (S-04). No schema changes; reuse F-03 `srs_state` + `masteryScoreFromCard()`.

## Current State Analysis

- **S-04 done.** Practice sessions update `flashcards.mastery_score` on each review via `applyReview()` in `src/lib/services/practice-session.ts:144-157`. Due count SSR works from `countDueCards()` in `dashboard.astro:58-64`.
- **F-03 done.** `masteryScoreFromCard()` wraps `scheduler.get_retrievability(card, now, false) * 100` in `src/lib/services/srs-adapter.ts:65-67`. Full FSRS state lives in `srs_state jsonb`.
- **No mastery UI or API.** `AcceptedFlashcardDTO` omits SRS fields (`src/lib/dto/flashcards.ts:24-26`). `/dashboard` stacks three cards only (`src/pages/dashboard.astro:78-121`).
- **Denormalized column exists but is time-stale between reviews.** S-05 uses **live recompute** at read time so the indicator reflects retrievability **now**, per planning decision and `context/changes/srs-adapter/ts-fsrs-docs.md:350`.

### Key Discoveries:

- `countDueCards` filter pattern — `child_id` + `status = 'accepted'` + `level = current_level` (`src/lib/services/practice-session.ts:32-39`) — reuse for mastery eligibility.
- `storedSrsStateSchema` + `fromStored` parse path already proven in `recordPracticeReview` (`practice-session.ts:139-144`).
- No `GET` API routes exist yet; this slice introduces the first read-only JSON endpoint.
- `backfillAcceptedCardsWithoutSrs()` in `flashcards.ts` may leave legacy rows without scorable SRS; they still count in `acceptedCount` but not in `masteredCount` until backfill or first review.
- Repo has no automated test runner — verify with `npm run lint`, `npm run build`, manual UI.

## Desired End State

A parent with a child profile visits `/dashboard` and:

1. Sees a fourth card **Postęp w opanowaniu** (or equivalent Polish title) below the practice card.
2. When `current_level` is set and accepted cards exist at that level, sees copy like **„3 z 8 fiszek opanowanych (38%)”** where “opanowana” means live retrievability ≥ 90.
3. When prerequisites are missing, sees **guided copy** (not a broken 0%): no profile → create profile; no level → set level; no accepted cards → accept fiszki first; cards but none mastered → encourage starting practice.
4. After completing a practice session, the indicator **updates without full page reload** via `GET /api/mastery/summary` refetch triggered from the practice island.

Verify manually: accept batch → indicator shows 0/N → complete practice session rating cards Good/Easy → indicator increases → cards with sustained reviews eventually count as mastered.

## What We're NOT Doing

- Per-card mastery badges in `AcceptedFlashcardList` (aggregate only in S-05).
- Schema migrations, RLS changes, or new Supabase tables.
- Charts, history timelines, session analytics from `practice_attempts`.
- Mastery across all accepted levels (only `current_level`).
- Average-score primary display (planning chose **% mastered** only).
- Denormalized-column-only aggregation without live recompute.
- Dedicated `/mastery` route or middleware additions.
- Automated test suite (no runner in repo).
- Precise literacy assessment or PRD 95% sentence KPI instrumentation.
- Child-facing login or separate child role.
- Exposing `srs_state`, intervals, or raw `mastery_score` per card to the client.

## Implementation Approach

Add `src/lib/services/mastery-indicator.ts` with `getMasterySummary()` — query accepted cards at `current_level` with non-null `srs_state`, parse each row, compute `masteryScoreFromCard(fromStored(...), now)`, count those ≥ `MASTERY_THRESHOLD` (90). Map to `MasterySummaryDTO`.

Add `GET /api/mastery/summary` (first GET route) returning `{ ok: true, summary }` with auth + child guards matching practice routes.

Add `MasteryIndicatorCard` React island on `dashboard.astro` with SSR `initialSummary` when `childExists && childLevel`. Use `client:load` for hydration + client refetch.

Wire post-practice refresh: `PracticeSessionCard` dispatches a window `CustomEvent('rc-practice-complete')` when a session finishes with at least one review; `MasteryIndicatorCard` listens and refetches the GET endpoint.

## Critical Implementation Details

**Cards without `srs_state`.** Query all accepted rows at `current_level` for `acceptedCount`. For mastery scoring, skip rows where `srs_state` is null or fails `storedSrsStateSchema` parse (log server-side, do not fail entire summary — treat as not mastered). Optionally trigger `backfillAcceptedCardsWithoutSrs` is out of scope; dashboard already assumes F-03 backfill ran for scoring, but null rows still appear in „0 z N”.

**Zero accepted cards.** Return `{ acceptedCount: 0, masteredCount: 0, percentMastered: 0 }`; UI shows guided copy, not a percentage headline.

**Percent rounding.** `percentMastered = acceptedCount === 0 ? 0 : Math.round((masteredCount / acceptedCount) * 100)`.

**Cross-island events.** Use namespaced `window` events to avoid coupling islands through a wrapper component:

- `rc-practice-complete` — dispatch when transitioning to `complete` phase and when early end saves at least one review (`PracticeSessionCard`).
- `rc-flashcards-accepted` — dispatch after successful batch accept (`FlashcardDashboardCard`); `MasteryIndicatorCard` refetches so „0 z N” appears without full page reload.

## Phase 1: Backend — mastery service + GET API

### Overview

Implement live mastery aggregation and an authenticated read endpoint. After this phase, a logged-in parent can `GET /api/mastery/summary` and receive `{ acceptedCount, masteredCount, percentMastered }` for their child's current level.

### Changes Required:

#### 1. Mastery DTOs

**File**: `src/lib/dto/mastery.ts`

**Intent**: Wire types for the mastery summary API and React island. Primitives only — no `@/types` in components.

**Contract**:

- Export `MasterySummaryDTO`: `{ acceptedCount: number; masteredCount: number; percentMastered: number }`.
- Export `MasterySummarySuccessResponse`: `{ ok: true; summary: MasterySummaryDTO }`.
- Export `MasteryErrorResponse`: `{ ok: false; error: string }`.

#### 2. Mastery indicator service

**File**: `src/lib/services/mastery-indicator.ts`

**Intent**: Own mastery aggregation reads. Keep FSRS math in `srs-adapter.ts` and flashcard listing in `flashcards.ts`.

**Contract**:

- File-wide L-001 disable header (same shape as `src/lib/services/children.ts`).
- Import `AppSupabase` from `./children`.
- Export `MASTERY_THRESHOLD = 90` (constant used by service and documented in plan brief).
- Export stable error codes:
  - `MASTERY_ERROR_NO_CHILD` — no child profile.
  - `MASTERY_ERROR_NO_CHILD_LEVEL` — `current_level` is null.
- Export `getMasterySummary(supabase, { childId, level: StoredReadingLevel })` → `MasterySummaryDTO`.
  - Query `.from('flashcards').select('srs_state').eq('child_id', childId).eq('status', 'accepted').eq('level', level)` (no `srs_state` filter — all accepted at level count toward `acceptedCount`).
  - For each row: if `srs_state` is null, skip mastery scoring; else parse with `storedSrsStateSchema`; on success, `score = masteryScoreFromCard(fromStored(parsed), new Date())`; if `score >= MASTERY_THRESHOLD`, increment `masteredCount`.
  - `acceptedCount` = total rows returned (null/unparseable `srs_state` count toward N but not toward mastered).
  - Compute `percentMastered` as specified in Critical Implementation Details.

#### 3. GET summary API route

**File**: `src/pages/api/mastery/summary.ts`

**Intent**: Thin authenticated read endpoint for client refetch after practice and optional external callers.

**Contract**:

- `export const prerender = false`.
- Export `GET: APIRoute` — no request body.
- Auth: require `context.locals.user`; 401 Polish error if missing.
- Load child via `getMyChild()`; map errors like `src/pages/api/practice/start.ts`.
- If no child → 400 `{ ok: false, error: '...' }` with `MASTERY_ERROR_NO_CHILD` message.
- If `child.current_level` is null → 400 with level-set guidance (mirror practice copy).
- Call `getMasterySummary(supabase, { childId: child.id, level: child.current_level })`.
- 200 → `{ ok: true, summary } satisfies MasterySummarySuccessResponse`.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking / build passes: `npm run build`
- Astro env sync: `npx astro sync`

#### Manual Verification:

- With session cookie, `GET /api/mastery/summary` returns `{ ok: true, summary }` when child + level exist.
- Returns 401 unauthenticated, 400 when level is null.
- After practice reviews, repeated GET shows increased `masteredCount` when ratings yield retrievability ≥ 90.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Dashboard UI — MasteryIndicatorCard + practice refresh

### Overview

Mount the mastery card on `/dashboard`, SSR initial summary, implement guided empty states, and refetch after practice completes.

### Changes Required:

#### 1. MasteryIndicatorCard component

**File**: `src/components/mastery/MasteryIndicatorCard.tsx`

**Intent**: Display FR-007 aggregate indicator with cosmic card styling consistent with `FlashcardDashboardCard` and `PracticeSessionCard`.

**Contract**:

- Props (primitives only): `childExists: boolean`, `childLevel: string | null`, `initialSummary: MasterySummaryDTO | null`, `initialError?: string | null`.
- Card shell: `rounded-2xl border border-white/10 bg-white/10 p-8 backdrop-blur-xl`; gradient title **Postęp w opanowaniu** (or close variant).
- Subtitle uses `resolveDisplayLevel(childLevel)` when level is set.
- **Guided states** (always render card):
  - `!childExists` → „Najpierw utwórz profil dziecka powyżej.”
  - `childExists && !childLevel` → „Ustaw poziom czytania, aby śledzić opanowanie materiału.”
  - `childLevel && summary.acceptedCount === 0` → „Zaakceptuj fiszki na swoim poziomie, aby śledzić postęp.”
  - `acceptedCount > 0 && masteredCount === 0` → show **„0 z N fiszek opanowanych”** + helper „Ćwicz regularnie — opanowanie rośnie z powtórkami.”
  - Normal → **„X z Y fiszek opanowanych (Z%)”** with optional short disclaimer that this is a simple repetition-based indicator, not a reading diagnosis (one line, `text-xs text-blue-100/60`).
- `useEffect`: listen for `rc-practice-complete` and `rc-flashcards-accepted` on `window`; on either fire, `fetch('/api/mastery/summary')`, update local summary state on success.
- Show fetch errors with existing error styling pattern (inline red/amber text); keep last good summary visible on transient failure if possible.

#### 2. Dashboard SSR wiring

**File**: `src/pages/dashboard.astro`

**Intent**: Load initial mastery summary alongside existing dashboard data and mount the fourth island.

**Contract**:

- Import `getMasterySummary` from `@/lib/services/mastery-indicator` and `MasterySummaryDTO` from `@/lib/dto/mastery`.
- When `childExists && childId && childLevel`, call `getMasterySummary(supabase, { childId, level: childLevel })` inside existing try/catch block (parallel to `countDueCards`).
- Mount `<MasteryIndicatorCard ... client:load />` **after** `PracticeSessionCard`, passing `initialSummary`, `childExists`, `childLevel`, and optional fetch error string.

#### 3. Flashcard accept refresh hook

**File**: `src/components/flashcards/FlashcardDashboardCard.tsx`

**Intent**: Notify mastery island to refetch after a batch is accepted so „0 z N” appears without reload.

**Contract**:

- Add small helper `dispatchFlashcardsAccepted()` that calls `window.dispatchEvent(new CustomEvent('rc-flashcards-accepted'))` when `typeof window !== 'undefined'`.
- Call it in `handleAccept` after successful accept (`data.ok`), alongside local state updates.

#### 4. Practice session completion hook

**File**: `src/components/practice/PracticeSessionCard.tsx`

**Intent**: Notify mastery island to refetch without a shared wrapper or full page reload.

**Contract**:

- Add small helper `dispatchPracticeComplete()` that calls `window.dispatchEvent(new CustomEvent('rc-practice-complete'))` when `typeof window !== 'undefined'`.
- Call it when:
  - Session reaches `complete` phase (after last card reviewed), immediately when setting `setPhase('complete')`.
  - Early end (`handleEndEarly`) when `reviewedInSession > 0`, after successful end API call.
- Do **not** dispatch on empty sessions or zero reviews.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking / build passes: `npm run build`

#### Manual Verification:

- `/dashboard` shows mastery card in all guided states (no profile, no level, no cards, zero mastered, normal).
- Mobile layout: fourth card readable without horizontal scroll (PRD mobile NFR).
- Accept a batch → mastery card updates to „0 z N” without manual page reload.
- Complete a practice session → mastery numbers update without manual page reload.
- Disclaimer copy present; indicator does not expose per-card scores or SRS internals.
- No regressions in profile, flashcard, or practice cards.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before marking the slice complete.

---

## Testing Strategy

### Unit Tests:

- Not applicable — no test runner configured.

### Integration Tests:

- Manual API: authenticated GET before/after practice; verify summary monotonicity for cards rated Good/Easy repeatedly.

### Manual Testing Steps:

1. New parent, no child → mastery card shows profile guidance.
2. Child without level → level guidance.
3. Accept 8 cards, never practice → „0 z 8” + practice encouragement.
4. Practice session, rate several cards Good/Easy → indicator updates on complete without reload.
5. Change reading level → indicator recalculates for new level's accepted cards only.
6. Run `npm run lint` and `npm run build`.

## Performance Considerations

Live recompute parses `srs_state` for every accepted card at current level on each summary read. Acceptable at MVP scale (tens of cards per child). If latency becomes visible, a follow-up slice could add SQL aggregation on denormalized `mastery_score` with scheduled refresh — out of scope for S-05.

## Migration Notes

No migration. Existing `mastery_score` column remains denormalized for future SQL queries; S-05 display uses live FSRS retrievability.

## References

- PRD FR-007: `context/foundation/prd.md`
- Roadmap S-05: `context/foundation/roadmap.md`
- FSRS mastery semantics: `context/changes/srs-adapter/ts-fsrs-docs.md`
- Deferred from S-04: `context/changes/srs-practice-session/plan.md` (What We're NOT Doing)
- Practice patterns: `context/changes/srs-practice-session/plan-brief.md`
- L-001 DTO boundary: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — mastery service + GET API

#### Automated

- [x] 1.1 Linting passes: `npm run lint`
- [x] 1.2 Type checking / build passes: `npm run build`
- [x] 1.3 Astro env sync: `npx astro sync`

#### Manual

- [x] 1.4 With session cookie, `GET /api/mastery/summary` returns `{ ok: true, summary }` when child + level exist
- [x] 1.5 Returns 401 unauthenticated, 400 when level is null
- [x] 1.6 After practice reviews, repeated GET shows increased `masteredCount` when ratings yield retrievability ≥ 90

### Phase 2: Dashboard UI — MasteryIndicatorCard + practice refresh

#### Automated

- [ ] 2.1 Linting passes: `npm run lint`
- [ ] 2.2 Type checking / build passes: `npm run build`

#### Manual

- [ ] 2.3 `/dashboard` shows mastery card in all guided states (no profile, no level, no cards, zero mastered, normal)
- [ ] 2.4 Mobile layout: fourth card readable without horizontal scroll (PRD mobile NFR)
- [ ] 2.5 Accept a batch → mastery card updates to „0 z N” without manual page reload
- [ ] 2.6 Complete a practice session → mastery numbers update without manual page reload
- [ ] 2.7 Disclaimer copy present; indicator does not expose per-card scores or SRS internals
- [ ] 2.8 No regressions in profile, flashcard, or practice cards
