# CI Quality Gates — Plan Brief

> Full plan: `context/changes/testing-ci-quality-gates/plan.md`

## What & Why

Wire the Vitest suites shipped in test-plan Phases 1–3 into the project's quality gates so they actually block regressions. Today `npm test` exists and the suites pass, but nothing runs them — CI builds and deploys without ever invoking them, and contributors have no local prompt to run them before opening a PR. This change adds a `test` job to CI, blocks `deploy` on it, and installs a local `pre-push` hook so the gate is enforced on both ends of the contribution loop.

## Starting Point

`.github/workflows/ci.yml` runs `lint` + `astro sync` + `build` on every PR and push to `main`, then a separate `deploy` job ships to Cloudflare Workers. `npm test` runs `vitest run` over a mixed unit + integration suite that authenticates against a hosted Supabase test project, but is invoked by humans only. Husky `pre-commit` runs `lint-staged`; there is no `pre-push` hook. `AGENTS.md` tells contributors to run `npm run lint` and `npm run build` before opening a PR — not `npm test`.

## Desired End State

PRs and pushes to `main` run `npm test` in CI; merges and deploys are blocked when tests fail. Local `git push` runs the same suite first and rejects the push on red (skippable with `--no-verify`). Two parallel CI runs cannot collide on the shared hosted Supabase test project because the workflow holds a queued concurrency lock. When the hosted test project's schema or seed drifts, the operator sees a single GitHub annotation pointing at `tests/fixtures/README.md` — not a wall of Vitest output. The test-plan §5 row "unit + integration" reads `required` instead of `required after §3 Phase 4`.

## Key Decisions Made

| Decision                           | Choice                                                                                          | Why (1 sentence)                                                                                          | Source |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------ |
| CI job shape                       | One `test` job after `ci` (lint+build)                                                          | Test failures should be diagnosed on top of a green lint/build, not interleaved.                          | Plan   |
| Concurrent-run safety              | Workflow-level `concurrency: integration-tests`, `cancel-in-progress: false`                    | Shared hosted Supabase + `fileParallelism: false` means parallel CI runs corrupt Parent A fixtures.        | Plan   |
| Local gate                         | Husky `pre-push` hook running `npm test`                                                        | Matches CI signal at push-time without slowing every commit; `--no-verify` available for WIP pushes.       | Plan   |
| Secret shape                       | Per-key `TEST_*` GitHub Actions secrets, mapped to runtime env on the test step                 | Keeps test-project credentials cleanly distinct from production `SUPABASE_URL`/`SUPABASE_KEY` build secrets. | Plan   |
| Schema/seed freshness              | Preflight test + dedicated workflow step that emits a `::error::` annotation on failure         | Stale-fixture failures are the loudest CI flake mode; turn them into one actionable line.                  | Plan   |
| Deploy gating                      | `deploy.needs: [ci, test]`                                                                      | Deploys must not ship code that fails the suites Phases 1–3 protect.                                       | Plan   |
| Failure UX                         | Trust `requireTestEnv()` for env errors + add one annotation for fixture drift                  | Existing fail-fast is already actionable; only fixture drift needs better surfacing.                       | Plan   |

## Scope

**In scope:**
- New `tests/smoke/fixtures-preflight.test.ts`
- New `test` job in `.github/workflows/ci.yml` with concurrency lock, secret mapping, preflight step + annotation
- `deploy.needs` updated to block on `test`
- New `.husky/pre-push` hook running `npm test`
- Docs: `AGENTS.md` PR section, `tests/fixtures/README.md` CI section, `context/foundation/test-plan.md` §3/§5 status flips, `change.md` status

**Out of scope:**
- Playwright / e2e in CI (test-plan §6.3 — still deferred)
- Splitting unit/integration jobs, sharding, dedicated CI Supabase project
- Automated `supabase db push` / seed apply from CI
- Coverage reporting, post-edit hooks, visual diff
- Renaming the existing production `SUPABASE_URL` / `SUPABASE_KEY` build secrets

## Architecture / Approach

Workflow topology after the change:

```
on: push(main) | pull_request(main) | workflow_dispatch
concurrency: integration-tests (queue, do not cancel)

  ci  ──► test ──► deploy (only on push to main / workflow_dispatch)
 (lint    (preflight + npm test against hosted
  build)   Supabase test project, TEST_* secrets)
```

The `test` job depends on `ci`, and `deploy` depends on both. Workflow-level concurrency means an entire second run queues behind the first — the right granularity given the shared Supabase test project.

Locally, husky gains a sibling hook:

```
.husky/
  pre-commit   (existing: lint-staged)
  pre-push     (new: npm test)
```

## Phases at a Glance

| Phase                                  | What it delivers                                                                                  | Key risk                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1. Fixtures preflight smoke test       | Single Vitest test that probes Parent A's seeded generation row with an actionable error message  | Probe is too narrow / misses drift; mitigated by using a real handler path     |
| 2. CI workflow — `test` job            | `test` job, concurrency lock, secret mapping, preflight step + annotation, `deploy.needs` update  | YAML/secret config drift; mitigated by manual end-to-end PR test               |
| 3. Local pre-push gate & documentation | `.husky/pre-push`, AGENTS.md + fixture README + test-plan §3/§5 status updates                    | Slow `pre-push` annoys contributors; mitigated by documenting `--no-verify`    |

**Prerequisites:** Working local `.env.test` against a hosted Supabase test project; repo-admin access to add 11 `TEST_*` GitHub Actions secrets.
**Estimated effort:** ~1 session across 3 phases; preflight + workflow edits are small, the verification matrix is the bulk of the time.

## Open Risks & Assumptions

- Parallel-PR throughput on this repo is low; if it grows, queued concurrency becomes a measurable bottleneck and the team would need a dedicated CI Supabase project.
- `requireTestEnv()`'s existing fail-fast message is treated as good enough for env-missing failures in CI; only fixture drift gets the special annotation.
- The same hosted Supabase test project is used by CI and local dev. A developer running `npm test` while CI is mid-run can still cause flake — mitigated only by the queue + cookbook awareness, not by separation.

## Success Criteria (Summary)

- A failing test on a PR turns the merge button red and blocks `deploy`.
- A drifted test project surfaces as one GitHub annotation pointing at `tests/fixtures/README.md`, not a buried Vitest stack trace.
- A `git push` on a branch with a broken test is blocked locally; `--no-verify` is the documented escape hatch.
