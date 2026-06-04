# Deck Generation & Acceptance Gates — Plan Brief

> Full plan: `context/changes/deck-generation-acceptance-gates/plan.md`

## What & Why

Test-plan Phase 2 rollout (`context/foundation/test-plan.md` §3 row 2): write Vitest unit + integration tests that prove **risks #3–#6** — AI level guard, generate timeout/error matrix, accept/reject state machine, and the practice-queue gate. Without these tests, the PRD's "must respect the child's level" guardrail (FR-003, §Guardrails) and "only parent-accepted cards reach SRS" contract (FR-004, FR-006) are protected only by code reading.

## Starting Point

Phase 1 (`testing-bootstrap-auth-boundary`) shipped the toolchain: Vitest with `astro:env/server`/`astro:middleware` stubs, fail-fast `.env.test` via `requireTestEnv`, hosted Supabase test project with two-parent seed, `signInAs` + `createApiContext` helpers, and a handler-extraction pattern under `src/lib/api-handlers/`. Generate and accept handlers are already extracted; reject still inlines in `src/pages/api/flashcards/reject.ts`. The level filter is inlined inside `generateFlashcards`. The seed has no Parent A draft batch.

## Desired End State

`npm test` runs ~11 new cases proving: above-level cards never reach `flashcards`; generate returns 200/504/503/500 with the right Polish copy in each branch; accept moves draft→accepted with SRS state set; double-accept returns 404; reject moves draft→rejected; a `status='draft'` card with `next_review_at` set is **excluded** from `startPracticeSession`; `listDraftBatches` excludes accepted/rejected generations. Cookbook §6.5 contains copy-pastable stub + state-machine patterns.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|------------------|--------|
| LLM stubbing technique | `vi.mock("ai", ...)` + `vi.mock("@ai-sdk/openai", ...)` | Stays at the third-party boundary the test-plan demands without a DI refactor of `flashcard-generation.ts` | Plan |
| Fixture seam for Parent A state | Extend `tests/fixtures/seed.sql` + new UUID in `.env.test.example`/README/`REQUIRED_KEYS` | Deterministic, parallel-safe, mirrors Phase 1 cookbook §6.4 | Plan |
| Level-guard test layer | Pure unit on extracted `filterCardsByLevel` + one integration via stubbed `generateText` | Cheap fast signal on the rule + DB round-trip proves the filter is actually wired before persistence | Plan |
| Accept/reject coverage | 5-case matrix (happy accept + SRS init, double-accept 404, reject happy, adversarial draft excluded from queue, draft-list excludes accepted/rejected) | Covers every transition risks #4/#5 fear without padding for `eq("status",…)` redundancy | Plan |
| Generate error matrix | 4 cases — happy 200, timeout 504, generic 503, missing API key 500 | One branch per Polish error string the parent will actually see | Plan |
| Reject handler scope | Extract `flashcards-reject-post.ts` only (thin re-export pattern) | Enables reject tests without scope-creeping into Phase 3 practice handlers | Plan |
| Missing API key test mechanic | `vi.resetModules()` + `vi.doMock("astro:env/server", ...)` + dynamic import | `OPENAI_API_KEY` is module-load captured; this is the standard Vitest workaround | Plan |
| Risk #4 sharp-edge test | Adversarially insert `status='draft'` card with `next_review_at` in the past | Exercises the `eq("status","accepted")` clause directly instead of passively relying on null `next_review_at` | Plan |

## Scope

**In scope:**
- Pure unit test on level filter (after extracting it from `generateFlashcards`)
- Reusable LLM stub helper at the `ai` SDK boundary
- 4-case generate error matrix against `postGenerateFlashcards`
- Extract reject handler to `src/lib/api-handlers/flashcards-reject-post.ts`; thin re-export
- Extend `tests/fixtures/seed.sql` with a Parent A draft batch + new UUID in `.env.test.example`/`README`/`REQUIRED_KEYS`
- 5-case accept/reject + queue-gate matrix
- Cookbook §6.5 + §6.6 sync; change → `ready_for_implement`

**Out of scope:**
- Real OpenAI calls (test-plan §7 exclusion)
- CI wiring of `npm test` (test-plan Phase 4)
- Playwright / browser e2e
- DI refactor of `flashcard-generation.ts`
- Extracting `practice/start.ts` or other practice handlers (Phase 3 territory)
- Snapshot/UI tests
- Coverage gates

## Architecture / Approach

Three test files plus one small refactor:

- **`tests/unit/level-guard.test.ts`** → tests an extracted `filterCardsByLevel(cards, level)` pure helper (no LLM, no DB).
- **`tests/integration/flashcards-generate.test.ts`** → file-top `vi.mock("ai", …)`; per-case `mockGenerateTextHappy/Timeout/Failure` from `tests/helpers/openai-mock.ts`; missing-key case via `vi.doMock` + `vi.resetModules` + dynamic import. Drives `postGenerateFlashcards` with a signed-in Parent A session.
- **`tests/integration/flashcards-state-machine.test.ts`** → seeded Parent A draft batch from `seed.sql`; cases drive `postAcceptFlashcards`, `postRejectFlashcards`, `startPracticeSession`, `listDraftBatches` against the hosted test project (RLS-bound anon client).

Production code touches: extract `filterCardsByLevel` (1 helper, behavior preserved), extract reject handler (1 handler + thin route re-export, behavior preserved). No DI, no schema, no copy changes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|------------------|----------|
| 1. LLM stub harness + level guard unit | `tests/helpers/openai-mock.ts`, extracted `filterCardsByLevel`, `tests/unit/level-guard.test.ts` | Filter extraction subtly changes generation behavior |
| 2. Generate handler error matrix | `tests/integration/flashcards-generate.test.ts` with 5 cases (incl. level-filter wired check) | Missing-key test isolation (vi.doMock + resetModules) bleeds into sibling cases |
| 3. Accept/reject state machine + queue gate | Reject handler extracted, seed extended, `tests/integration/flashcards-state-machine.test.ts` with 5 cases | Operator forgets to re-apply `seed.sql` and update `.env.test`; tests stay red until they do |
| 4. Cookbook §6.5 + per-phase notes | `test-plan.md` §6.5 + §6.6 patterns, change → `ready_for_implement` | Cookbook drift if Phase 3 (Practice + mastery) reshapes the helpers |

**Prerequisites:** `.env.test` working (Phase 1); hosted Supabase test project reachable; ability for the operator to re-apply `tests/fixtures/seed.sql` once when Phase 3 lands.

**Estimated effort:** ~2 sessions across 4 phases. Test runtime ~20–30s with the integration suite; CI wiring deferred.

## Open Risks & Assumptions

- **`vi.mock("ai", …)` shape may need a follow-up** if the `ai` SDK upgrades its `generateText`/`Output.object` signature. Mitigation: helper centralises the mock so one file changes, not the test suite.
- **Test ordering in the state-machine file** — case 5 (`listDraftBatches` excludes accepted/rejected) reads state created by cases 1 + 3. Plan mitigates with a focused `describe` block + explicit `beforeAll` accept/reject setup; if Vitest randomises test order, that block self-contains the dependency.
- **Operator step in Phase 3** — re-applying `seed.sql` and adding `TEST_PARENT_A_GENERATION_ID` to `.env.test` is manual (AGENTS.md forbids `supabase` CLI from the agent on Windows). If skipped, Phase 3 tests fail with a `requireTestEnv()` error pointing at the missing key, which is the intended fail-fast UX.
- **Adversarial draft row in case 4** — the test inserts a card violating the production invariant that drafts have null `next_review_at`. RLS still applies; cleanup deletes the row in `afterAll`. If cleanup leaks (e.g. test interrupted), a stale row could nudge later runs — covered by the same Parent A scope, but worth keeping the cleanup defensive.

## Success Criteria (Summary)

- `npm test` exercises the level guard, every generate-handler error branch with Polish copy locked, the accept/reject state machine, and the practice-queue status gate.
- A future contributor adding a deck-generation or status-mutation test can copy `test-plan.md` §6.5 patterns without re-reading this plan.
- Production code is unchanged in behavior — only `filterCardsByLevel` extraction and reject handler extraction; both verifiable manually from `/dashboard`.
