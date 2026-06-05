# CI Quality Gates Implementation Plan

## Overview

Wire the Vitest suites shipped in test-plan Phases 1–3 into the project's quality gates so they actually block regressions: a queued `test` job in `.github/workflows/ci.yml` runs `npm test` on every PR and on push to `main`, `deploy` blocks on `test` passing, and a husky `pre-push` hook runs the same suite locally before contributors open a PR. A small fixtures preflight turns the most painful failure mode (drifted test-project schema or stale seed) into a single actionable error line.

## Current State Analysis

- **CI today** (`.github/workflows/ci.yml:11-25`): one `ci` job runs `npm ci` → `npx astro sync` → `npm run lint` → `npm run build`. `npm run build` consumes the production-named `SUPABASE_URL` / `SUPABASE_KEY` secrets. **No test step exists.**
- **Deploy job** (`.github/workflows/ci.yml:27-52`) runs on push to `main` / `workflow_dispatch`, currently `needs: ci`; uses `cloudflare/wrangler-action@v3` with `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.
- **`npm test`** (`package.json:13`) runs `vitest run` across `tests/**/*.test.ts` — both `tests/unit/`, `tests/middleware/`, `tests/smoke/` and the integration suites under `tests/integration/` that authenticate against a hosted Supabase test project.
- **Env contract**: `tests/helpers/env.ts:1-13` requires 11 keys (`SUPABASE_URL`, `SUPABASE_KEY`, `OPENAI_API_KEY`, four Parent A/B credentials, four seeded v4 UUIDs). `requireTestEnv()` throws fail-fast on any missing key.
- **Setup pattern**: `tests/setup.ts:31` calls `loadEnvFile(".env.test")`, using `process.env[key] ??= value` — i.e. **values already in `process.env` win**, so CI step-level env vars need no on-disk `.env.test`.
- **Concurrency constraint**: `vitest.config.ts:14` sets `fileParallelism: false` because the suite shares a single Parent A fixture in a single hosted Supabase test project. This is per-process — **two CI runs in parallel against the same project will collide** (e.g. `flashcards-generate` vs `flashcards-state-machine` racing on Parent A rows).
- **Fixture lifecycle is manual** (`tests/fixtures/README.md`): operators apply two migrations + `seed.sql` in the Supabase SQL editor; failure mode when stale is `PGRST205` from deep inside Vitest output.
- **Local gate today**: husky `pre-commit` (`.husky/pre-commit:1`) runs `npx lint-staged` only. `AGENTS.md:46` PR guidance lists `npm run lint` and `npm run build` — not `npm test`.
- **Status in test-plan**: `context/foundation/test-plan.md` §5 row "unit + integration" is marked `required after §3 Phase 4`; this change is Phase 4 (`context/foundation/test-plan.md` §3 row 4).
- **Agent constraint**: `AGENTS.md:13` prohibits Docker / Supabase CLI from the agent shell on Windows — CI runs on `ubuntu-latest` so unaffected, but local hook must respect bypass via `git push --no-verify`.

### Key Discoveries

- `tests/setup.ts:27` lazy-merges `.env.test`, so CI doesn't need to materialize a file on disk — exporting env vars on the `npm test` step is enough.
- The preflight needs to be a **separate workflow step** (not just a `tests/smoke/` test) so `if: failure()` can emit a one-line `::error::` annotation pointing at `tests/fixtures/README.md`. A standalone smoke test alone would be drowned in Vitest output.
- The only safe place for the queue lock is **workflow-level `concurrency`** (`group: integration-tests`, `cancel-in-progress: false`). Job-level would still let the `ci` job race across PRs in ways we don't care about; workflow-level keeps the entire run serialized end-to-end.
- The Parent A seeded `children` row (queried by authenticated `parent_user_id`) is the safest probe for "migrations applied + seed re-applied" because it remains stable across the existing integration suite.

## Desired End State

- A PR on this repo runs `ci` (lint + build) then `test` (`npm test` with TEST_* secrets) and cannot merge if `test` fails.
- A push to `main` runs the same gates; `deploy` runs only if both pass.
- Two PRs opened in quick succession do not collide — their workflow runs queue behind one another on the `integration-tests` concurrency group.
- A drifted test-project schema or a wiped seed surfaces as a single GitHub annotation: `::error file=tests/fixtures/README.md::Test project fixtures missing or stale…` — not a 200-line Vitest stack trace.
- A contributor pushing locally runs `npm test` first via `pre-push`; an emergency WIP push works with `git push --no-verify`.
- `context/foundation/test-plan.md` §5 row reads `required` (no longer `required after §3 Phase 4`); §3 row 4 status reads `complete` with this change folder.

### Verification

- `gh workflow run CI` (or open a throwaway PR): `test` job appears, runs `npm test`, exits 0; `deploy` runs only after.
- Temporarily delete Parent A's `public.children` row in the hosted test project: workflow fails on the preflight step with the documented annotation; re-apply `tests/fixtures/seed.sql` after verification.
- Push a branch with `npm test` failing locally: `pre-push` blocks push; `git push --no-verify` succeeds.
- Open two PRs at once: second workflow shows "queued" with reason `concurrency group integration-tests`.

## What We're NOT Doing

- Playwright / browser e2e in CI (test-plan §6.3 — deferred; revisit only when integration cannot catch a cookie/SSR-hydration flow).
- Splitting unit vs integration into separate jobs or sharding across runners (single `test` job per Q1 decision; fileParallelism stays off).
- Dedicated CI-only Supabase project (one shared hosted test project remains; concurrency group prevents collision per Q2 decision).
- Automated `supabase db push` / seed apply from CI via service-role (manual ops per Q6 decision; preflight surfaces drift instead).
- Coverage reporting / thresholds, post-edit agent-loop hooks, visual diff (out of scope, test-plan §5 leaves these `optional` / `planned`).
- Renaming the existing build-time `SUPABASE_URL` / `SUPABASE_KEY` repo secrets, or repointing the `ci`/`deploy` jobs' build at the test project — that's pre-existing status quo.
- Extending the pre-commit hook with `npm test` (per Q3 decision; pre-push only).

## Implementation Approach

1. Land the **preflight smoke test** first as a building block — a Vitest test that signs in as Parent A and reads the known seed row, throwing the actionable message on miss. Verify locally.
2. Wire the **CI `test` job**: workflow-level `concurrency`, per-step env mapping from new `TEST_*` GitHub Actions secrets, preflight step + failure annotation, `npm test`, and `deploy.needs: [ci, test]`.
3. Ship the **local pre-push hook** and **doc updates**: `package.json` husky bootstrap script, `.husky/pre-push`, `AGENTS.md` PR guidance, `tests/fixtures/README.md` (CI secrets section), top-level contributor CI notes (`README.md` / `CLAUDE.md` where applicable), and the test-plan §3/§5 status flips.

## Critical Implementation Details

- **Concurrency must be workflow-level, not job-level.** Job-level `concurrency` only serializes that one job within a single workflow run — it would not stop two PR workflows from running their `test` jobs simultaneously. Put `concurrency: { group: integration-tests, cancel-in-progress: false }` at the top of `ci.yml`, sibling of `on:`. The `cancel-in-progress: false` is deliberate: a half-run integration suite that gets cancelled may leave Parent A draft cards / sessions in inconsistent states — better to queue.
- **CI does not need a `.env.test` file.** `tests/setup.ts:27` uses `process.env[key] ??= value`, which means existing env vars take precedence over `.env.test`. Map `TEST_*` secrets directly onto the `env:` block of the relevant CI step; do NOT write the file to disk.
- **Preflight check ordering.** Run preflight as its own step BEFORE `npm test` so failure surfaces immediately. Use `id: preflight` + a follow-up `if: failure() && steps.preflight.conclusion == 'failure'` step to emit one `::error file=tests/fixtures/README.md::…` annotation. Without the step split, the annotation drowns in the broader Vitest run.
- **The preflight probe must use the authenticated app-client path** (not service-role SQL): call `signInAs("A")`, build a client with `createClient(headers, cookies)`, then query Parent A's seeded `children` row with RLS on. Missing row → throw `Test project fixtures missing or stale. Apply migrations + tests/fixtures/seed.sql per tests/fixtures/README.md.` so the message is grep-able and points at the doc.
- **Pre-push runtime.** `npm test` with `fileParallelism: false` and hosted Supabase round-trips is typically 30–120s. Contributors with a slow link or no `.env.test` configured must be able to bypass with `git push --no-verify`. Call this out in `AGENTS.md`.

---

## Phase 1: Fixtures Preflight Smoke Test

### Overview

Add the smallest possible Vitest test that proves "the test project is up: migrations applied, seed applied, parents signable". This is the building block CI's preflight step invokes.

### Changes Required:

#### 1. Preflight smoke test

**File**: `tests/smoke/fixtures-preflight.test.ts` (new)

**Intent**: Sign in as Parent A and read Parent A's seeded `children` row via the production-client path. If the row is missing, throw a one-line actionable error pointing at `tests/fixtures/README.md`. The test exists as a fast (~2–5s) standalone canary that the CI workflow can invoke before the full suite.

**Contract**: A single `describe("fixtures preflight")` with one `it("Parent A's seeded child row is reachable …")`. Uses `requireTestEnv()`, `signInAs("A")` (existing helper from `tests/helpers/auth-session.ts`), then creates an authenticated client and `select`s from `children` filtered by `parent_user_id = session.user.id` with `maybeSingle()`. Asserts the row exists; otherwise throws an error whose message is exactly `Test project fixtures missing or stale. Apply migrations + tests/fixtures/seed.sql per tests/fixtures/README.md.` so the CI annotation in Phase 2 can quote it verbatim.

### Success Criteria:

#### Automated Verification:

- Preflight test passes locally against a configured `.env.test`: `npx vitest run tests/smoke/fixtures-preflight.test.ts`
- Full suite still passes: `npm test`
- Lint passes: `npm run lint`

#### Manual Verification:

- Temporarily delete Parent A's `public.children` row in the hosted test project; rerun preflight; assert the failure message reads exactly `Test project fixtures missing or stale. Apply migrations + tests/fixtures/seed.sql per tests/fixtures/README.md.`
- Re-apply `tests/fixtures/seed.sql` (or restore Parent A's child row); preflight passes again.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: CI Workflow — `test` Job

### Overview

Append a `test` job to `.github/workflows/ci.yml`, gate `deploy` on it, and lock the workflow on a queued concurrency group so parallel runs don't trample the shared hosted Supabase project.

### Changes Required:

#### 1. Workflow-level concurrency

**File**: `.github/workflows/ci.yml`

**Intent**: Serialize the entire workflow on a single named group so two PRs cannot run their `test` jobs concurrently and corrupt Parent A fixtures.

**Contract**: Add a top-level (sibling of `on:`) `concurrency:` block with `group: integration-tests` and `cancel-in-progress: false`. Documented in a comment so future maintainers don't widen the group accidentally.

#### 2. `test` job definition

**File**: `.github/workflows/ci.yml`

**Intent**: New job that runs `npm test` against the hosted test Supabase project, ordered after `ci` (lint + build) so test feedback is signal on top of green type/build.

**Contract**: New `jobs.test` block with `needs: ci`, `runs-on: ubuntu-latest`. Steps: `actions/checkout@v4` → `actions/setup-node@v4` (node 22, `cache: npm`) → `npm ci` → `npx astro sync` → preflight step → annotation step → `npm test`. The preflight and `npm test` steps share an `env:` block mapping these GitHub secrets:

| Env var (test runtime)           | GitHub secret                       |
| -------------------------------- | ----------------------------------- |
| `SUPABASE_URL`                   | `TEST_SUPABASE_URL`                 |
| `SUPABASE_KEY`                   | `TEST_SUPABASE_KEY`                 |
| `OPENAI_API_KEY`                 | `TEST_OPENAI_API_KEY`               |
| `TEST_PARENT_A_EMAIL`            | `TEST_PARENT_A_EMAIL`               |
| `TEST_PARENT_A_PASSWORD`         | `TEST_PARENT_A_PASSWORD`            |
| `TEST_PARENT_A_GENERATION_ID`    | `TEST_PARENT_A_GENERATION_ID`       |
| `TEST_PARENT_B_EMAIL`            | `TEST_PARENT_B_EMAIL`               |
| `TEST_PARENT_B_PASSWORD`         | `TEST_PARENT_B_PASSWORD`            |
| `TEST_PARENT_B_CHILD_ID`         | `TEST_PARENT_B_CHILD_ID`            |
| `TEST_PARENT_B_GENERATION_ID`    | `TEST_PARENT_B_GENERATION_ID`       |
| `TEST_PARENT_B_SESSION_ID`       | `TEST_PARENT_B_SESSION_ID`          |

(The `TEST_SUPABASE_URL` / `TEST_SUPABASE_KEY` secrets are intentionally distinct from the existing `SUPABASE_URL` / `SUPABASE_KEY` secrets used by `ci.build` / `deploy` so the production project is never the test target.)

#### 3. Preflight step + failure annotation

**File**: `.github/workflows/ci.yml`

**Intent**: Surface fixture drift as a one-line, actionable annotation in the GitHub Checks UI instead of buried Vitest output.

**Contract**: Two consecutive steps inside `jobs.test`:

```yaml
- name: Verify test fixtures (preflight)
  id: preflight
  env:
    SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
    SUPABASE_KEY: ${{ secrets.TEST_SUPABASE_KEY }}
    OPENAI_API_KEY: ${{ secrets.TEST_OPENAI_API_KEY }}
    TEST_PARENT_A_EMAIL: ${{ secrets.TEST_PARENT_A_EMAIL }}
    TEST_PARENT_A_PASSWORD: ${{ secrets.TEST_PARENT_A_PASSWORD }}
    TEST_PARENT_A_GENERATION_ID: ${{ secrets.TEST_PARENT_A_GENERATION_ID }}
    TEST_PARENT_B_EMAIL: ${{ secrets.TEST_PARENT_B_EMAIL }}
    TEST_PARENT_B_PASSWORD: ${{ secrets.TEST_PARENT_B_PASSWORD }}
    TEST_PARENT_B_CHILD_ID: ${{ secrets.TEST_PARENT_B_CHILD_ID }}
    TEST_PARENT_B_GENERATION_ID: ${{ secrets.TEST_PARENT_B_GENERATION_ID }}
    TEST_PARENT_B_SESSION_ID: ${{ secrets.TEST_PARENT_B_SESSION_ID }}
  run: npx vitest run tests/smoke/fixtures-preflight.test.ts

- name: Annotate preflight failure
  if: failure() && steps.preflight.conclusion == 'failure'
  run: echo "::error file=tests/fixtures/README.md::Test project fixtures missing or stale. Apply migrations + tests/fixtures/seed.sql per tests/fixtures/README.md."

- name: Run test suite
  env:
    SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
    SUPABASE_KEY: ${{ secrets.TEST_SUPABASE_KEY }}
    OPENAI_API_KEY: ${{ secrets.TEST_OPENAI_API_KEY }}
    TEST_PARENT_A_EMAIL: ${{ secrets.TEST_PARENT_A_EMAIL }}
    TEST_PARENT_A_PASSWORD: ${{ secrets.TEST_PARENT_A_PASSWORD }}
    TEST_PARENT_A_GENERATION_ID: ${{ secrets.TEST_PARENT_A_GENERATION_ID }}
    TEST_PARENT_B_EMAIL: ${{ secrets.TEST_PARENT_B_EMAIL }}
    TEST_PARENT_B_PASSWORD: ${{ secrets.TEST_PARENT_B_PASSWORD }}
    TEST_PARENT_B_CHILD_ID: ${{ secrets.TEST_PARENT_B_CHILD_ID }}
    TEST_PARENT_B_GENERATION_ID: ${{ secrets.TEST_PARENT_B_GENERATION_ID }}
    TEST_PARENT_B_SESSION_ID: ${{ secrets.TEST_PARENT_B_SESSION_ID }}
  run: npm test
```

The annotation step has no other guard — it runs only when the preflight step itself failed, not when later `npm test` fails.

#### 4. Block deploy on test

**File**: `.github/workflows/ci.yml`

**Intent**: `deploy` should not ship code that fails Phases 1–3 suites.

**Contract**: Change `jobs.deploy.needs: ci` → `jobs.deploy.needs: [ci, test]`. No other change to the deploy job.

### Success Criteria:

#### Automated Verification:

- Workflow YAML validates: `npx --yes @action-validator/cli --quiet .github/workflows/ci.yml` (or equivalent) parses with no errors
- Lint still passes: `npm run lint`

#### Manual Verification:

- Add the 11 `TEST_*` secrets to GitHub repo Settings → Secrets and variables → Actions, using values from local `.env.test`
- Open a throwaway PR (or use `workflow_dispatch`): the `test` job appears, runs `npm test`, exits 0; `deploy` job stays skipped on PR and runs after `test` on push to `main`
- Temporarily delete Parent A's `public.children` row in the hosted test project; rerun workflow; observe the GitHub Checks UI shows a single `::error::` annotation on `tests/fixtures/README.md` with the documented message
- Re-apply `tests/fixtures/seed.sql` (or restore Parent A's child row); rerun; workflow passes
- Open two PRs in quick succession; second workflow run shows "queued" / "waiting" with concurrency group `integration-tests`; second run starts only when first finishes
- (Negative) `deploy` job does not run when `test` fails — verified by temporarily breaking a test on a `main`-targeted push

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Local Pre-Push Gate & Documentation

### Overview

Ship the local mirror of the CI gate (husky `pre-push` running `npm test`) and update contributor-facing docs so the new gates and operator steps are discoverable.

### Changes Required:

#### 1. Husky bootstrap script

**File**: `package.json`

**Intent**: Ensure husky hooks are installed automatically for fresh clones so `pre-push` enforcement is not opt-in.

**Contract**: Add `"prepare": "husky"` in `scripts` (preserving existing commands) so `npm install` re-establishes hooks via husky 9.

#### 2. Husky pre-push hook

**File**: `.husky/pre-push` (new)

**Intent**: Run the full suite locally before any push, blocking the push if tests fail. Match the husky 9 minimal style used in `.husky/pre-commit`.

**Contract**: One-line script body: `npm test`. No shebang or husky boilerplate beyond husky 9 conventions (consistent with `.husky/pre-commit`). Executable bit set per husky 9 install guidance.

#### 3. Contributor docs — AGENTS.md + top-level CI notes

**File**: `AGENTS.md`, `README.md` (if CI section exists), `CLAUDE.md` (if CI section exists)

**Intent**: Keep contributor-facing CI guidance aligned with the new test gate and pre-push behavior.

**Contract**: Update the Pull Requests section (`AGENTS.md:44-46`) so the local pre-PR ritual reads "Run `npm run lint`, `npm run build`, and `npm test` locally before opening a PR." Add a sentence: "A husky `pre-push` hook runs `npm test` automatically; bypass with `git push --no-verify` for WIP pushes you don't intend to PR yet." Note in the Build/Test section that integration tests need `.env.test`, mirroring `requireTestEnv()`'s failure-mode message. If `README.md` and/or `CLAUDE.md` contain CI gate text, update those lines to include the same `npm test` gate and keep branch naming consistent with `.github/workflows/ci.yml`.

#### 4. tests/fixtures/README.md — CI section

**File**: `tests/fixtures/README.md`

**Intent**: Document the 11 `TEST_*` GitHub secrets a repo admin must populate before CI can run, and what to do when the preflight annotation fires.

**Contract**: New "## 5. Configure CI secrets" section listing all 11 secret names with a one-line description of each and pointing the operator at this README when re-applying fixtures. New "## 6. Recovering from a preflight annotation in CI" subsection that names the annotation message verbatim and points back to §0–§2 (apply migrations + seed).

#### 5. Test plan status flips

**File**: `context/foundation/test-plan.md`

**Intent**: Reflect that Phase 4 is complete and that the `unit + integration` quality gate is now unconditionally required.

**Contract**: §3 row 4 (`CI quality gates`) Status flips `change opened` → `complete`. §5 row `unit + integration` Required column flips `required after §3 Phase 4` → `required`. §8 "Strategy last reviewed" date bumped to 2026-06-05.

#### 6. Change-folder status

**File**: `context/changes/testing-ci-quality-gates/change.md`

**Intent**: Sync change-folder front matter with the test-plan row after the change lands.

**Contract**: Update `status:` to `complete` and `updated:` to the merge date.

### Success Criteria:

#### Automated Verification:

- `package.json` contains `"prepare": "husky"` and `npm install` re-establishes hooks
- `.husky/pre-push` exists and is executable
- Lint still passes: `npm run lint`
- A failing test reproduces locally: temporarily break a test, run `git push` on a throwaway branch, push is rejected; `git push --no-verify` succeeds

#### Manual Verification:

- Fresh clone, install, `git push` on a working tree runs `npm test` and pushes only on green
- AGENTS.md, README.md/CLAUDE.md CI notes (if present), tests/fixtures/README.md, and test-plan.md changes read correctly and are internally consistent
- A contributor following the updated docs alone can configure GitHub secrets and trigger the workflow on a fresh fork

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before declaring the change complete.

---

## Testing Strategy

### Unit Tests

- N/A — this change wires existing tests into gates rather than adding new test logic.

### Integration Tests

- Phase 1's preflight smoke test is the only new test. Its job is to fail fast with a fixable message, not to broaden coverage.

### Manual Testing Steps

1. Land Phase 1; run `npm test` locally — preflight + full suite green.
2. Land Phase 2; open a throwaway PR — observe `test` job runs and gates `deploy`.
3. Land Phase 3; clone fresh, attempt to push a branch with a broken test — `pre-push` blocks; `--no-verify` bypasses.
4. Open two PRs in parallel — second workflow queues on concurrency group.
5. Temporarily delete Parent A's `public.children` row — observe single annotation; re-apply `tests/fixtures/seed.sql`; rerun green.

## Performance Considerations

- CI `test` job adds ~1–2 minutes per workflow run (Vitest with `fileParallelism: false` against hosted Supabase). Queued concurrency means parallel PRs serialize the `test` phase — acceptable at current PR volume; revisit if PR throughput grows.
- `pre-push` adds the same ~1–2 minutes to every `git push`. Contributors with stale or absent `.env.test` get a fail-fast error from `requireTestEnv()` and can `git push --no-verify` if a green test run is not yet possible.

## Migration Notes

- One-time operator action: populate 11 `TEST_*` GitHub Actions secrets from a working `.env.test`. Without this, the first workflow run fails at the preflight step with an env-missing error from `requireTestEnv()` (not the schema-drift annotation).
- No code-level migration; no DB migration; existing `ci` / `deploy` job behaviour unchanged except for `deploy.needs`.

## References

- Test plan Phase 4 row: `context/foundation/test-plan.md` §3 row 4
- Phase 1 bootstrap (Vitest install + env contract): `context/changes/testing-bootstrap-auth-boundary/plan.md`
- Env contract: `tests/helpers/env.ts:1-13`
- Setup precedence rule: `tests/setup.ts:27`
- Concurrency rationale: `vitest.config.ts:14`
- Current workflow: `.github/workflows/ci.yml`
- Fixture README: `tests/fixtures/README.md`
- Agent hard rules: `AGENTS.md:13,46`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Fixtures Preflight Smoke Test

#### Automated

- [x] 1.1 Preflight test passes locally against a configured `.env.test`: `npx vitest run tests/smoke/fixtures-preflight.test.ts` — 31c7c86
- [x] 1.2 Full suite still passes: `npm test` — 31c7c86
- [x] 1.3 Lint passes: `npm run lint` — 31c7c86

#### Manual

- [x] 1.4 Temporarily delete Parent A's `public.children` row in the hosted test project; rerun preflight; assert the failure message reads exactly `Test project fixtures missing or stale. Apply migrations + tests/fixtures/seed.sql per tests/fixtures/README.md.` — 31c7c86
- [x] 1.5 Re-apply `tests/fixtures/seed.sql` (or restore Parent A's child row); preflight passes again — 31c7c86

### Phase 2: CI Workflow — `test` Job

#### Automated

- [x] 2.1 Workflow YAML validates: `npx --yes @action-validator/cli --quiet .github/workflows/ci.yml` parses with no errors
- [x] 2.2 Lint still passes: `npm run lint`

#### Manual

- [ ] 2.3 Add the 11 `TEST_*` secrets to GitHub repo Settings → Secrets and variables → Actions, using values from local `.env.test`
- [ ] 2.4 Open a throwaway PR (or use `workflow_dispatch`): the `test` job appears, runs `npm test`, exits 0; `deploy` job stays skipped on PR and runs after `test` on push to `main`
- [ ] 2.5 Temporarily delete Parent A's `public.children` row in the hosted test project; rerun workflow; observe the GitHub Checks UI shows a single `::error::` annotation on `tests/fixtures/README.md` with the documented message
- [ ] 2.6 Re-apply `tests/fixtures/seed.sql` (or restore Parent A's child row); rerun; workflow passes
- [ ] 2.7 Open two PRs in quick succession; second workflow run shows "queued" / "waiting" with concurrency group `integration-tests`; second run starts only when first finishes
- [ ] 2.8 `deploy` job does not run when `test` fails — verified by temporarily breaking a test on a `main`-targeted push

### Phase 3: Local Pre-Push Gate & Documentation

#### Automated

- [ ] 3.1 `package.json` contains `"prepare": "husky"` and `npm install` re-establishes hooks
- [ ] 3.2 `.husky/pre-push` exists and is executable
- [ ] 3.3 Lint still passes: `npm run lint`
- [ ] 3.4 A failing test reproduces locally: temporarily break a test, run `git push` on a throwaway branch, push is rejected; `git push --no-verify` succeeds

#### Manual

- [ ] 3.5 Fresh clone, install, `git push` on a working tree runs `npm test` and pushes only on green
- [ ] 3.6 AGENTS.md, README.md/CLAUDE.md CI notes (if present), tests/fixtures/README.md, and test-plan.md changes read correctly and are internally consistent
- [ ] 3.7 A contributor following the updated docs alone can configure GitHub secrets and trigger the workflow on a fresh fork
