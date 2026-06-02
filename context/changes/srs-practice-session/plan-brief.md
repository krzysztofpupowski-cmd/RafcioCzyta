# SRS Practice Session (S-04) — Plan Brief

> Full plan: `context/changes/srs-practice-session/plan.md`

## What & Why

Parents need FR-006: a **simple practice mode** on **accepted** flashcards using the **ready-made SRS** (`ts-fsrs`), so the MVP proves the full US-01 path (level → generate → accept → **practice**). Without S-04, accepted cards never get reviewed despite F-03 persisting SRS state.

## Starting Point

F-03 ships `srs-adapter` (`applyReview`, `next_review_at`, per-card init on accept). S-03 delivers accepted cards on `/dashboard`. F-01 defines `practice_sessions` / `practice_attempts` with RLS, but **no app code** writes to them. There is no practice API or UI.

## Desired End State

On `/dashboard`, a parent with a set reading level taps **Ćwicz teraz**, runs an in-page session (up to **10** due cards at that level): see word → reveal hint → pick **Again / Hard / Good / Easy** → SRS and attempts persist → session closes. If nothing is due, they see **Brak fiszek do powtórki**.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Rating UX | 4 FSRS buttons | Uses existing `reviewRatingSchema` and full scheduler fidelity | Plan |
| Entry point | Dashboard CTA only | Matches mobile parent workflow; no extra route | Plan |
| Session cap | 10 cards | Fits &lt;10 min NFR and backfill flood risk from F-03 | Plan |
| Eligible cards | `current_level` only | Honors F-01 app invariant; null level blocks start | Plan |
| Card flow | Reveal hint then rate | Supports reading pedagogy without flipping UI complexity | Plan |
| Persistence | Full session + attempts | Uses existing tables; enables S-05 analytics later | Plan |
| Empty due | Message only | Keeps MVP simple; no “study ahead” | Plan |
| API shape | start → review (×N) → end | Clear lifecycle; server owns SRS commits | Plan |

## Scope

**In scope:**

- `src/lib/services/practice-session.ts` — due query, session lifecycle, review writes
- `src/lib/dto/practice.ts` — wire DTOs
- `POST /api/practice/start`, `review`, `end`
- `PracticeSessionCard` island + SSR `dueCount` on `/dashboard`

**Out of scope:**

- S-05 mastery indicator (FR-007)
- `/practice` route, schema/RLS changes, automated tests
- Interval previews, not-due practice, child login role

## Architecture / Approach

```
dashboard.astro (SSR dueCount)
  ├─ FlashcardDashboardCard (unchanged)
  └─ PracticeSessionCard (client:load)
       ├─ POST /api/practice/start → session + ≤10 PracticeCardDTO[]
       ├─ POST /api/practice/review → applyReview + practice_attempts
       └─ POST /api/practice/end → ended_at

practice-session.ts → srs-adapter.applyReview + flashcards UPDATE
```

Due cards: `accepted` + `child_id` + `level = current_level` + `next_review_at <= now()`, limit 10.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Backend | Service + 3 API routes | `srs_state` parse failures on legacy rows |
| 2. Dashboard UI | CTA + session flow on `/dashboard` | Single island state vs flashcard card layout |

**Prerequisites:** S-03, F-03 (both done).
**Estimated effort:** ~2 sessions across 2 phases.

## Open Risks & Assumptions

- **Null `current_level`** — practice blocked until parent sets level (by design).
- **Backfill due flood** — first sessions may feel long; cap 10 mitigates.
- **No automated tests** — manual API + mobile UI verification required.

## Success Criteria (Summary)

- Parent completes a multi-card session on `/dashboard` with SRS updates visible in DB.
- `practice_sessions` and `practice_attempts` rows created for real reviews.
- Zero due and missing level show clear Polish messaging without broken UI.
