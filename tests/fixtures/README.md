# Hosted test project fixtures

Use a **dedicated Supabase test project** — never production credentials or `tests/fixtures/seed.sql` against prod.

## 0. Apply database migrations (required)

Auth-only projects do **not** have `public.children`. If tests fail with `PGRST205` / `Could not find the table 'public.children'`, run the SQL migrations on the **test** project first.

In **SQL Editor**, run in order (paste each file’s full contents):

1. `supabase/migrations/20260526143400_reading_domain_schema.sql`
2. `supabase/migrations/20260602120000_flashcard_srs_state.sql`

Or link the project and run `npx supabase db push` from your own terminal (not via the agent on Windows).

## 1. Create auth users

In the test project **Authentication → Users**, create two users (disable email confirmation or use confirmed test inboxes):

| Parent | Email (in `seed.sql`) | Password |
|--------|-------------------------|----------|
| A | `test@test.pl` | Same as `TEST_PARENT_A_PASSWORD` in `.env.test` |
| B | `test2@test.pl` | Same as `TEST_PARENT_B_PASSWORD` in `.env.test` |

If you use different emails, update `.env.test` **and** the `where email = ...` lines in `seed.sql` before applying.

## 2. Apply domain seed

1. Open **SQL Editor** in the test project.
2. Paste and run `tests/fixtures/seed.sql` once (or after a wipe).
3. The script deletes existing `children` rows for those parents (cascade clears domain data) and re-inserts deterministic rows.

## 3. Configure `.env.test`

Copy `.env.test.example` → `.env.test` and set:

- `SUPABASE_URL`, `SUPABASE_KEY` (anon / publishable key only — RLS must apply)
- Parent A/B credentials
- Fixed UUIDs from `seed.sql` (defaults match the example file):

```
TEST_PARENT_A_GENERATION_ID=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1
TEST_PARENT_B_CHILD_ID=11111111-1111-4111-8111-111111111101
TEST_PARENT_B_GENERATION_ID=22222222-2222-4222-8222-222222222201
TEST_PARENT_B_SESSION_ID=33333333-3333-4333-8333-333333333301
```

These are v4-shaped on purpose — all-zero UUIDs fail `z.uuid()` in API validation.

## 4. Verify

- Table Editor: Parent A has one `children` row, one draft `flashcard_generations` row (`bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1`), and two draft `flashcards` rows alongside it.
- Table Editor: Parent B has one `children` row, one draft generation + flashcard, and one open `practice_sessions` row.
- Local: `npm test` — RLS smoke, cross-parent IDOR, generate error matrix, and state-machine suites pass.

## Wipe / reseed

Re-run `seed.sql` in the SQL editor. It is safe to re-apply on the test project; it does not create auth users.

## Agent constraint

Do not run `supabase start` or Docker from the agent on Windows (`AGENTS.md`). Operators apply seed manually.
