# SRS Adapter (F-03) — Plan Brief

> Full plan: `context/changes/srs-adapter/plan.md`
> Research: `context/changes/srs-adapter/research.md`

## What & Why

Accepted flashcards must enter a ready-made spaced-repetition algorithm so S-04 (practice) and S-05 (mastery) can read review state — PRD Non-Goals forbid building a custom SRS. F-03 installs `ts-fsrs`, persists full scheduler state on `flashcards`, and initializes SRS when parents accept batches (S-03 hook).

## Starting Point

F-01 ships SRS-agnostic columns (`reps_count`, `last_reviewed_at`, `mastery_score`) without `srs_state` or `next_review_at`. S-03's `acceptBatch` bulk-updates `status: "accepted"` only. `ts-fsrs` is not in `package.json`; no adapter service exists. Research confirms `ts-fsrs-docs.md` aligns with stack and conventions.

## Desired End State

After F-03 lands, every accepted flashcard has `srs_state jsonb` and `next_review_at` populated via `createEmptyCard()` semantics. Pre-F-03 accepted cards are backfilled eagerly. `src/lib/services/srs-adapter.ts` exposes `initSrsState`, `previewReview`, `applyReview`, and `isDue` for S-04/S-05 — no new HTTP routes in this slice. Accepting a batch initializes per-card FSRS state with denormalized columns at zero.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| SRS library (Q-SRS) | `ts-fsrs` | Official OSR package; retrievability for S-05; zero deps on workerd | Research / Plan |
| Persistence | `next_review_at` + `srs_state jsonb` + index | Fast SQL due queue for S-04 NFR plus full FSRS fidelity | Research / Plan |
| Backfill | Eager on deploy | Pre-S-03 accepted cards enter practice queue immediately | Plan |
| F-03 scope | Foundation only (no review API routes) | Clean slice boundary; S-04 owns practice UX and endpoints | Plan |
| Rating → outcome | Again/Hard → incorrect; Good/Easy → correct | Matches MVP binary model and ts-fsrs-docs | Research / Plan |
| Verification | lint / build / astro sync + manual smoke | Matches every prior slice; no test runner in repo | Plan |

## Scope

**In scope:**

- Supabase migration: `srs_state jsonb`, `next_review_at timestamptz`, due-queue index.
- `npm install ts-fsrs`.
- `src/lib/schemas/srs.ts` — `StoredSrsState` Zod schema.
- `src/lib/services/srs-adapter.ts` — init, preview, apply, isDue, serialization helpers, outcome mapping.
- Refactor `acceptBatch` to per-card SRS initialization.
- `backfillAcceptedCardsWithoutSrs()` service function + one-time manual run.
- Regenerate `src/db/database.types.ts`.

**Out of scope:**

- S-04 practice session UI and API routes.
- S-05 mastery indicator UI.
- `ReviewLog` persistence / `practice_attempts` metadata column.
- Per-child FSRS parameter tuning.
- Automated unit tests (vitest).
- UI changes to accept flow (DTO shape unchanged for parent).

## Architecture / Approach

```
accept.ts (unchanged thin delegate)
  └─ acceptBatch(flashcards.ts)
       ├─ SELECT draft cards for generation
       └─ per card: initSrsState() → toStored() → UPDATE status + srs_state + next_review_at + denorm cols

srs-adapter.ts (module-level fsrs() scheduler)
  ├─ initSrsState()     — createEmptyCard (accept + backfill)
  ├─ previewReview()    — repeat() for S-04
  ├─ applyReview()      — next() + denorm cols + practice_outcome mapping for S-04
  └─ isDue()            — due <= now (S-04 fallback)
```

Two-layer persistence: full FSRS `Card` in `srs_state`; denormalized columns for dashboards. `next_review_at` mirrors `srs_state.due` for indexed due queries.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Schema migration | Columns, index, typegen | Backfill cannot run in SQL — deferred to Phase 3 service |
| 2. Adapter layer | ts-fsrs, schemas, srs-adapter service | Date ↔ timestamp serialization bugs on Workers |
| 3. Accept hook + backfill | acceptBatch refactor, eager backfill function | Per-card updates slower than bulk — fine at ~8 cards/batch |

**Prerequisites:** F-01, S-03 (both done).
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- **Eager backfill floods first S-04 session** — all backfilled cards get `due = now`; acceptable at MVP scale; S-04 may cap session size.
- **`next_review_at` sync** — S-04 must update both fields on every review; adapter owns the invariant.
- **Nullable `srs_state` on drafts** — only accepted rows must have state after F-03; no DB CHECK until backfill proven.

## Success Criteria (Summary)

- Accepting a batch writes distinct `srs_state` and `next_review_at` per card in Supabase.
- Pre-F-03 accepted cards backfill with no null `srs_state`.
- `npm run lint` and `npm run build` pass; adapter exports ready for S-04 import.
