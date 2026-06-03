# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-03

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in
   auth/deck management" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/migrations/`.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|--------------------------------|
| 1 | A logged-in parent reads or mutates another family's child profile, flashcards, or practice history | High | Medium | interview Q1; PRD §Access Control; tech-stack `has_auth: true` |
| 2 | An unauthenticated caller reaches protected dashboard routes or parent-only APIs | High | Medium | interview Q1; PRD FR-001; AGENTS.md PROTECTED_ROUTES rule |
| 3 | AI-generated flashcard batches routinely exceed the child's reading level, breaking the PRD guardrail and eroding parent trust | High | High | interview Q3; PRD §Guardrails, FR-003; hot-spot dir `src/lib/` (25 touches/30d); roadmap S-02 risk note |
| 4 | Draft or rejected flashcards appear in practice / SRS queues — only parent-accepted material should be exercisable | High | Medium | PRD §Business Logic, FR-004, FR-006; roadmap S-03 outcome |
| 5 | After batch accept/reject, deck lists are wrong — cards vanish, stay in the wrong tab, or don't match what the parent decided | Medium | High | interview Q3; hot-spot dirs `src/lib/`, `src/components/` (25–27 touches/30d); roadmap S-03 |
| 6 | Flashcard generation fails or stalls without a clear error — parent waits past the <10 s NFR with no usable feedback | Medium | Medium | PRD NFR (generacja <10 s); roadmap F-02; hot-spot dir `src/pages/` (28 touches/30d) |
| 7 | Completing a practice session doesn't advance SRS state or the mastery indicator the parent sees on dashboard | Medium | Medium | PRD FR-006, FR-007; roadmap S-04, S-05; hot-spot dir `src/components/` (27 touches/30d) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Parent A cannot read/write Parent B's child, flashcards, or sessions via API or direct DB policy | "Supabase RLS exists" ≠ every query path is scoped | RLS policies per table; service-layer filters; API param ownership checks | Integration (API + in-memory Supabase or policy unit tests) | Mocking away the DB so RLS never runs |
| #2 | Unauthenticated request to protected route/API gets redirect or 401, never 200 with data | Middleware list completeness implies all parent routes covered | PROTECTED_ROUTES set; middleware + API auth helpers; cookie/session shape | Integration on representative protected endpoints | Testing only the sign-in page, not API routes |
| #3 | Generated batch respects selected level / safe-start; egregiously above-level content is rejected by validation | Prompt text alone enforces level — server must validate before persist | Level enum/null semantics; Zod schema bounds; prompt + post-parse validation | Unit on validation + integration on generate endpoint with stubbed LLM | Oracle copied from production prompt/parser |
| #4 | Cards in draft/rejected state never enter due queue or SRS init | Accept flow "worked once" in manual test | Status enum transitions; acceptBatch vs reject paths; SRS init trigger | Integration state-machine test | Only testing accept happy path |
| #5 | After accept/reject, list endpoints and UI-facing DTOs reflect exact parent decisions | Optimistic UI hides server drift | Batch IDs; tab filters; SSR hydration vs client state | Integration + one focused component test if needed | Snapshot of entire dashboard |
| #6 | Slow/failed generation returns Polish error within timeout budget, no orphan drafts | 200 with empty body means "success" | AbortSignal timeout; error translation; partial persist | Integration with mocked slow/failing LLM | Real OpenAI calls in CI |
| #7 | Review rating updates SRS fields; mastery summary moves after session | Final HTTP 200 without checking persisted SRS/mastery | FSRS adapter contract; session end hook; mastery threshold rule | Integration on practice review → DB state | Asserting UI text mirrored from component state |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Bootstrap + auth boundary | Install Vitest and prove authn/authz on protected parent APIs | #1, #2 | unit + integration | change opened | context/changes/testing-bootstrap-auth-boundary/ |
| 2 | Deck generation & acceptance gates | Level guard, generate timeout/errors, accept/reject state machine | #3, #4, #5, #6 | unit + integration (stub LLM) | not started | — |
| 3 | Practice + mastery signal | SRS updates and mastery reflect completed practice | #7 | integration | not started | — |
| 4 | CI quality gates | Wire `npm test` into local workflow and CI on PR | cross-cutting | gates | not started | — |

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section must be grounded in local manifests/configs
plus the MCP/tools actually exposed in the current session.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | Vitest | TBD in Phase 1 | none yet — see §3 Phase 1; Astro SSR + API route testing via Vitest |
| API mocking | vi.mock / MSW | TBD | Stub OpenAI edge in Phase 2; never mock internal service modules |
| e2e | Playwright | optional | defer unless integration cannot catch auth cookie + route crossing |
| accessibility | axe-core | optional | not in initial rollout — dashboard a11y covered by ESLint jsx-a11y today |
| (optional) AI-native | Playwright MCP — checked: 2026-06-03 | n/a | browser MCP available; use only when deterministic tests miss visual/auth-cookie signal |

**Stack grounding tools (current session):**
- Docs: Context7 MCP — available for Vitest/Astro/Supabase testing APIs during planning; checked: 2026-06-03
- Search: Exa MCP — available for tool comparison and current framework status; checked: 2026-06-03
- Runtime/browser: cursor-ide-browser MCP — possible e2e layer if integration insufficient; not used in strategy; checked: 2026-06-03
- Provider/platform: GitHub (CI workflows) + Supabase/Cloudflare via manifests — quality-gate wiring in §3 Phase 4; checked: 2026-06-03

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local + CI | required | syntactic / type drift |
| unit + integration | local + CI | required after §3 Phase 4 | logic regressions, auth/deck/practice failures |
| e2e on critical flows | CI on PR | planned | defer until integration coverage proves insufficient |
| post-edit hook | local (agent loop) | planned | not in initial rollout |
| visual diff (deterministic) | CI on PR | optional | not planned for MVP dashboard |
| multimodal visual review | CI on PR | optional | not planned |
| pre-prod smoke | between merge + prod | optional | manual smoke acceptable per AGENTS.md today |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test

TBD — see §3 Phase 1 for validation and auth-helper unit patterns.

### 6.2 Adding an integration test

TBD — see §3 Phase 1 for protected API + ownership integration pattern.

### 6.3 Adding an e2e test

TBD — see §3 Phase 1 (likely deferred; integration preferred for auth boundary).

### 6.4 Adding a test for a new API endpoint

TBD — see §3 Phase 1 for unauthenticated 401 and cross-parent IDOR pattern.

### 6.5 Adding a test for deck generation / acceptance

TBD — see §3 Phase 2 for level-guard and accept/reject state-machine patterns.

### 6.6 Per-rollout-phase notes

_(Empty — fills in as phases ship.)_

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **No explicit exclusions captured** — Phase 2 Q5 was skipped. Re-evaluate
  during `--refresh` or when test budget feels misallocated. (Source: Phase 2
  interview Q5 skipped.)
- **Real OpenAI calls in CI** — generation tests must stub the LLM edge;
  live keys and latency make CI flaky. (Source: cost × signal principle §1.)
- **Docker / Supabase CLI lifecycle** — agent shell cannot run long-running
  local Supabase on Windows; integration tests should not depend on `supabase
  start` in CI without an explicit infra phase. (Source: AGENTS.md hard rule.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-03
- Stack versions last verified: 2026-06-03
- AI-native tool references last verified: 2026-06-03

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
