# Reading-Domain Schema (F-01) Implementation Plan

## Overview

Land the first Supabase migration for RafcioCzyta: tables that hold a child profile, batches of AI-generated flashcards with an acceptance status, per-flashcard SRS-agnostic mastery state, and practice sessions with per-card outcomes. Add a `SECURITY DEFINER` helper `is_my_child(child_id)` used by RLS policies on every domain table. Then generate typed bindings and author hand-written DTOs in `src/types.ts`. This is a pure foundation slice: no API routes, no UI, no LLM wiring. It unlocks S-01 through S-05.

## Current State Analysis

- The repo is on the 10x Astro Starter (Astro 6 SSR on Cloudflare Workers + React 19 + Tailwind 4 + Supabase cookie auth). See `src/middleware.ts:1`, `src/lib/supabase.ts:1`.
- Supabase is wired but **the database has no domain tables**. `supabase/config.toml:5` declares the local project (`10x-astro-starter`, Postgres 17), but `supabase/migrations/` does not exist yet — F-01 creates the first migration.
- Auth flow uses `@supabase/ssr` with cookie sessions; `App.Locals.user` is the only typed entity in `src/env.d.ts:1`.
- There is no `src/types.ts` and no `src/db/` folder — both are introduced by this slice (AGENTS.md "Project Structure" prescribes `src/types.ts` for shared types).
- Stack and platform are settled (`context/foundation/tech-stack.md`, `context/foundation/infrastructure.md`). Both Q-LLM (F-02) and Q-SRS (F-03) remain **open**: F-01 deliberately avoids picking either.
- PRD Business Logic states _"only material at the child's level AND accepted by parent reaches practice."_ This invariant is enforced **at the application layer** in F-01 (per Round 3 decision) — schema permits it but does not enforce it via triggers; downstream slices (S-03, S-04) must respect it.

## Desired End State

After this plan lands and `npx supabase db reset --local` runs cleanly:

- The `public` schema contains the five domain tables (`children`, `flashcard_generations`, `flashcards`, `practice_sessions`, `practice_attempts`), three enums (`reading_level`, `flashcard_status`, `practice_attempt_outcome`), one `set_updated_at()` trigger function, one `is_my_child(uuid)` helper, child-alignment constraints that prevent cross-child `generation` / `session` / `flashcard` links, and per-operation RLS policies on every domain table targeting the `authenticated` role.
- Every domain table has RLS **enabled** and policies for `select`/`insert`/`update`/`delete` written against `is_my_child(child_id)` (children-table policies use `parent_user_id = auth.uid()` directly).
- `src/db/database.types.ts` is regenerated from the local schema and committed.
- `src/types.ts` exports hand-authored DTOs that downstream slices import: `ReadingLevel`, `FlashcardStatus`, `PracticeAttemptOutcome`, plus `Child`, `Flashcard`, `FlashcardGeneration`, `PracticeSession`, `PracticeAttempt` row aliases, and `*Insert` / `*Update` variants.
- `npm run lint` and `npm run build` both pass; no other code changes occur.

### Key Discoveries:

- AGENTS.md hard rule: new tables require migrations in `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql`, **with RLS and per-operation policies**. F-01 follows this exactly.
- Path alias `@/*` → `./src/*` is already wired (`tsconfig.json`), so `import type { Child } from "@/types"` will work without further config.
- `src/lib/supabase.ts:5` returns `null` when env vars are missing — typed bindings must remain importable even when no client can be constructed; we only import _types_, not values, from the generated file.
- The Supabase CLI is already a devDependency (`package.json:52`, `"supabase": "^2.23.4"`), so `npx supabase gen types typescript --local` works without an install step.
- Cascade chain from `auth.users.id` → `children` → all dependent rows ensures Supabase account deletion cleans up everything without orphaned data.

## What We're NOT Doing

- **No API routes** under `src/pages/api/` — S-01 owns the child-level endpoint, S-02 owns generation, S-03 owns acceptance, S-04 owns sessions, S-05 owns the mastery indicator.
- **No UI** — no Astro pages, no React islands, no shadcn components.
- **No LLM wiring** — `flashcard_generations.model` and `prompt_version` are nullable metadata columns; F-02 will populate them.
- **No SRS library integration** — `flashcards.reps_count` / `last_reviewed_at` / `mastery_score` are SRS-agnostic columns; F-03's adapter will read/write them once Q-SRS is resolved.
- **No DB-level enforcement of "accepted + level"** — explicitly chosen in Round 3; app layer owns it.
- **No seed data** — no fixture rows are introduced. Because the current Supabase config has `[db.seed] enabled = true` with `sql_paths = ["./seed.sql"]`, F-01 may add an empty `supabase/seed.sql` stub purely so `npx supabase db reset --local` does not fail on a missing file. Downstream slices add real fixtures if needed.
- **No multi-child support** — schema permits one row per parent via a unique index; lifting this is a future migration, not part of F-01.
- **No service-layer helpers** in `src/lib/services/` — those land per-slice as endpoints need them.
- **No zod schemas** — no API surface here means no request bodies to validate yet.

## Implementation Approach

One timestamped migration file holds everything (enums + tables + indexes + `set_updated_at()` + `is_my_child` + RLS policies) so a single `npx supabase db reset --local` exercises the whole package and any failure surfaces in one place. Run order inside the file is: extensions → enums → helper function `set_updated_at()` → tables (in dependency order) → indexes → `updated_at` triggers → `is_my_child()` → `alter table … enable row level security` → policies. After verifying the migration locally, run `npx supabase gen types typescript --local` to produce `src/db/database.types.ts`, and hand-author DTOs in `src/types.ts` that re-export the generated row/insert/update types under stable domain names downstream slices can rely on.

## Critical Implementation Details

- **Cross-child links are impossible at the schema level** — `practice_attempts` carries `child_id` even though it also references `session_id` and `flashcard_id`. Composite foreign keys require `(session_id, child_id)` to match `practice_sessions(id, child_id)` and `(flashcard_id, child_id)` to match `flashcards(id, child_id)`, so an attempt cannot point at another child's flashcard. `flashcards(generation_id, child_id)` likewise references `flashcard_generations(id, child_id)` with `on delete set null (generation_id)` so a card cannot claim another child's generation batch.
- **`is_my_child()` must be `STABLE` and `SECURITY DEFINER`** with `set search_path = public` and `revoke all from public` + `grant execute to authenticated`. Without these, RLS evaluation either leaks the function or fails to find `public.children`. (`SECURITY DEFINER` lets the function read `children` even when the calling user's RLS would normally block direct selection in unusual policy chains; it does **not** create a privilege-escalation surface because the body filters by `auth.uid()`.)
- **`children.current_level` is nullable** — `NULL` represents the "don't know / simplest start" choice from FR-002. Application code must treat `NULL` as a request to begin from `letters`. Don't add a `CHECK` constraint that forbids `NULL`.

## Phase 1: Database migration & RLS

### Overview

Author a single timestamped SQL migration that lands every schema object in this slice, with RLS enabled and per-operation policies for the `authenticated` role on every table. Verified end-to-end by `npx supabase db reset --local`.

### Changes Required:

#### 1. Migration file

**File**: `supabase/migrations/20260526143400_reading_domain_schema.sql`

**Intent**: Create the first migration in the repo. Establish the five domain tables, three enums, two functions (`set_updated_at()`, `is_my_child(uuid)`), and per-operation RLS policies that scope all rows to the parent who owns the referenced `children.id`.

**Contract**:

- **Enums**:
  - `reading_level` with ordered values `'letters' | 'syllables' | 'words' | 'simple_sentences'`.
  - `flashcard_status` with `'draft' | 'accepted' | 'rejected'`.
  - `practice_attempt_outcome` with `'correct' | 'incorrect'` (kept binary in MVP for SRS-agnostic simple mode; F-03 adapter normalizes upstream lib values to these).
- **`children`** — `id uuid pk default gen_random_uuid()`, `parent_user_id uuid not null references auth.users(id) on delete cascade`, `display_name text not null`, `current_level reading_level null`, `created_at`/`updated_at timestamptz not null default now()`. Unique index `children_one_per_parent_idx on children(parent_user_id)` enforces the MVP single-child rule; lifting it later is one `drop index` away.
- **`flashcard_generations`** — `id`, `child_id uuid not null references children(id) on delete cascade`, `requested_level reading_level not null`, `model text null`, `prompt_version text null`, `created_at`. Index on `child_id`; unique constraint or unique index on `(id, child_id)` to support child-aligned composite FKs.
- **`flashcards`** — `id`, `child_id uuid not null references children(id) on delete cascade`, `generation_id uuid null`, composite FK `(generation_id, child_id) references flashcard_generations(id, child_id) on delete set null (generation_id)` (rejecting a whole batch should not orphan accepted cards if some pattern reuses them, while preventing cross-child generation links), `level reading_level not null`, `front_text text not null`, `hint_text text null`, `status flashcard_status not null default 'draft'`, `reps_count integer not null default 0`, `last_reviewed_at timestamptz null`, `mastery_score smallint not null default 0 check (mastery_score between 0 and 100)`, `created_at`/`updated_at`. Indexes: `(child_id, status)`, `(child_id, level)`, `(generation_id)`, plus unique constraint or unique index on `(id, child_id)` to support child-aligned composite FKs.
- **`practice_sessions`** — `id`, `child_id uuid not null references children(id) on delete cascade`, `started_at timestamptz not null default now()`, `ended_at timestamptz null`. Index `(child_id, started_at desc)`; unique constraint or unique index on `(id, child_id)` to support child-aligned composite FKs.
- **`practice_attempts`** — `id`, `child_id uuid not null references children(id) on delete cascade`, `session_id uuid not null`, `flashcard_id uuid not null`, composite FK `(session_id, child_id) references practice_sessions(id, child_id) on delete cascade`, composite FK `(flashcard_id, child_id) references flashcards(id, child_id) on delete cascade`, `outcome practice_attempt_outcome not null`, `answered_at timestamptz not null default now()`. Indexes on `session_id`, `flashcard_id`, and `(child_id, answered_at desc)`.
- **`set_updated_at()` trigger function** — generic, `language plpgsql`. Triggers `before update for each row` on `children` and `flashcards`.
- **`is_my_child(p_child_id uuid) returns boolean`** — `language sql stable security definer set search_path = public`, body `select exists (select 1 from children where id = p_child_id and parent_user_id = auth.uid())`. Followed by `revoke all on function is_my_child(uuid) from public; grant execute on function is_my_child(uuid) to authenticated;`.
- **RLS**: `alter table … enable row level security` on all five domain tables. For every table, **four policies** (one per operation: `select`, `insert`, `update`, `delete`), each declared `to authenticated`:
  - `children.*` use `parent_user_id = auth.uid()` directly in `using` / `with check`.
  - `flashcard_generations.*`, `flashcards.*`, `practice_sessions.*` use `is_my_child(child_id)` in `using` / `with check`.
  - `practice_attempts.*` use `is_my_child(child_id)` in `using` / `with check`; composite FKs enforce that `session_id` and `flashcard_id` belong to that same child.
- **No grants to `anon`** — the application never queries domain tables anonymously; middleware (`src/middleware.ts`) resolves a user before any downstream endpoint runs.
- Run order inside the file: `create extension if not exists "pgcrypto"` (for `gen_random_uuid`) → enums → `set_updated_at()` → tables → indexes → updated_at triggers → `is_my_child` (with grant/revoke) → `enable row level security` → policies.

#### 2. Migrations folder placeholder

**File**: `supabase/migrations/.gitkeep`

**Intent**: Only create this if Supabase CLI does not produce the migrations folder on its own when the first migration file lands. If the migration file alone is enough to make git track the folder, **skip this**.

**Contract**: Empty file. Used purely as a folder-presence marker for git when no migration files exist.

#### 3. Seed file stub

**File**: `supabase/seed.sql`

**Intent**: Only create this if `npx supabase db reset --local` fails because `[db.seed]` in `supabase/config.toml` points at `./seed.sql`. This is a CLI compatibility stub, not product seed data.

**Contract**: Empty SQL file or comment-only SQL file. Do not insert fixtures or demo rows in F-01.

### Success Criteria:

#### Automated Verification:

- Local Supabase resets cleanly with the new migration applied: `npx supabase db reset --local` exits 0 (requires `npx supabase start` running first).
- The migration file exists at the expected path and is non-empty: `test -s supabase/migrations/20260526143400_reading_domain_schema.sql`.
- `psql` against the local DB shows all five tables, three enums, both functions, and child-alignment FKs: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\dt public.*"` lists the five tables; `\df public.is_my_child` and `\df public.set_updated_at` both return a row; `\d public.practice_attempts` and `\d public.flashcards` show the composite FKs described above.
- RLS is on for every domain table: `select relname, relrowsecurity from pg_class where relname in ('children','flashcard_generations','flashcards','practice_sessions','practice_attempts')` returns `t` for every row.
- `npm run lint` passes (the new file is `.sql`, so lint just confirms nothing else regressed).

#### Manual Verification:

- Open Supabase Studio at `http://127.0.0.1:54323` and confirm the five tables appear under the `public` schema with the expected columns, types, and FKs.
- In Studio's SQL editor, executing `select is_my_child(gen_random_uuid())` as the `authenticated` role returns `false` (no auth context).
- Insert a row into `children` via Studio impersonating user A (set `parent_user_id` to A's `auth.users.id`), then attempt to `select * from children` impersonating user B — RLS returns 0 rows.
- Cascade check: delete the test user via Studio (Authentication panel) and verify the `children` row and any test flashcards/sessions are gone.
- Cross-child constraint check: with test data for users A and B, attempting to insert a `practice_attempts` row with user A's `session_id` and user B's `flashcard_id` fails with a foreign-key violation.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that Studio inspection looks right before proceeding to Phase 2. The Progress section enumerates the corresponding `- [ ]` items.

---

## Phase 2: Typed bindings & domain DTOs

### Overview

Generate `src/db/database.types.ts` from the local Supabase schema, then hand-author `src/types.ts` so downstream slices import stable domain names (`Child`, `Flashcard`, etc.) instead of the long `Database['public']['Tables']['…']['Row']` form. No runtime code changes; types only.

### Changes Required:

#### 1. Generated Supabase types

**File**: `src/db/database.types.ts`

**Intent**: Canonical, regenerable mirror of the Postgres schema for type-safe Supabase client calls in every downstream slice. Created by running the Supabase CLI; committed to git so CI does not need the local DB to type-check.

**Contract**: Output of `npx supabase gen types typescript --local > src/db/database.types.ts`. Must export a `Database` type that includes `public.Tables.{children,flashcard_generations,flashcards,practice_sessions,practice_attempts}` (each with `Row`, `Insert`, `Update`) and the three enums under `public.Enums`. File is **regenerated**, not hand-edited; if a future migration changes the schema, re-run the command and commit the diff.

#### 2. Hand-authored domain DTOs

**File**: `src/types.ts`

**Intent**: Single import surface for downstream slices. Re-export the generated row/insert/update types under domain names, plus enum string literal aliases so non-DB code (validators, UI props) does not need to depend on the generated file directly.

**Contract**:

- Re-export `Database` from `@/db/database.types`.
- Type aliases (exported):
  - `ReadingLevel = Database['public']['Enums']['reading_level']`
  - `FlashcardStatus = Database['public']['Enums']['flashcard_status']`
  - `PracticeAttemptOutcome = Database['public']['Enums']['practice_attempt_outcome']`
  - `Child = Database['public']['Tables']['children']['Row']`, `ChildInsert`, `ChildUpdate` paralleling Insert/Update for the same table.
  - Same pattern for `FlashcardGeneration*`, `Flashcard*`, `PracticeSession*`, `PracticeAttempt*`.
- The file contains only `import type` and `export type` statements; no values, no runtime imports.

#### 3. Path alias smoke import

**File**: (none added) — verified during Phase 2 by `npm run build` exercising the alias `@/types`.

**Intent**: Ensure the new files compile under Astro 6's type-checker without introducing a stray import that would break downstream lints. No file changes here — this is a build-time gate.

**Contract**: `npm run build` succeeds with no `tsc` errors against `src/types.ts` or `src/db/database.types.ts`.

### Success Criteria:

#### Automated Verification:

- `src/db/database.types.ts` exists and is non-empty: `test -s src/db/database.types.ts`.
- `src/types.ts` exists and exports the documented names: `npx tsc --noEmit -p tsconfig.json` passes.
- Lint and build both pass on the full repo: `npm run lint` and `npm run build` exit 0.
- A throwaway sanity script (`node --input-type=module -e "import('./src/types.ts').then(m => console.log(typeof m))"`) is **not** required — these are type-only modules; tsc is the verifier.

#### Manual Verification:

- Open `src/db/database.types.ts` and confirm the five tables, three enums, and the `Database` type root appear as expected.
- Open `src/types.ts` and confirm a downstream slice can `import type { Child, ReadingLevel } from "@/types"` without seeing `Database` plumbing.
- Run `npx supabase gen types typescript --local` a second time and diff the result against the committed file — no drift expected immediately after Phase 1.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the generated file looks correct before marking F-01 complete.

---

## Testing Strategy

### Unit Tests:

No automated unit tests in this slice — the codebase has no test runner configured (AGENTS.md "Build, Test, and Development": _"No automated test runner is configured; verify with lint, build, and manual checks."_). Phase 1's SQL-shaped invariants are exercised by `npx supabase db reset --local`; Phase 2's TypeScript-shaped invariants are exercised by `npm run build`. Adding a test runner is out of scope.

### Integration Tests:

Not applicable — F-01 ships no callable surface (no API routes, no UI). The first integration tests will land with S-01.

### Manual Testing Steps:

1. Run `npx supabase start` (Docker required), then `npx supabase db reset --local`. Confirm the command completes without error and applies the F-01 migration.
2. Open Studio at `http://127.0.0.1:54323`. In the Database → Tables view, confirm `children`, `flashcard_generations`, `flashcards`, `practice_sessions`, `practice_attempts` exist with the expected columns and FK arrows.
3. In Studio's Authentication panel, create two test users A and B. Note their UUIDs.
4. In Studio's SQL editor (as `postgres`), insert one `children` row for user A. Then run the editor as `authenticated` impersonating user A (set the `request.jwt.claim.sub` GUC) and confirm `select * from children` returns the row. Switch to user B and confirm the same query returns no rows.
5. Repeat the impersonation check for `flashcards`: insert a `flashcards` row tied to user A's child, then verify user B cannot select, update, or delete it. Verify user A can.
6. Delete user A from the Authentication panel. Confirm the `children` row (and any dependent rows) are gone via `select count(*) from children where parent_user_id = '<user A uuid>'`.
7. After Phase 2, run `npm run build` from a clean checkout and confirm no type errors involving `src/types.ts` or `src/db/database.types.ts`.

## Performance Considerations

- At MVP scale (per `context/foundation/prd.md` target_scale: `small` users, `low` qps, `small` data_volume), the composite FK indexes and direct `practice_attempts.child_id` RLS check are comfortably within Supabase's typical performance envelope.
- `practice_attempts.child_id` is intentionally denormalized in F-01 for integrity, not premature scale: it lets Postgres enforce that an attempt's session and flashcard belong to the same child.
- All RLS-driving columns (`parent_user_id`, `child_id`, `session_id`) are FK-indexed by virtue of the explicit indexes declared in the migration.

## Migration Notes

- F-01 is the first migration in the repo; there is no prior data to migrate. Local re-runs use `npx supabase db reset --local`.
- The remote production database (Supabase project on Cloudflare's side) will receive the migration via `npx supabase db push` once linked. Out of scope for this slice — handled when the first end-user-facing slice (S-01) ships.
- Rollback strategy: drop the migration locally by reverting the commit and re-running `npx supabase db reset --local`. Remote rollback is manual (Supabase does not auto-revert migrations) — note this in the PR description when the work lands.

## References

- Roadmap entry: `context/foundation/roadmap.md` (§ "F-01: Schemat domeny nauki czytania" + Backlog Handoff row).
- Change identity: `context/changes/reading-domain-schema/change.md`.
- PRD: `context/foundation/prd.md` — FR-001..FR-007, Business Logic, Access Control, Non-Goals.
- Tech stack: `context/foundation/tech-stack.md` — Supabase + Astro 6 SSR stack rationale.
- Infrastructure: `context/foundation/infrastructure.md` — Cloudflare Workers deploy target.
- Repo conventions: `AGENTS.md`, `CLAUDE.md` (migration naming, `src/types.ts` placement, RLS rule).
- Existing auth wiring: `src/middleware.ts:1`, `src/lib/supabase.ts:1`, `src/pages/api/auth/signup.ts:1`.
- GitHub issue: [#5](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/5).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `.cursor/skills/10x-plan/references/progress-format.md`.

### Phase 1: Database migration & RLS

#### Automated

- [x] 1.1 Local Supabase resets cleanly with new migration applied (`npx supabase db reset --local`) — 114a225
- [x] 1.2 Migration file exists and is non-empty at `supabase/migrations/20260526143400_reading_domain_schema.sql` — 114a225
- [x] 1.3 `psql` shows all five tables, both functions, and child-alignment FKs (`\dt public.*`, `\df public.is_my_child`, `\df public.set_updated_at`, `\d public.practice_attempts`, `\d public.flashcards`) — 114a225
- [x] 1.4 RLS is enabled on every domain table (`pg_class.relrowsecurity = t`) — 114a225
- [x] 1.5 `npm run lint` passes — 114a225

#### Manual

- [x] 1.6 Supabase Studio shows five tables with expected columns and FKs — 114a225
- [x] 1.7 `is_my_child(<random uuid>)` returns `false` with no auth context — 114a225
- [x] 1.8 Cross-user RLS check: user B cannot read user A's `children` or `flashcards` — 114a225
- [x] 1.9 Cascade check: deleting an `auth.users` row removes all owned domain rows — 114a225
- [x] 1.10 Cross-child FK check: inserting an attempt with one child's session and another child's flashcard fails — 114a225

### Phase 2: Typed bindings & domain DTOs

#### Automated

- [x] 2.1 `src/db/database.types.ts` exists and is non-empty — ebba5c9
- [x] 2.2 `src/types.ts` exists and compiles under `npx tsc --noEmit` — ebba5c9
- [x] 2.3 `npm run lint` passes — ebba5c9
- [x] 2.4 `npm run build` passes — ebba5c9

#### Manual

- [x] 2.5 Generated file contains all five tables and three enums under `Database` — ebba5c9
- [x] 2.6 Sample import `import type { Child, ReadingLevel } from "@/types"` resolves in an editor without surfacing `Database` plumbing — ebba5c9
- [x] 2.7 Re-running `npx supabase gen types typescript --local` produces no diff against the committed file — ebba5c9
