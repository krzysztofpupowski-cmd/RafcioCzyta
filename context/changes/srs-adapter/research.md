---
date: 2026-06-02T12:00:00+02:00
researcher: Composer
git_commit: e222b318ef56d56843bce116e31a52f575c0b247
branch: main
repository: RafcioCzyta
topic: "Compatibility of ts-fsrs-docs.md with codebase for F-03 srs-adapter"
tags: [research, codebase, srs-adapter, ts-fsrs, f-03, flashcards]
status: complete
last_updated: 2026-06-02
last_updated_by: Composer
---

# Research: Compatibility of `ts-fsrs-docs.md` with codebase for F-03

**Date**: 2026-06-02  
**Researcher**: Composer  
**Git Commit**: `e222b318ef56d56843bce116e31a52f575c0b247`  
**Branch**: main  
**Repository**: RafcioCzyta

## Research Question

Review the codebase and decide whether `context/changes/srs-adapter/ts-fsrs-docs.md` is compatible with it, in preparation for implementing **F-03** (`srs-adapter`) from `context/foundation/roadmap.md`.

## Summary

**Verdict: `ts-fsrs-docs.md` is compatible with the codebase and prior product decisions.** It aligns with PRD Non-Goals (external SRS, not custom), F-01’s SRS-agnostic schema, service/API conventions, and Cloudflare Workers runtime. Nothing in the live code contradicts the document.

**What is not yet compatible is the running system** — because F-03 is unimplemented:

| Area | Docs assume | Codebase today |
|------|-------------|----------------|
| Dependency | `ts-fsrs` npm package | Not in `package.json` |
| Service | `src/lib/services/srs-adapter.ts` | Does not exist |
| Full FSRS state | `srs_state jsonb` ± `next_review_at` | No migration; F-01 has only denormalized columns |
| Accept hook | `createEmptyCard()` on accept | `acceptBatch` sets `status: "accepted"` only |
| Practice / mastery | S-04/S-05 flows | No review or mastery writers yet |

**Recommended next steps:** Lock Open Roadmap Q-SRS to **ts-fsrs** (docs + `library-research.md` already default here), run `/10x-plan srs-adapter` with a migration for `srs_state` + `next_review_at`, then implement adapter + accept hook.

---

## Detailed Findings

### F-03 requirements vs documentation

Roadmap F-03 outcome: accepted flashcards sync to a ready-made SRS; app reads review state for S-04 (practice) and S-05 (mastery). `ts-fsrs-docs.md` maps each requirement to concrete APIs:

1. **Sync on accept** → `createEmptyCard()` in `acceptBatch` (S-03 hook).
2. **S-04** → `repeat()` (preview), `next()` (commit), app-side due filter / SQL on `next_review_at`.
3. **S-05** → `get_retrievability()` → `mastery_score` (0–100).

These match [FR-006 and FR-007 in the PRD](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/e222b318ef56d56843bce116e31a52f575c0b247/context/foundation/prd.md) and the Non-Goal excluding a custom SRS.

### F-01 schema — partial alignment, expected gap

F-01 deliberately shipped SRS-agnostic columns only:

| Column | FSRS mapping (docs) | Present in DB |
|--------|---------------------|---------------|
| `reps_count` | `card.reps` | Yes |
| `last_reviewed_at` | `card.last_review` | Yes |
| `mastery_score` | derived from `get_retrievability()` | Yes |
| `state`, `due`, `stability`, `difficulty`, … | full `Card` | **No** |

Migration: [supabase/migrations/20260526143400_reading_domain_schema.sql](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/e222b318ef56d56843bce116e31a52f575c0b247/supabase/migrations/20260526143400_reading_domain_schema.sql#L107-L126) — no `srs_state`, `next_review_at`, or SRS indexes.

`practice_attempts.outcome` (`correct` / `incorrect`) matches the docs’ binary FSRS rating mapping ([enum at L56-L59](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/e222b318ef56d56843bce116e31a52f575c0b247/supabase/migrations/20260526143400_reading_domain_schema.sql#L56-L59)).

**Conclusion:** The persistence section of `ts-fsrs-docs.md` (lines 354–372) correctly states F-01 columns alone are insufficient; this was anticipated in F-01 planning (`plan-brief.md`: follow-up migration when Q-SRS resolves).

### Accept flow — correct hook, wrong payload shape

Single write path for acceptance:

- Service: [`acceptBatch`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/e222b318ef56d56843bce116e31a52f575c0b247/src/lib/services/flashcards.ts#L83-L107) — bulk `.update({ status: "accepted" })` only.
- API: [`src/pages/api/flashcards/accept.ts`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/e222b318ef56d56843bce116e31a52f575c0b247/src/pages/api/flashcards/accept.ts) — thin delegate; should stay thin.

Docs place `initSrsState()` / `createEmptyCard()` inside `acceptBatch`, not the route or React dashboard — **compatible with existing architecture**.

**Implementation note:** Bulk update must become per-card (or two-phase) because each `createEmptyCard()` produces distinct FSRS state. The docs’ `StoredSrsState` + `toStored` / `fromStored` helpers fit Supabase `jsonb` + `Date` serialization on Workers.

### Stack and runtime

| Constraint | Status |
|------------|--------|
| TypeScript / ESM | `package.json` `"type": "module"` |
| Astro 6 SSR API routes | `output: "server"`, `@astrojs/cloudflare` |
| Cloudflare Workers (workerd) | `wrangler.jsonc` → `@astrojs/cloudflare/entrypoints/server`, `nodejs_compat` |
| ts-fsrs (0 deps, pure TS) | Fits workerd; F-02 already validated workerd timeouts |
| Zod at boundaries | `zod` in deps; accept/generate/children APIs use `safeParse` |

`ts-fsrs` is **not** installed yet — expected for pre-plan research.

### Types and DTOs

- [`src/types.ts`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/e222b318ef56d56843bce116e31a52f575c0b247/src/types.ts) — `Flashcard` mirrors F-01; no SRS types yet.
- [`AcceptedFlashcardDTO`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/e222b318ef56d56843bce116e31a52f575c0b247/src/lib/dto/flashcards.ts#L24-L26) — UI omits `mastery_score` / SRS fields (appropriate until S-04/S-05).

New work: `src/lib/schemas/srs.ts` for `StoredSrsState`, `Rating`, review request bodies (per AGENTS.md + docs line 62).

### Suggested adapter shape vs conventions

Docs target [`src/lib/services/srs-adapter.ts`](./ts-fsrs-docs.md) with:

- Module-level `fsrs()` scheduler
- `initSrsState`, `previewReview`, `applyReview`, `isDue`
- ESLint file-wide disable pattern from `children.ts` (L-001 in `lessons.md`) when touching Supabase-derived types

Matches [`flashcard-generation.ts`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/e222b318ef56d56843bce116e31a52f575c0b247/src/lib/services/flashcard-generation.ts) and [`flashcards.ts`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/e222b318ef56d56843bce116e31a52f575c0b247/src/lib/services/flashcards.ts) service patterns.

### Minor doc vs code nuances (non-blocking)

1. **Package name in root `package.json`** is still `10x-astro-starter` — cosmetic; does not affect ts-fsrs.
2. **`repeat` vs `next`** — docs warn not to call both for one review; plan must enforce in S-04 API.
3. **`ReviewLog` persistence** — optional for MVP; `practice_attempts` has no `metadata` column yet — add only if undo/analytics needed.
4. **Backfill** — accepted cards created before F-03 (S-03 already live) need a one-time init or lazy `createEmptyCard()` on first review.

---

## Code References

- `supabase/migrations/20260526143400_reading_domain_schema.sql:107-126` — `flashcards` SRS-agnostic columns
- `supabase/migrations/20260526143400_reading_domain_schema.sql:140-155` — `practice_attempts` binary outcomes
- `src/lib/services/flashcards.ts:83-107` — `acceptBatch` (F-03 hook)
- `src/pages/api/flashcards/accept.ts:13,78-81` — accept API (`prerender = false`)
- `src/lib/services/flashcard-generation.ts:92-103` — draft insert (not accept)
- `package.json:14-37` — deps (no `ts-fsrs` yet)
- `astro.config.mjs:10-16` — server + Cloudflare adapter
- `wrangler.jsonc:1-25` — workerd deploy config
- `context/changes/srs-adapter/ts-fsrs-docs.md` — API reference under review

---

## Architecture Insights

1. **Two-layer persistence:** Full FSRS `Card` in `srs_state jsonb`; denormalized `reps_count`, `last_reviewed_at`, `mastery_score` for dashboards and simple queries (docs + F-01 intent).
2. **Preferred migration hybrid (from docs):** `next_review_at timestamptz` + `srs_state jsonb` + index `(child_id, status, next_review_at)` for S-04 due queue under NFR &lt;10 min session.
3. **Adapter as normalization boundary:** Maps FSRS 4 ratings → `practice_attempt_outcome`; keeps PRD binary model without changing F-01 enum.
4. **Stream C dependency:** S-03 done; S-04/S-05 blocked only on F-03 + schema migration, not on accept UI.

---

## Historical Context (from prior changes)

- [`context/changes/reading-domain-schema/plan.md`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/e222b318ef56d56843bce116e31a52f575c0b247/context/changes/reading-domain-schema/plan.md) — Q-SRS open at F-01; adapter deferred; binary practice outcomes.
- [`context/changes/reading-domain-schema/plan-brief.md`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/e222b318ef56d56843bce116e31a52f575c0b247/context/changes/reading-domain-schema/plan-brief.md) — optional `srs_state jsonb` follow-up.
- [`context/changes/batch-flashcard-acceptance/plan.md`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/e222b318ef56d56843bce116e31a52f575c0b247/context/changes/batch-flashcard-acceptance/plan.md) — S-03 out of scope for SRS wiring.
- [`context/changes/srs-adapter/library-research.md`](./library-research.md) — `ts-fsrs` default for stack; 2026-06-02.
- [`context/changes/github-migration/bodies/Q-SRS.md`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/e222b318ef56d56843bce116e31a52f575c0b247/context/changes/github-migration/bodies/Q-SRS.md) — open decision; blocks F-03 in roadmap until closed.
- [`context/foundation/roadmap.md`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/blob/e222b318ef56d56843bce116e31a52f575c0b247/context/foundation/roadmap.md) — F-03 blocked; unlocks S-04, S-05.

---

## Related Research

- [`context/changes/srs-adapter/library-research.md`](./library-research.md) — SRS library shortlist for Cloudflare + Supabase
- [`context/changes/srs-adapter/ts-fsrs-docs.md`](./ts-fsrs-docs.md) — Context7 API reference mapped to F-03

---

## Open Questions

1. **Q-SRS formal closure** — Confirm `ts-fsrs` as the MVP library (research strongly supports it; roadmap still lists Q #1 open).
2. **Persistence option** — Choose among docs options: `srs_state` only vs `next_review_at` + `srs_state` (recommended for S-04 SQL due queue).
3. **Backfill policy** — How to initialize SRS for flashcards already `accepted` before F-03 ships.
4. **Rating UX for S-04** — Four FSRS buttons vs simplified binary UI (API can still use `Rating` enum internally).
5. **Strict vs lenient correct mapping** — Docs allow stricter mapping (only `Good`/`Easy` → `correct`).
