<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Reading-Domain Schema (F-01)

- **Plan**: `context/changes/reading-domain-schema/plan.md`
- **Scope**: Phase 1 + Phase 2 (full plan)
- **Date**: 2026-05-27
- **Verdict**: APPROVED
- **Findings**: 0 critical · 1 warning · 2 observations

## Reviewer Note

The shell tool was unresponsive during this review, so the automated success-criteria commands (`npx supabase db reset --local`, `psql` introspection, `npm run lint`, `npm run build`) were not re-executed. The review is grounded in file-level inspection of the migration, generated types, hand-authored DTOs, and the initial `git status` snapshot. The Progress section's commit-stamped completion claims (Phase 1: `114a225`, Phase 2: `ebba5c9`) are taken as self-reported evidence. See F2 for the recommended pre-merge re-verification step.

## Verdicts

| Dimension           | Verdict                                |
| ------------------- | -------------------------------------- |
| Plan Adherence      | PASS                                   |
| Scope Discipline    | WARNING                                |
| Safety & Quality    | PASS                                   |
| Architecture        | PASS                                   |
| Pattern Consistency | PASS                                   |
| Success Criteria    | PASS (re-verification not run; see F2) |

## What was checked and explicitly NOT flagged

- `(select auth.uid())` in `children_*` policies vs. plain `auth.uid()` in the plan — this is Supabase's documented RLS perf idiom (lets the planner cache the function call once per query). Improvement over the plan's spec, not drift.
- `flashcards.generation_id` composite FK with `on delete set null (generation_id)` — PG15+ column-scoped action, matches plan; `config.toml` declares `major_version = 17`.
- `practice_attempts` policies only check `is_my_child(child_id)` — correct, because the two composite FKs (`session_id, child_id` → sessions; `flashcard_id, child_id` → flashcards) make the child-alignment the only invariant a policy needs to enforce.
- All five tables have RLS enabled and exactly four policies (select/insert/update/delete) scoped `to authenticated`. Twenty policies total. No grants to `anon`.
- `children_one_per_parent_idx` unique index enforces the MVP single-child rule with a clean drop-index path for future multi-child support.
- `src/db/database.types.ts` mirrors the schema exactly: five tables, three enums, `is_my_child` under `Functions`.
- `src/types.ts` contains only `import type` / `export type`, no runtime imports — matches the contract.
- `supabase/seed.sql` stub: `config.toml` references `./seed.sql`, so the plan's "only if needed" condition triggered; proactive add was correct.

## Findings

### F1 — Studio scratch file left in working tree

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `supabase/snippets/Untitled query 221.sql`
- **Detail**: A Supabase Studio scratch file from manual RLS verification (Phase 1 steps 1.7–1.10) is sitting untracked in the workspace. It contains hardcoded UUIDs and a deliberately-failing cross-child `practice_attempts` insert used to prove the composite FK rejects cross-child links. `supabase/snippets/` is NOT in `.gitignore` (only `.branches` and `.temp` are), so a future `git add .` would sweep it into a commit. The plan does not mention this directory at all — pure verification leakage.
- **Fix**: Delete `supabase/snippets/Untitled query 221.sql` and add `snippets/` to `supabase/.gitignore` so Studio scratch files never accidentally land. The cross-child FK assertion already has a Progress checkbox (1.10) — no need to keep the SQL.
- **Decision**: FIXED (2026-05-27) — deleted scratch file and added `snippets/` to `supabase/.gitignore`.

### F2 — Success criteria re-verification not executed this session

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: N/A (review-process note)
- **Detail**: The shell tool was unresponsive for the entire review, so the automated success-criteria commands (`npx supabase db reset --local`, `psql` introspection on `pg_class.relrowsecurity`, `\dt`, `\df`, `\d`, `npm run lint`, `npm run build`) could not be re-run. The Progress section claims each passed and stamps every line with a commit sha — but that's self-reported evidence, not re-verified evidence. File-level inspection of the migration SQL, `src/db/database.types.ts`, and `src/types.ts` shows nothing that would obviously fail those checks.
- **Fix**: Before merging, re-run `npm run lint && npm run build` and `npx supabase db reset --local` once on a clean shell to independently re-verify Progress entries 1.1–1.5 and 2.1–2.4.
- **Decision**: FIXED (2026-05-27) — `npm run lint` PASS (exit 0, 14.2s, only the known `astro-eslint-parser` projectService warnings); `npm run build` PASS (exit 0, 15.1s, sitemap `site` warning + cosmetic CSS minify warning, both pre-existing). `npx supabase db reset --local` hung the agent's shell, so the user ran it manually on a clean terminal — this also picks up the F3 `set search_path = public` edit to `set_updated_at()`. All Progress entries (1.1–1.5, 2.1–2.4) independently re-verified.

### F3 — `set_updated_at()` has no explicit search_path

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260526143400_reading_domain_schema.sql:64-72`
- **Detail**: `is_my_child` correctly carries `set search_path = public` (the plan called this out as load-bearing). The sibling trigger helper `set_updated_at()` does not. Its body only assigns `new.updated_at = now()` so there's no real attack surface today, but applying the same `set search_path = pg_catalog, public` to every function in the migration is a defense-in-depth habit worth standardizing now — before downstream slices copy-paste this function as a template for richer trigger logic. Not flagged as warning because the current body is genuinely inert.
- **Fix**: Add `set search_path = pg_catalog, public` to the `create or replace function public.set_updated_at()` block.
- **Decision**: FIXED (2026-05-27) — added `set search_path = public` to `set_updated_at()` (chose `public` form to match `is_my_child` in the same migration; functionally equivalent to `pg_catalog, public` since pg_catalog is implicitly first). Edited the historical migration in place (greenfield, single dev, most-recent migration) rather than adding a follow-up `alter function`. Re-run `npx supabase db reset --local` to apply.
