# Practice + Mastery Signal — Plan Brief

> Full plan: `context/changes/testing-practice-mastery-signal/plan.md`

## What & Why

Test-plan Phase 3 rollout (`context/foundation/test-plan.md` §3 row 3): write Vitest unit + integration tests that prove **risk #7** — "Completing a practice session doesn't advance SRS state or the mastery indicator the parent sees on dashboard." Without these tests, the PRD's "SRS updates and mastery reflect completed practice" contract (FR-006, FR-007) is protected only by code reading and manual smoke.

## Starting Point

Phase 1 (`testing-bootstrap-auth-boundary`) shipped the toolchain — `signInAs`, `createApiContext`, `requireTestEnv`, hosted-test-project seed, handler extraction pattern — and covered `postPracticeReview` 401 + cross-parent IDOR plus `postPracticeEnd` cross-parent IDOR. Phase 2 (`deck-generation-acceptance-gates`) added the programmatic accept-via-handler + UPDATE pattern (`tests/integration/flashcards-state-machine.test.ts`). Review/end/mastery-summary handlers are already extracted; `src/pages/api/practice/start.ts` still inlines its POST (parallel to where `reject.ts` was before Phase 2). The seed has no Parent A accepted+due cards, and the FSRS adapter (`src/lib/services/srs-adapter.ts`) has zero tests.

## Desired End State

`npm test` runs ~17 new cases proving: the SRS adapter contract holds for all four `Rating` values; a full start → review (Good) → review (Again) → end flow advances `srs_state`, `next_review_at`, `reps_count`, `last_reviewed_at`, `mastery_score` on each card and writes one `practice_attempts` row per review with the right `outcome`; double-review/invalid-srs/session-not-found return the right Polish copy at the right status; `endPracticeSession` is idempotent; `getMasterySummary` correctly counts cards above the 90% threshold, including a mixed batch and silently-skipped null `srs_state`. `practice/start` is extracted to `src/lib/api-handlers/practice-start-post.ts`; the §6.4 authn matrix is complete. Cookbook §6.6 holds copy-pastable practice-flow + `buildMasteredSrsState` patterns.

## Key Decisions Made

| Decision                            | Choice                                                         | Why (1 sentence)                                                                                                                          | Source |
| ----------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Practice-start handler extraction   | Extract `practice-start-post.ts` + add 401 to matrix           | Mirrors Phase 2's reject extraction; completes the test-plan §6.4 authn matrix in one step                                                | Plan   |
| Mastered-card state synthesis       | `buildMasteredSrsState` via ts-fsrs in a test helper           | Single source of truth — same library production uses computes the threshold; helper self-asserts on `>= MASTERY_THRESHOLD` before returning | Plan   |
| Happy-path rating coverage          | Two ratings at the integration layer (Good + Again)            | Covers both `practice_outcome` branches end-to-end; unit layer covers the remaining two ratings cheaply                                   | Plan   |
| Test file split                     | 3 files (srs unit + practice flow + mastery summary)           | Mirrors Phase 2's three-file shape; cleaner cookbook references; each file owns one concern                                               | Plan   |
| Fixture strategy for accepted+due   | Programmatic `beforeAll` (insert draft → accept → UPDATE due)  | Mirrors Phase 2 case 3/5 pattern; keeps seed minimal; **no new env var, no operator reseed step** — friction-free vs Phase 2 rollout      | Plan   |
| `UPDATE next_review_at` after accept | Hard-set to `'2000-01-01T00:00:00Z'` post-accept              | `initSrsState` from `createEmptyCard` may schedule a learning-step delay; explicit past timestamp eliminates flakiness                    | Plan   |
| Mastered-state install method       | Direct `supabase.update({ srs_state, ... })` on accepted card | Bypasses production's `initSrsState`-only path so mastery threshold is exercisable without dozens of synthetic reviews                    | Plan   |
| Dead error constants                | Do not test `CARD_NOT_IN_SESSION` / `NO_CHILD_LEVEL`            | Both are declared but never thrown by `practice-session.ts`; testing dead code adds noise without signal                                  | Plan   |
| Authn re-coverage                   | Skip review/mastery 401 + review/end cross-parent IDOR         | Phase 1 already covers these; re-asserting is redundant per test-plan §1 cost × signal                                                    | Plan   |

## Scope

**In scope:**

- SRS adapter unit (`tests/unit/srs-adapter.test.ts`) — all 4 ratings, `ratingToPracticeOutcome`, `masteryScoreFromCard`, `init/fromStored/toStored` round-trip
- Extract `practice-start-post.ts`; thin re-export from `src/pages/api/practice/start.ts`
- Add `postPracticeStart` 401 case to `tests/integration/authn-protected-apis.test.ts`
- Practice flow integration file: happy path (Good + Again), review error matrix (already-reviewed / invalid-srs / session-not-found), `postPracticeStart` no-due-cards 404, end idempotency
- `tests/helpers/srs-fixture.ts` with `buildMasteredSrsState` (ts-fsrs-backed, self-asserting)
- Mastery summary integration file: empty / single-mastered / mixed / null-srs-skipped
- Cookbook §6.6 + renumber per-rollout-phase notes to §6.7
- §3 Phase 3 row → `complete`; `change.md` → `ready_for_implement`

**Out of scope:**

- CI wiring of `npm test` (test-plan §3 Phase 4)
- Playwright / browser e2e
- Re-asserting Phase 1 auth boundaries
- Dead error constants
- Refactoring `recordPracticeReview` (no session-membership check added)
- `/practice` and `/dashboard` UI / snapshot tests
- Extending `tests/fixtures/seed.sql` or `REQUIRED_KEYS`
- Coverage gates

## Architecture / Approach

Three new test files + one small refactor + one small helper:

- **`tests/unit/srs-adapter.test.ts`** — pure unit, no Supabase, no `.env.test`.
- **`tests/integration/practice-flow.test.ts`** — signed-in Parent A; programmatic fixture (insert draft → `postAcceptFlashcards` → `UPDATE next_review_at = past`); drives `postPracticeStart → postPracticeReview ×2 → postPracticeEnd`; direct `flashcards` + `practice_attempts` SELECT assertions.
- **`tests/integration/mastery-summary.test.ts`** — signed-in Parent A; programmatic fixture; uses `buildMasteredSrsState` to install mastered states via direct UPDATE; drives `getMasterySummaryHandler`.
- **`tests/helpers/srs-fixture.ts`** — ts-fsrs-backed `buildMasteredSrsState` that loops `applyReview(Good)` until `>= MASTERY_THRESHOLD`, throws if it can't.

Production code touches: extract `src/lib/api-handlers/practice-start-post.ts` (1 handler + thin route re-export, behaviour preserved). No DI, no schema, no copy changes.

## Phases at a Glance

| Phase                                                       | What it delivers                                                                                          | Key risk                                                                                                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. SRS adapter unit + practice-start extraction             | `tests/unit/srs-adapter.test.ts`; extracted `practice-start-post.ts` + re-export                          | Extraction subtly changes start-route behaviour (caught by manual smoke + Phase 2 happy-path case)                                          |
| 2. Practice flow integration + authn matrix completion      | `tests/integration/practice-flow.test.ts` (8 cases); `postPracticeStart` 401 added to authn matrix file   | `next_review_at` post-accept is scheduler-dependent → flaky if we don't UPDATE to a fixed past timestamp                                    |
| 3. Mastery summary integration + SRS fixture helper         | `tests/helpers/srs-fixture.ts`; `tests/integration/mastery-summary.test.ts` (4 cases)                     | Future ts-fsrs tuning stops crossing the 0.9 threshold in `buildMasteredSrsState` — mitigated by the helper's own self-assert + loud throw |
| 4. Cookbook §6.6 + test-plan sync                           | `test-plan.md` §6.6 (new); §6.6 → §6.7 renumber; §3 Phase 3 → `complete`; change → `ready_for_implement`  | Cookbook drift if Phase 4 (CI quality gates) reshapes the integration test conventions                                                      |

**Prerequisites:** `.env.test` populated from Phase 1 + Phase 2; hosted Supabase test project reachable; no operator re-seed needed for this phase.

**Estimated effort:** ~1–2 sessions across 4 phases. Test runtime adds ~10–15s to the integration suite; CI wiring deferred.

## Open Risks & Assumptions

- **ts-fsrs tuning change**: `buildMasteredSrsState` may stop crossing `MASTERY_THRESHOLD` within 20 iterations if the FSRS algorithm or default scheduler params change. Mitigation: the helper throws loudly with the iteration count, pointing the maintainer at the right fix.
- **Programmatic-fixture cleanup leakage**: if a test is interrupted between `INSERT` and `afterAll`, a stale Parent A accepted batch could linger. Mitigation: every test scope holds its generation IDs in a cleanup array; `afterAll` deletes by generation ID; subsequent runs delete pre-existing Parent A accepted rows for the empty-case test.
- **`next_review_at` overwrite invisibility**: the practice flow happy-path UPDATE's `next_review_at` to past *after* `postAcceptFlashcards` — if Phase 2's accept handler ever stops setting `next_review_at` (currently set via `initSrsState`), the test would still pass because we overwrite it. Acceptable: Phase 2 already covers the accept-side of that contract.
- **`practice_attempts` outcome assertion uses string equality** — the enum values are `correct` / `incorrect` per the migration; if the enum is renamed, this test fails. Acceptable: that rename is a schema migration and would deliberately break many things.
- **L-001 ESLint disable preservation**: the extracted `practice-start-post.ts` must carry the comment block from existing peers; missing it means Phase 1 lint check goes red. Mitigation: copy-paste from `practice-end-post.ts` at extraction time.

## Success Criteria (Summary)

- `npm test` exercises the SRS adapter on all four ratings, the full start→review→end flow with DB-state assertions on `flashcards` and `practice_attempts`, the review-error Polish copy contract, end idempotency, and the mastery threshold via a deterministic helper.
- A future contributor adding a practice / mastery test can copy `test-plan.md` §6.6 patterns without re-reading this plan.
- Production code is unchanged in behaviour — only `practice/start.ts` handler is moved into `src/lib/api-handlers/`; verifiable manually from `/practice` and `/dashboard`.
