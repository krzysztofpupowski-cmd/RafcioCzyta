# Mastery Indicator (S-05) — Plan Brief

> Full plan: `context/changes/mastery-indicator/plan.md`

## What & Why

Parents need FR-007: a **simple mastery indicator** derived from spaced-repetition reviews — not a reading diagnosis. This closes the US-01 north star (level → generate → accept → practice → **visible progress**) and proves the product hypothesis that parent-controlled material at the right level leads to measurable repetition-based mastery.

## Starting Point

S-04 ships practice on `/dashboard` and persists SRS updates including `mastery_score` on each review. F-03 provides `masteryScoreFromCard()` from FSRS retrievability. No mastery UI, DTO, or API exists; `AcceptedFlashcardDTO` intentionally omits SRS fields. `/dashboard` has three stacked cards only.

## Desired End State

On `/dashboard`, a fourth card shows **„X z Y fiszek opanowanych (Z%)”** for accepted cards at the child's **current reading level**, where “opanowana” means live retrievability ≥ 90. Guided copy appears when prerequisites are missing. After a practice session, the indicator refreshes via `GET /api/mastery/summary` without a full page reload.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Primary metric | % mastered cards | Simple parent mental model — matches roadmap “odsetek opanowanych fiszek” | Plan |
| Score computation | Live `masteryScoreFromCard()` | Reflects FSRS retrievability at read time, not stale denormalized column | Plan |
| Mastered threshold | ≥ 90 | Aligns with ts-fsrs default `request_retention: 0.9` | Plan |
| Card scope | `current_level` accepted only | Same invariant as practice due queue and F-01 business rule | Plan |
| UI placement | 4th dashboard card | Matches S-03/S-04 cosmic card stack | Plan |
| Per-card detail | Aggregate only | Keeps S-05 minimal; FR-007 satisfied with one number | Plan |
| Post-practice refresh | `GET /api/mastery/summary` + client fetch | Fresh aggregate without full reload; first GET route in app | Plan |
| Empty states | Always visible with guided copy | Teaches next step in US-01 funnel | Plan |
| Cross-island wiring | `rc-practice-complete` window event | Avoids refactoring three islands into one wrapper | Plan |

## Scope

**In scope:**

- `src/lib/services/mastery-indicator.ts` — `getMasterySummary()`, `MASTERY_THRESHOLD = 90`
- `src/lib/dto/mastery.ts` — wire DTOs
- `GET /api/mastery/summary`
- `MasteryIndicatorCard` + SSR on `/dashboard`
- `PracticeSessionCard` dispatches refresh event on session complete

**Out of scope:**

- Per-card badges in accepted list
- Schema/RLS changes, charts, history, `practice_attempts` analytics UI
- Mastery across all levels, average-score display, denorm-only aggregation
- Automated tests, `/mastery` route, child login role

## Architecture / Approach

```
dashboard.astro (SSR initialSummary when child + level)
  ├─ ChildProfileForm
  ├─ FlashcardDashboardCard
  ├─ PracticeSessionCard ──dispatch──► rc-practice-complete
  └─ MasteryIndicatorCard (client:load)
       ├─ render guided / aggregate UI
       └─ on event → GET /api/mastery/summary → update local state

mastery-indicator.ts → query accepted + level + srs_state
                    → parse → masteryScoreFromCard(fromStored(...))
                    → count score >= 90 → MasterySummaryDTO
```

Eligible cards: `status = 'accepted'`, `level = current_level`, `srs_state IS NOT NULL`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Backend | Service + GET API | Unparseable legacy `srs_state` rows skew counts |
| 2. Dashboard UI | 4th card + post-practice refresh | Cross-island event wiring between separate React islands |

**Prerequisites:** S-04 and F-03 (both done).
**Estimated effort:** ~1–2 sessions across 2 phases.

## Open Risks & Assumptions

- **Legacy rows without `srs_state`** — excluded from aggregate; assume F-03 backfill ran.
- **Live recompute cost** — fine at MVP card counts; may need denorm/SQL later if library grows.
- **Level change** — indicator scope switches to new level's cards (by design).
- **No automated tests** — manual mobile + API verification required.

## Success Criteria (Summary)

- Parent sees „X z Y opanowanych (Z%)” on `/dashboard` after accepting and practicing material.
- Indicator updates after practice without page reload.
- Guided copy covers missing profile, level, or accepted cards — no confusing bare 0% on first visit.
