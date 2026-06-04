# Deck Generation & Acceptance Gates Implementation Plan

## Overview

Test-plan Phase 2 (`context/foundation/test-plan.md` §3 row 2): cover **risks #3–#6** — AI level guard, generate timeout/error matrix, accept/reject state machine, and the practice-queue gate that keeps draft/rejected cards out of SRS. Stub the LLM at the `ai` SDK boundary, never at internal service modules. Reuse the Phase 1 hosted-Supabase + handler-extraction patterns from `testing-bootstrap-auth-boundary`. No CI test job (test-plan Phase 4) and no Playwright in this change.

## Current State Analysis

- **Level guard exists** in `src/lib/services/flashcard-generation.ts:73-75` — `LEVEL_ORDER.indexOf(card.level) <= LEVEL_ORDER.indexOf(input.requestedLevel)` filters above-level cards before insert into `flashcards`. The filter is inlined inside `generateFlashcards`, not exposed as a helper, so it cannot be unit-tested in isolation today.
- **Generate error contract is in the handler** (`src/lib/api-handlers/flashcards-generate-post.ts:81-129`): `FLASHCARD_ERROR_MISSING_API_KEY` → 500 + `"Generator fiszek nie jest skonfigurowany. Skontaktuj się z administratorem."`, `FLASHCARD_ERROR_TIMEOUT` → 504 + `"Generowanie fiszek przekroczyło 10 sekund. Spróbuj ponownie."`, `FLASHCARD_ERROR_GENERATION_FAILED` → 503 + `"Nie udało się wygenerować fiszek. Spróbuj ponownie."`, unknown → 500 + `"Wystąpił błąd serwera. Spróbuj ponownie."`. Production timeout is `AbortSignal.timeout(9_500)` and catches `name === "AbortError" || "TimeoutError"`.
- **Accept/reject state machine** lives in `src/lib/services/flashcards.ts`. `acceptBatch` (`:84-134`) selects `status='draft'` cards for the `generationId`+`childId`, throws `FLASHCARD_ERROR_BATCH_EMPTY` on empty selection, and on update calls `initSrsState()` to set `srs_state`, `next_review_at`, `reps_count`, `last_reviewed_at`, `mastery_score`. `rejectBatch` (`:182-203`) updates `status='draft' → 'rejected'`, throws the same `FLASHCARD_ERROR_BATCH_EMPTY` when nothing matched.
- **Handler extraction gap**: `flashcards-generate-post.ts` and `flashcards-accept-post.ts` are extracted under `src/lib/api-handlers/`; **`src/pages/api/flashcards/reject.ts` still inlines its `POST` handler** (Phase 1 didn't need it). Risk #5 reject coverage forces extraction.
- **Practice queue filters** in `src/lib/services/practice-session.ts:33-67`: `countDueCards` / `startPracticeSession` query `flashcards` with `eq("status","accepted").eq("level",input.level).not("next_review_at","is",null).lte("next_review_at",nowIso)`. The `status='accepted'` clause is the load-bearing guard for risk #4; today rejected/draft cards also have null `next_review_at`, so naively seeded data does not actually exercise the status clause.
- **List endpoints (risk #5)** are services, not HTTP routes: `listDraftBatches` and `listAcceptedFlashcards` (`flashcards.ts:22-82`) are called only from `src/pages/dashboard.astro` (SSR). Phase 2 asserts them via direct service calls with a Parent A Supabase client (RLS still applies).
- **Phase 1 toolchain in place**: `tests/setup.ts` loads `.env.test`; `vitest.config.ts` aliases `astro:env/server` → `tests/stubs/astro-env-server.ts` and `astro:middleware` → `tests/stubs/astro-middleware.ts`; `tests/helpers/api-context.ts`, `tests/helpers/auth-session.ts`, `tests/helpers/env.ts` (`requireTestEnv` with `REQUIRED_KEYS` + UUID validation) are shipped. Seed has Parent A child (`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1`) but **no draft batch for Parent A**.
- **L-001 ESLint constraint** (`context/foundation/lessons.md`) — any service or handler we touch must keep the file-wide `/* eslint-disable @typescript-eslint/no-unsafe-* */` block.

## Desired End State

- **Risk #3 (level guard)**: pure unit test on the level-order filter (`letters < syllables < words < simple_sentences`) — over-level cards dropped, equal-or-below cards kept. Plus one integration assertion that a stubbed batch containing above-level cards persists only in-bounds rows.
- **Risk #6 (generate error matrix)**: four integration cases against `postGenerateFlashcards` with stubbed `generateText` — happy 200 + DTO shape + cards rows persisted, `TimeoutError` → 504 + Polish text, generic Error → 503 + Polish text, missing `OPENAI_API_KEY` → 500 + Polish text.
- **Risk #4 (queue gate)**: adversarial test — a Parent A `status='draft'` card with `next_review_at` set to a past timestamp is **not** returned by `startPracticeSession`. This exercises the `status='accepted'` clause directly.
- **Risk #5 (state machine + listing)**: `acceptBatch` happy path moves draft→accepted and sets `srs_state` + `next_review_at`; second accept on the same batch returns 404 `"Ta partia nie oczekuje już na akceptację."`; `rejectBatch` happy path moves draft→rejected; `listDraftBatches` excludes generations whose cards are all accepted or rejected.
- **LLM stub harness**: `tests/helpers/openai-mock.ts` exposes `mockGenerateTextOnce({ cards | error })` (and variants for timeout / failure). All generate tests opt in via the helper; no test mocks `flashcard-generation` itself.
- **Reject handler extracted**: `src/lib/api-handlers/flashcards-reject-post.ts` mirrors accept; `src/pages/api/flashcards/reject.ts` becomes a thin re-export. No behavior change.
- **Seed extended**: `tests/fixtures/seed.sql` adds a Parent A draft generation + cards with stable UUIDs documented in `.env.test.example`, `tests/fixtures/README.md`, and added to `REQUIRED_KEYS` in `tests/helpers/env.ts`.
- **Cookbook §6.5 filled**: `context/foundation/test-plan.md` §6.5 contains a stubbed-`generateText` snippet and a state-machine integration snippet, both copy-pastable for risk #6+/state-mutation work in Phase 3+. §6.6 gets a Phase 2 bullet referencing this change.
- `npm test` green on a populated `.env.test`; `npm run lint` and `npm run build` green; change marked `ready_for_implement`.

### Key Discoveries

- Level filter is inlined and untestable in isolation — `src/lib/services/flashcard-generation.ts:73-75`. Extract to `filterCardsByLevel(cards, level)` (pure, no I/O) and re-import inside `generateFlashcards`; production behavior unchanged.
- `OPENAI_API_KEY` is captured at module-load time both in production (`flashcard-generation.ts:12`) and the stub (`tests/stubs/astro-env-server.ts:3`). To exercise the missing-key branch from a single test file, use `vi.resetModules()` + `vi.doMock("astro:env/server", () => ({ ..., OPENAI_API_KEY: "" }))` + dynamic `await import(...)`. Standard Vitest pattern.
- `vi.mock("ai", ...)` and/or `vi.mock("@ai-sdk/openai", ...)` is the correct boundary — `ai`'s `generateText` is what `flashcard-generation.ts` actually awaits, and `createOpenAI` is what it calls for provider construction. The mock returns `{ output: { cards: [...] } }` to match the `Output.object({ schema: flashcardBatchSchema })` shape.
- For the timeout branch, the stubbed `generateText` throws `Object.assign(new Error("aborted"), { name: "TimeoutError" })` — production checks `err.name`, not the message.
- Risk #4 needs adversarial seeding (`status='draft'` + non-null `next_review_at`) because today the `next_review_at`-null guard hides the `status='accepted'` clause. We insert that adversarial row in-test (not in `seed.sql`) so the seed stays consistent with production reality.
- `tests/helpers/env.ts` `REQUIRED_KEYS` is the choke point: every new `.env.test` variable Phase 2 introduces must be added there or `requireTestEnv()` won't validate it.

## What We're NOT Doing

- Real OpenAI calls (test-plan §7 explicit exclusion).
- CI wiring of `npm test` (test-plan Phase 4).
- Playwright / browser e2e (test-plan §6.3 deferred; integration suffices for risks #3–#6).
- Refactoring `flashcard-generation.ts` to accept a DI'd LLM provider — `vi.mock` at the `ai`/`@ai-sdk/openai` boundary keeps the production code stable.
- Extracting `practice/start.ts` or other practice handlers — that's Phase 3 (`Practice + mastery signal`).
- Asserting full Polish copy in every test — only error-message assertions where the parent-facing string is the contract (per test-plan §6.4).
- Snapshotting the dashboard or any UI; risk #5 list assertions are direct `listDraftBatches` / `listAcceptedFlashcards` service calls.
- Adding `@vitest/coverage-v8` or coverage gates.
- Editing `eslint.config.js` `ignores` (L-001) or weakening any lint rule.

## Implementation Approach

1. Stand up the LLM stub harness and extract the level filter as a pure helper so we get a unit test cheaply (Phase 1).
2. Layer integration tests for the generate handler error matrix on top of the stub harness (Phase 2). One case there double-counts as risk #3's "filter actually wired before persistence" assertion.
3. Extract the reject handler, extend the seed with Parent A's draft batch, and write the accept/reject + queue-gate matrix (Phase 3). All five scenarios share one signed-in Parent A session and the same Supabase client.
4. Promote the patterns into `test-plan.md` §6.5 + §6.6 so Phase 3 can copy from the cookbook (Phase 4).

Each phase ends with `npm test && npm run lint && npm run build` green, a commit, and (where applicable) operator confirmation that the test project is reseeded.

## Critical Implementation Details

- **Module-load capture of `OPENAI_API_KEY`** — both production and the Phase 1 stub bind `OPENAI_API_KEY` at module evaluation. The missing-API-key test (Phase 2, case 4) must call `vi.resetModules()` and `vi.doMock("astro:env/server", () => ({ SUPABASE_URL: process.env.SUPABASE_URL ?? "", SUPABASE_KEY: process.env.SUPABASE_KEY ?? "", OPENAI_API_KEY: "" }))`, then dynamically `await import("@/lib/api-handlers/flashcards-generate-post")` to pick up the re-mocked binding. Restore with `vi.restoreAllMocks()` + `vi.resetModules()` in an `afterEach` so subsequent tests get the real key.
- **Timeout error shape** — production catches via `err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")`. Stubs throw an Error whose `name` is one of those two strings. Asserting only the response status/text from the handler is enough — do not assert the underlying error object.
- **vi.mock hoisting** — `vi.mock("ai", () => ({ generateText: vi.fn(), Output: { object: vi.fn(() => ({})) } }))` must run before any import of `flashcard-generation.ts`. Place `vi.mock` calls at the top of each test file (Vitest hoists them above imports). The shared `tests/helpers/openai-mock.ts` exposes `mockGenerateTextOnce(result)` that imports the mocked `generateText` and calls `.mockImplementationOnce(...)` per test — the test file owns the `vi.mock` call; the helper owns the per-test behavior.
- **Adversarial seeding for risk #4** — the "draft card stays out of due queue" test inserts a row via the signed-in Parent A Supabase client (RLS applies), targeting Parent A's child, with `status='draft'` and `next_review_at = '2000-01-01T00:00:00Z'`. Clean up in `afterAll` by deleting the inserted row by id. This adversarial row must NOT live in `seed.sql` because it violates the invariant that draft cards have null `next_review_at`.

## Phase 1: LLM Stub Harness & Level Guard Unit

### Overview

Make LLM stubbing reusable across Phase 2's three test files and unlock a fast unit test on the level filter by extracting it as a pure helper.

### Changes Required:

#### 1. Extract level filter as pure helper

**File**: `src/lib/services/flashcard-generation.ts`

**Intent**: Move the inline `filtered = batchOutput.cards.filter(...)` out of `generateFlashcards` so it is testable in isolation; behavior unchanged.

**Contract**: Add a top-level `export function filterCardsByLevel<T extends { level: StoredReadingLevel }>(cards: T[], requestedLevel: StoredReadingLevel): T[]` that returns cards whose `level` index in `LEVEL_ORDER` is ≤ `requestedLevel`'s index. `generateFlashcards` calls `filterCardsByLevel(batchOutput.cards, input.requestedLevel)`. Keep the file-wide ESLint disable block (L-001).

#### 2. LLM stub helper

**File**: `tests/helpers/openai-mock.ts` (new)

**Intent**: Single source of truth for how Phase 2 tests drive the stubbed `generateText`. Test files own the `vi.mock("ai", ...)` declaration; the helper supplies per-test behavior.

**Contract**: Exports `mockGenerateTextHappy(cards: { front_text: string; hint_text: string | null; level: StoredReadingLevel }[])`, `mockGenerateTextTimeout()`, and `mockGenerateTextFailure(message?: string)`. Each imports the mocked `generateText` from `"ai"` and calls `.mockImplementationOnce(...)`. Happy returns `{ output: { cards } }`; timeout throws `Object.assign(new Error("timeout"), { name: "TimeoutError" })`; failure throws a plain `new Error(message ?? "stub LLM failure")`.

#### 3. Level guard unit test

**File**: `tests/unit/level-guard.test.ts` (new)

**Intent**: Prove the order semantics of `filterCardsByLevel` independent of LLM or DB.

**Contract**: Three cases — (a) all cards equal-or-below `requestedLevel` → returned unchanged; (b) some cards above `requestedLevel` → those dropped, in-bounds kept; (c) `requestedLevel = "letters"` and one card is `"simple_sentences"` → only `"letters"` cards kept. Use the union-typed levels (no Database-derived types — L-001-safe).

### Success Criteria:

#### Automated Verification:

- `npm test` runs the new `tests/unit/level-guard.test.ts` green (no `.env.test` dependencies)
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Spot-check `generateFlashcards` happy path still works in dev (one local generate from `/dashboard`) — verifies the extraction didn't change behavior

**Implementation Note**: After automated verification passes, confirm manual generate before Phase 2.

---

## Phase 2: Generate Handler Error Matrix

### Overview

Five integration cases against `postGenerateFlashcards` with stubbed LLM. One case doubles as the "level filter is actually wired" assertion for risk #3.

### Changes Required:

#### 1. Generate handler integration tests

**File**: `tests/integration/flashcards-generate.test.ts` (new)

**Intent**: Exercise every branch of `postGenerateFlashcards`'s error-handling chain plus the success path, stubbing only the `ai` SDK.

**Contract**: File-top `vi.mock("ai", ...)` and `vi.mock("@ai-sdk/openai", ...)`. Signed-in Parent A session for each case. Cases:

| Case | Stub | Expected response | Side effect |
|------|------|-------------------|-------------|
| Happy 200 | `mockGenerateTextHappy(8 in-level cards)` | 200, `{ ok: true, generationId, requestedLevel, cards: GeneratedFlashcardDTO[] }`, `cards.length === 8` | Row inserted in `flashcard_generations`; 8 rows in `flashcards` with `status='draft'`. Test cleans up by deleting those rows in `afterEach`. |
| Level filter wired | `mockGenerateTextHappy([4 in-level, 4 above-level])` | 200, response `cards.length === 4` | Only 4 rows persisted; no row has `level > requestedLevel` |
| Timeout 504 | `mockGenerateTextTimeout()` | 504, `{ ok: false, error: "Generowanie fiszek przekroczyło 10 sekund. Spróbuj ponownie." }` | No `flashcard_generations` row inserted |
| Generic failure 503 | `mockGenerateTextFailure()` | 503, `{ ok: false, error: "Nie udało się wygenerować fiszek. Spróbuj ponownie." }` | No insert |
| Missing API key 500 | `vi.doMock("astro:env/server", ...)` + `vi.resetModules()` + dynamic import | 500, `{ ok: false, error: "Generator fiszek nie jest skonfigurowany. Skontaktuj się z administratorem." }` | No insert; LLM stub never called |

Use `requireTestEnv()` from Phase 1; sign in via `signInAs("A")`; build context with `createApiContext` + cookies + locals. Cleanup uses Parent A's Supabase client (anon, RLS-bound) to delete by `generation_id`.

### Success Criteria:

#### Automated Verification:

- `npm test` — all five cases in `flashcards-generate.test.ts` pass against the hosted test project with a populated `.env.test`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Manually generate a batch from `/dashboard` with a real `OPENAI_API_KEY` (not the test key) and confirm it succeeds — proves the stub isn't bleeding into production paths

**Implementation Note**: After automated verification passes, confirm a manual generate in dev before Phase 3.

---

## Phase 3: Accept/Reject State Machine & Queue Gate

### Overview

Extract the reject handler, extend the seed with a Parent A draft batch, and write the five-case state-machine + queue-gate matrix.

### Changes Required:

#### 1. Reject handler extraction

**File**: `src/lib/api-handlers/flashcards-reject-post.ts` (new)

**Intent**: Mirror `flashcards-accept-post.ts` so reject is testable via the same handler-call pattern.

**Contract**: `export async function postRejectFlashcards(context: APIContext): Promise<Response>`. Body moved verbatim from `src/pages/api/flashcards/reject.ts`: auth check (401 if no user, JSON), supabase null check, `getMyChild` lookup, body `z.object({ generationId: z.uuid() })`, 400 on parse failure, `rejectBatch` call, 404 `"Ta partia nie oczekuje już na akceptację."` on `FLASHCARD_ERROR_BATCH_EMPTY`, 500 on other errors. Keep the L-001 file-wide ESLint disable block.

#### 2. Reject route re-export

**File**: `src/pages/api/flashcards/reject.ts`

**Intent**: Make the page file a thin wrapper, matching `generate.ts` / `accept.ts`.

**Contract**: `export const prerender = false;` + `export const POST: APIRoute = postRejectFlashcards;` imported from `@/lib/api-handlers/flashcards-reject-post`.

#### 3. Seed extension — Parent A draft batch

**File**: `tests/fixtures/seed.sql`

**Intent**: Add a deterministic Parent A draft generation + cards so state-machine tests have a stable starting batch.

**Contract**: Add a `gen_a_id` and a small set of card UUIDs as `declare` locals; insert one `flashcard_generations` row (Parent A's `child_a_id`, `requested_level = 'letters'`) and two `flashcards` rows (`status='draft'`, `level='letters'`, distinct `front_text`). UUIDs follow v4-shaped pattern matching existing seed conventions (`bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1` for the generation; `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc1` / `…bbc2` for cards). Header comment updated with the new UUIDs.

#### 4. Env contract + docs sync

**Files**: `tests/helpers/env.ts`, `.env.test.example`, `tests/fixtures/README.md`

**Intent**: Surface the new Parent A UUID(s) through the fail-fast contract and onboarding docs.

**Contract**: `REQUIRED_KEYS` gains `TEST_PARENT_A_GENERATION_ID` (the v4-shaped Parent A draft id); `UUID_KEYS` extended in lockstep. `.env.test.example` adds the new key with the seed default. README §3 "Configure `.env.test`" lists the new UUID and §4 "Verify" notes the additional draft row.

#### 5. State-machine + queue-gate integration tests

**File**: `tests/integration/flashcards-state-machine.test.ts` (new)

**Intent**: Seven-case matrix covering risks #4 and #5 with one signed-in Parent A session plus explicit reject auth-boundary checks.

**Contract**: Sign in once in `beforeAll` (`signInAs("A")`). Cases:

1. **Accept happy** — `postAcceptFlashcards(generationId = TEST_PARENT_A_GENERATION_ID)` returns 200, `updatedCount === 2`, `cards.length === 2`. Direct Supabase select on affected rows shows `status='accepted'`, non-null `srs_state`, non-null `next_review_at`, `reps_count = 0`.
2. **Double accept 404** — second call with the same `generationId` returns 404 + `"Ta partia nie oczekuje już na akceptację."`; no row mutated (compare row count of `status='accepted'` before vs after).
3. **Reject happy** — depends on a fresh draft batch inserted in-test (since case 1 consumed the seeded one). Helper inserts a new `flashcard_generations` + 2 `flashcards` (`status='draft'`) as Parent A; `postRejectFlashcards` returns 200, `updatedCount === 2`; direct select shows `status='rejected'`. Cleanup deletes the test-inserted rows in `afterAll`.
4. **Rejected/draft cards excluded from due queue (risk #4 adversarial)** — insert a Parent A `status='draft'` card with `next_review_at = '2000-01-01T00:00:00Z'`, `level='letters'`. Call `startPracticeSession(parentASupabase, { childId: parentAChild.id, level: 'letters' })`. Either it throws `PRACTICE_ERROR_NO_DUE_CARDS` (if no accepted cards are due) or returns cards whose `id` does NOT include the adversarial row. Cleanup deletes the adversarial row.
5. **Draft list excludes accepted/rejected generations (risk #5)** — run this assertion in a dedicated `describe.serial` block with its own `beforeAll` that creates the accepted+rejected fixture state locally (perform accept + reject inside the block), then call `listDraftBatches(parentASupabase, parentAChild.id)`. Result excludes both accepted and rejected generation ids; if a test-inserted draft batch is still alive, only that one is returned. Add block-local cleanup in `afterAll` so this case is order-independent from cases 1–4.
6. **Reject unauthenticated 401** — build context for `postRejectFlashcards` with `locals.user = null`; valid body shape still returns `401` + `{ ok: false, error: "Musisz być zalogowany." }`.
7. **Reject cross-parent 404 (IDOR guard)** — sign in as Parent A, call `postRejectFlashcards` with `generationId = TEST_PARENT_B_GENERATION_ID`; expect `404` + `"Ta partia nie oczekuje już na akceptację."`, proving Parent A cannot mutate Parent B's batch.

Use the same `signInAs("A")` → Supabase client pattern as `tests/integration/authz-cross-parent.test.ts`. Do not mock `acceptBatch` / `rejectBatch`.

### Success Criteria:

#### Automated Verification:

- `npm test` — all seven cases in `flashcards-state-machine.test.ts` pass against the hosted test project (after operator re-applies `seed.sql`)
- `npm run lint` passes (handler extraction + seed env changes do not introduce new lint issues)
- `npm run build` passes

#### Manual Verification:

- Operator re-applied `tests/fixtures/seed.sql`; Table Editor shows Parent A's new draft generation + 2 cards alongside Parent B's existing draft batch
- `.env.test` populated with new `TEST_PARENT_A_GENERATION_ID`; `requireTestEnv()` no longer warns
- Spot-check `/dashboard` accept/reject buttons still work after the reject extraction (browser, logged in as test user)

**Implementation Note**: Operator must re-apply `seed.sql` before Phase 3 tests will pass. Pause for explicit confirmation that the reseed happened and `.env.test` was updated before moving to Phase 4.

---

## Phase 4: Cookbook §6.5 & Test-Plan Sync

### Overview

Promote Phase 2 patterns into the foundation test-plan so Phase 3 (Practice + mastery signal) can copy them, and mark this change ready for implement.

### Changes Required:

#### 1. Cookbook §6.5 — deck generation / acceptance patterns

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the "TBD — see §3 Phase 2" stub in §6.5 with the two canonical patterns introduced by this change.

**Contract**: Two sub-patterns:

- **Stubbing the LLM edge** — show the file-top `vi.mock("ai", ...)` + `vi.mock("@ai-sdk/openai", ...)` declaration and a snippet calling `mockGenerateTextHappy(...)` from `tests/helpers/openai-mock.ts`. Note the timeout-name and missing-API-key (vi.doMock + resetModules + dynamic import) gotchas.
- **State-machine integration** — snippet calling `postAcceptFlashcards` against a seeded Parent A `generationId`, then asserting both response shape and direct DB state (status, srs_state non-null). Reference the adversarial-row trick for queue-gate coverage.

Each sub-pattern follows the §6.2 / §6.4 prose style — under 40 lines including code.

#### 2. Per-phase notes §6.6

**File**: `context/foundation/test-plan.md` §6.6

**Intent**: Link Phase 2 rollout to this change folder and date shipped.

**Contract**: Append a bullet under the existing Phase 1 entry: `**Phase 2 — Deck generation & acceptance gates** (shipped <date>): context/changes/deck-generation-acceptance-gates/. LLM stub harness at the ai/@ai-sdk/openai boundary; level-guard unit + generate-error matrix (happy/timeout/failure/missing-key) + accept-reject state machine with adversarial draft-row exclusion. Seed extended with a Parent A draft batch; reject handler extracted to src/lib/api-handlers/flashcards-reject-post.ts.`

#### 3. Rollout status row

**File**: `context/foundation/test-plan.md` §3

**Intent**: Move Phase 2's Status column from `not started` to `shipped` (or the value matching the project's current convention — match Phase 1's wording exactly) and fill the Change folder column.

**Contract**: Row 2: Status = `shipped` (mirroring Phase 1 row), Change folder = `context/changes/deck-generation-acceptance-gates/`.

#### 4. Change status

**File**: `context/changes/deck-generation-acceptance-gates/change.md`

**Intent**: Mark change `ready_for_implement` once docs land.

**Contract**: Front-matter `status: ready_for_implement`, `updated: <ship date>`. Do not change `created`. Keep `archived_at: null`.

### Success Criteria:

#### Automated Verification:

- `npm test` still passes
- `npm run lint` passes

#### Manual Verification:

- Read §6.5 — a contributor working on Phase 3 can lift the stubbing pattern without re-reading the full Phase 2 plan
- `context/changes/deck-generation-acceptance-gates/change.md` shows `status: ready_for_implement`

---

## Testing Strategy

### Unit Tests

- `filterCardsByLevel` — order semantics across all four `StoredReadingLevel` values (`tests/unit/level-guard.test.ts`)

### Integration Tests

- Generate happy path + DTO contract (stubbed LLM)
- Generate level filter wired (stubbed LLM with mixed in/above-level cards)
- Generate timeout → 504 + Polish text
- Generate failure → 503 + Polish text
- Generate missing API key → 500 + Polish text (vi.doMock + resetModules)
- Accept happy → 200 + status/srs_state mutation
- Double accept → 404 + Polish text + no further mutation
- Reject happy → 200 + status mutation
- Rejected/draft adversarial card excluded from `startPracticeSession`
- `listDraftBatches` excludes accepted/rejected generations

### Manual Testing Steps

1. Operator re-applies `tests/fixtures/seed.sql` against the hosted test project; verifies Parent A draft batch in Table Editor.
2. Operator adds `TEST_PARENT_A_GENERATION_ID` to `.env.test`; `npm test` runs all suites green.
3. Logged into a dev environment with a real `OPENAI_API_KEY`, click "Wygeneruj fiszki" from `/dashboard` — confirms the level filter extraction did not regress production generation.
4. From the dashboard, accept a real batch and reject another — confirms the reject handler extraction did not regress the UI flow.

## Performance Considerations

Phase 2 adds ~10 integration tests against hosted Supabase. Keep them serial within each file (Vitest default per-file isolation) to avoid cross-test row leakage. If the suite starts pushing past ~30s, scope a `describe.serial` block around the state-machine matrix rather than parallelising — Supabase free-tier auth + write rate limits make parallel runs flaky before they make the suite faster.

## Migration Notes

- No production schema change.
- Operators must re-apply `tests/fixtures/seed.sql` once (Phase 3 ships) and add `TEST_PARENT_A_GENERATION_ID` to `.env.test`. README §3 and §4 are updated in the same commit so the steps are discoverable.
- No revert risk in production code — the only production-side changes are (a) extracting `filterCardsByLevel` (pure refactor, behavior preserved) and (b) extracting the reject handler (thin re-export, behavior preserved).

## References

- Test plan: `context/foundation/test-plan.md` (§2 risks #3–#6, §3 row 2, §4 stub rule, §6.5 TBD, §7 exclusions)
- Phase 1 plan + cookbook: `context/changes/testing-bootstrap-auth-boundary/plan.md` (Phase 2 handler-extraction pattern, Phase 3 hosted-fixtures pattern, Phase 4 cookbook sync)
- Production generate handler: `src/lib/api-handlers/flashcards-generate-post.ts`
- Production generation service: `src/lib/services/flashcard-generation.ts`
- Production accept/reject/list service: `src/lib/services/flashcards.ts`
- Production practice queue: `src/lib/services/practice-session.ts` (`countDueCards`, `startPracticeSession`)
- Existing reject route (pre-extraction): `src/pages/api/flashcards/reject.ts`
- Phase 1 cookbook seed pattern: `tests/fixtures/seed.sql`, `tests/fixtures/README.md`, `tests/helpers/env.ts`, `.env.test.example`
- Lessons: `context/foundation/lessons.md` (L-001 — keep `database.types.ts` ESLint disable; do not weaken any lint rule for tests)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: LLM Stub Harness & Level Guard Unit

#### Automated

- [x] 1.1 `npm test` runs `tests/unit/level-guard.test.ts` green
- [x] 1.2 `npm run lint` passes
- [x] 1.3 `npm run build` passes

#### Manual

- [ ] 1.4 Local `/dashboard` generate still works after `filterCardsByLevel` extraction

### Phase 2: Generate Handler Error Matrix

#### Automated

- [ ] 2.1 `npm test` — all five `flashcards-generate.test.ts` cases pass against the hosted test project
- [ ] 2.2 `npm run lint` passes
- [ ] 2.3 `npm run build` passes

#### Manual

- [ ] 2.4 Manual generate from `/dashboard` with the real `OPENAI_API_KEY` still succeeds (stub does not bleed into dev)

### Phase 3: Accept/Reject State Machine & Queue Gate

#### Automated

- [ ] 3.1 `npm test` — all five `flashcards-state-machine.test.ts` cases pass
- [ ] 3.2 `npm run lint` passes
- [ ] 3.3 `npm run build` passes

#### Manual

- [ ] 3.4 Operator re-applied `seed.sql`; Table Editor shows Parent A draft batch alongside Parent B's
- [ ] 3.5 `.env.test` updated with `TEST_PARENT_A_GENERATION_ID`; `requireTestEnv()` clean
- [ ] 3.6 `/dashboard` accept + reject buttons still work in dev

### Phase 4: Cookbook §6.5 & Test-Plan Sync

#### Automated

- [ ] 4.1 `npm test` still passes
- [ ] 4.2 `npm run lint` passes

#### Manual

- [ ] 4.3 §6.5 readable standalone — Phase 3 contributor can copy the stub + state-machine patterns without re-reading the full plan
- [ ] 4.4 `change.md` set to `status: ready_for_implement` with updated date
