# Reading-Domain Schema (F-01) — Plan Brief

> Full plan: `context/changes/reading-domain-schema/plan.md`

## What & Why

Land the first Supabase migration for RafcioCzyta: a child profile, batches of AI-generated flashcards with an acceptance status, SRS-agnostic mastery columns, and practice sessions with per-card outcomes — plus per-operation RLS on every table. Without a persisted domain model every downstream slice becomes in-memory mocks; per the roadmap risk note this is *"the largest hidden cost"* under the `time` constraint.

## Starting Point

The 10x Astro Starter is bootstrapped with Supabase cookie auth (`src/middleware.ts`, `src/lib/supabase.ts`) and `supabase/config.toml`, but `supabase/migrations/` does not yet exist and there is no `src/types.ts`. F-01 introduces both. F-02 (LLM provider) and F-03 (SRS adapter) are still blocked on open questions — F-01 deliberately commits to neither.

## Desired End State

`npx supabase db reset --local` applies one new migration that lands five tables, three enums, a `set_updated_at()` trigger function, an `is_my_child(uuid)` RLS helper, and per-operation policies — and `src/db/database.types.ts` + `src/types.ts` give downstream slices stable typed imports. No API, no UI, no LLM, no SRS code touched.

## Key Decisions Made

| Decision                          | Choice                                                                                              | Why (1 sentence)                                                                                          | Source |
| --------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------ |
| Child entity                      | Explicit `children` table with unique index on `parent_user_id` (one child per parent in MVP)        | Future multi-child is one `drop index` away without breaking downstream slices.                           | Plan   |
| Reading level model               | Postgres enum `reading_level` with `letters / syllables / words / simple_sentences`                 | PRD names exactly these levels; enum gives type safety and ordering at no schema cost.                    | Plan   |
| Flashcard batch                   | `flashcard_generations` table + `flashcards.status` enum + `flashcards.generation_id` FK             | Lets FR-004 "accept a batch" be a real action while keeping per-card acceptance as the unit of truth.     | Plan   |
| Flashcard content shape           | `front_text` + nullable `hint_text` + `level` enum                                                  | Matches FR-005 "no full editor" — minimal fields, no jsonb soup that downstream UIs would have to schema. | Plan   |
| SRS-state storage                 | Generic columns on `flashcards`: `reps_count`, `last_reviewed_at`, `mastery_score smallint 0..100`   | Readable by any SRS; F-03 adapter normalizes its lib's state into these columns when Q-SRS resolves.      | Plan   |
| Practice model                    | `practice_sessions` + `practice_attempts` (`correct`/`incorrect`)                                   | Sessions back FR-006 "<10 min" UX; attempts back FR-007 mastery indicator without a JSON blob.            | Plan   |
| Business-invariant enforcement    | Application layer only (no DB triggers blocking practice on non-accepted flashcards)                | Keeps schema simple per the `speed` main goal; risk is acknowledged in "Open Risks" below.                | Plan   |
| RLS pattern                       | `SECURITY DEFINER` helper `is_my_child(uuid)` reused by every policy on every domain table          | Single point of audit and revocation; cheaper to reason about than inline subselects per policy.          | Plan   |
| "Don't know / simplest start"     | `children.current_level` is nullable; `NULL` = unsure → app starts at `letters`                     | One column, no extra flag, FR-002 honored without polluting the enum.                                     | Plan   |

## Scope

**In scope:**

- One timestamped migration (`supabase/migrations/20260526143400_reading_domain_schema.sql`) with all enums, tables, indexes, trigger fn, `is_my_child` helper, and per-operation RLS policies.
- Generated `src/db/database.types.ts` (committed) and hand-authored `src/types.ts` re-exporting domain types under stable names.

**Out of scope:**

- API routes under `src/pages/api/` (owned by S-01..S-05).
- UI / Astro pages / React islands.
- LLM provider wiring (F-02, blocked on Q-LLM).
- SRS library integration (F-03, blocked on Q-SRS).
- DB-level enforcement of "only accepted + at level → practice."
- Multi-child support (one `drop index` away later).
- Seed data, service-layer helpers, zod schemas, test runner.

## Architecture / Approach

One SQL file in `supabase/migrations/` lands the whole package in a single `npx supabase db reset --local`. Cascade chain is `auth.users.id → children.parent_user_id → {flashcard_generations, flashcards, practice_sessions} → practice_attempts`. RLS evaluates ownership through the `SECURITY DEFINER` helper `is_my_child(child_id)`; `practice_attempts` carries `child_id`, and composite FKs ensure attempts cannot mix one child's session with another child's flashcard. After the migration verifies locally, `npx supabase gen types typescript --local` regenerates `src/db/database.types.ts`, and `src/types.ts` re-exports domain DTO aliases (`Child`, `Flashcard`, `ReadingLevel`, …) so downstream slices import `@/types` instead of `Database['public']['Tables']['…']`.

## Phases at a Glance

| Phase                                | What it delivers                                                          | Key risk                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1. Database migration & RLS          | The migration file + working schema with RLS enabled, per-op policies, and child-aligned FKs | RLS helper mis-grant, missing `SECURITY DEFINER` config, or missing composite FK silently breaks downstream slice security/integrity model. |
| 2. Typed bindings & domain DTOs      | `src/db/database.types.ts` (generated) + `src/types.ts` (hand-authored)    | Generated file drift if a downstream migration lands without regenerating it.                                |

**Prerequisites:** Docker running for `npx supabase start`; Supabase CLI authenticated (`npx supabase login`) only required when pushing to remote (out of F-01 scope).
**Estimated effort:** ~1 evening session, ~2–4 hours including manual Studio verification.

## Open Risks & Assumptions

- **App-layer invariant only**: PRD's "only accepted material at child's level reaches practice" lives entirely in application code. Downstream slices (S-03, S-04) must respect it; without DB enforcement, a buggy endpoint can violate it. Track in the change folder; revisit with a trigger if a real bug surfaces.
- **Q-LLM and Q-SRS still open**: F-01 commits to neither. If Q-SRS resolves with a library that requires richer per-card state than `reps_count + last_reviewed_at + mastery_score`, F-03 may need a follow-up migration adding columns or a `srs_state jsonb`. Acceptable trade-off — F-01 unblocks five slices today, F-03 adapter handles the variance.
- **Single-child rule via unique index**: lifting MVP's "one child per parent" requires dropping the index but no schema change otherwise. Out-of-scope today; non-breaking later.
- **Practice_attempts child alignment**: F-01 denormalizes `child_id` into attempts so composite FKs can enforce same-child session/flashcard links. This is intentional integrity protection, not a scale optimization.

## Success Criteria (Summary)

- A new parent account can be created, a child row inserted under it, and RLS provably blocks cross-parent reads/writes on every domain table.
- Downstream slices can `import type { Child, Flashcard, ReadingLevel } from "@/types"` and have `Database` plumbing stay invisible.
- `npm run lint` and `npm run build` pass after both phases without changes outside `supabase/migrations/`, `src/db/`, and `src/types.ts`.
