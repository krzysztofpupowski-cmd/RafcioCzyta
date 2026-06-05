# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-05

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
| 1 | Bootstrap + auth boundary | Install Vitest and prove authn/authz on protected parent APIs | #1, #2 | unit + integration | complete | context/changes/testing-bootstrap-auth-boundary/ |
| 2 | Deck generation & acceptance gates | Level guard, generate timeout/errors, accept/reject state machine | #3, #4, #5, #6 | unit + integration (stub LLM) | complete | context/changes/deck-generation-acceptance-gates/ |
| 3 | Practice + mastery signal | SRS updates and mastery reflect completed practice | #7 | integration | complete | context/changes/testing-practice-mastery-signal/ |
| 4 | CI quality gates | Wire `npm test` into local workflow and CI on PR | cross-cutting | gates | not started | — |

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section must be grounded in local manifests/configs
plus the MCP/tools actually exposed in the current session.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | Vitest | ^3.2.4 | `vitest.config.ts` aliases `@/`, `astro:env/server`, `astro:middleware`; integration hits hosted Supabase test project |
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

Use unit tests when the signal is **pure logic or middleware guards** — no hosted Supabase, no sign-in.

**Where:** `tests/**/*.test.ts` (Vitest picks up via `vitest.config.ts`).

**Prerequisites:** `tests/setup.ts` loads `.env.test` into `process.env`. Astro virtual modules resolve through stubs (`tests/stubs/astro-env-server.ts`, `tests/stubs/astro-middleware.ts`) — do not import production code before setup runs.

**Pattern — env contract smoke** (`tests/smoke/env.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { requireTestEnv } from "../helpers/env";

describe("test environment", () => {
  it("requireTestEnv() returns all required keys when .env.test is configured", () => {
    const env = requireTestEnv();
    expect(env.SUPABASE_URL).toMatch(/^https:\/\//);
    // assert shape of other keys — use primitive matchers, not Database-derived types (L-001)
  });
});
```

**Pattern — middleware without HTTP server** (`tests/middleware/protected-routes.test.ts`):

1. Import the handler (`onRequest` from `@/middleware`) or extracted guard.
2. Build context with `createApiContext({ pathname })` from `tests/helpers/api-context.ts` — defaults `locals.user = null`.
3. Pass a `vi.fn()` as `next`; assert redirect status + `Location`, or that `next` was called.

**When to skip unit:** If the risk requires RLS, cookies, or `getMyChild` against real rows — use §6.2 integration instead.

### 6.2 Adding an integration test

Use integration tests when the signal needs **real Supabase** (RLS, auth cookies, ownership scoping). Tests call extracted handlers in `src/lib/api-handlers/` — not a running Astro preview server.

**Prerequisites:**

1. Dedicated hosted Supabase test project (never production).
2. `.env.test` copied from `.env.test.example`; `requireTestEnv()` fails fast if any key is missing.
3. Migrations + `tests/fixtures/seed.sql` applied manually — see `tests/fixtures/README.md`.

**Pattern — authenticated handler call:**

```ts
import { describe, expect, it } from "vitest";
import { postSomeHandler } from "@/lib/api-handlers/some-post";
import { createApiContext } from "../helpers/api-context";
import { signInAs } from "../helpers/auth-session";

describe("some feature", () => {
  it("Parent A sees only own data", async () => {
    const { cookies, headers, user } = await signInAs("A");

    const context = createApiContext({
      method: "POST",
      pathname: "/api/some/route",
      headers: {
        "Content-Type": "application/json",
        Cookie: headers.get("Cookie") ?? "",
      },
      body: JSON.stringify({ /* valid body for Parent A */ }),
      cookies,
      locals: { user },
    });

    const response = await postSomeHandler(context);
    expect(response.status).toBe(200);
  });
});
```

**Pattern — RLS smoke** (`tests/integration/authz-rls-smoke.test.ts`): after `signInAs("A")`, build Supabase client with `createClient(headers, cookies)` (anon key — RLS applies). Query another parent's row by known UUID from `.env.test`; expect `data: null`, not a service mock.

**Handler extraction rule:** Logic lives in `src/lib/api-handlers/<route>.ts`; `src/pages/api/*` re-exports only. New routes tested in Phase 2+ should follow the same split before adding tests.

**Do not:** mock `@/lib/services/*` or bypass RLS with the service-role key.

### 6.3 Adding an e2e test

**Deferred** for auth boundary — Vitest integration with `signInAs` + handler calls proved risks #1 and #2 without Playwright.

Revisit e2e when a flow needs **browser cookie plumbing** or **SSR page hydration** that handler tests cannot approximate (e.g. full dashboard navigation after sign-in). Prefer `cursor-ide-browser` MCP or Playwright only after integration coverage is insufficient (§1 cost × signal).

### 6.4 Adding a test for a new API endpoint

Every new parent-scoped API should get **at least two cases** copied from the representative matrix shipped in `testing-bootstrap-auth-boundary`:

| Case | Setup | Assert |
|------|-------|--------|
| Unauthenticated | `createApiContext({ ..., locals: { user: null } })` — omit cookies | JSON routes → **401** + `{ ok: false, error: string }`; form POST routes that redirect today → **303** + `Location: .../auth/signin` |
| Cross-parent IDOR (if route accepts child-scoped IDs) | `signInAs("A")` + Parent B UUID from `.env.test` | **404** + stable Polish `error` string (assert message text, not internal constants) |

**Template — unauthenticated** (add beside peers in `tests/integration/authn-protected-apis.test.ts` or a new file):

```ts
it("postFoo returns 401 JSON when logged out", async () => {
  const context = createApiContext({
    method: "POST",
    pathname: "/api/foo",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ /* minimal valid shape */ }),
  });

  const response = await postFooHandler(context);
  const body = (await response.json()) as { ok: boolean; error?: string };

  expect(response.status).toBe(401);
  expect(body.ok).toBe(false);
  expect(body.error).toBeTruthy();
});
```

**Template — cross-parent IDOR** (add to `tests/integration/authz-cross-parent.test.ts` or sibling):

```ts
it("Parent A cannot mutate Parent B resource via postFoo", async () => {
  const env = requireTestEnv();
  const { cookies, headers, user } = await signInAs("A");

  const context = createApiContext({
    method: "POST",
    pathname: "/api/foo",
    headers: {
      "Content-Type": "application/json",
      Cookie: headers.get("Cookie") ?? "",
    },
    body: JSON.stringify({ resourceId: env.TEST_PARENT_B_<RESOURCE>_ID }),
    cookies,
    locals: { user },
  });

  const response = await postFooHandler(context);
  const body = (await response.json()) as { ok: boolean; error?: string };

  expect(response.status).toBe(404);
  expect(body.ok).toBe(false);
  expect(body.error).toBe("<exact Polish message from handler>");
});
```

If the new endpoint introduces a new IDOR vector, add the UUID to `tests/fixtures/seed.sql`, document it in `tests/fixtures/README.md` and `.env.test.example`, and extend `REQUIRED_KEYS` in `tests/helpers/env.ts`.

**Reference matrix (Phase 1):** `postChildren` (303), `postGenerateFlashcards` / `getMasterySummary` / `postPracticeReview` (401), `postAcceptFlashcards` + practice handlers (cross-parent 404).

### 6.5 Adding a test for deck generation / acceptance

Use when writing tests that touch flashcard generation (LLM edge) or the
accept/reject state machine. Two canonical sub-patterns shipped by
`context/changes/deck-generation-acceptance-gates/`.

#### Sub-pattern A — Stubbing the LLM edge

Place the `vi.mock` calls at the **top of the test file** (Vitest hoists
them above imports). Import per-test behaviour from the shared helper:

```ts
// test file top — hoisted above imports by Vitest
vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn(() => ({})) },
}));
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => vi.fn(() => "stub-model")),
}));

// inside a test
import { mockGenerateTextHappy, mockGenerateTextTimeout } from "../helpers/openai-mock";
mockGenerateTextHappy([{ front_text: "A", hint_text: null, level: "letters" }]);
const response = await postGenerateFlashcards(context);
expect(response.status).toBe(200);
```

**Gotchas:**
- **Timeout branch** — stub throws `Object.assign(new Error("aborted"), { name: "TimeoutError" })`. Production checks `err.name`, not the message.
- **Missing API key** — `OPENAI_API_KEY` is captured at module load; use `vi.resetModules()` + `vi.doMock("astro:env/server", () => ({ ..., OPENAI_API_KEY: "" }))` + dynamic `await import("@/lib/api-handlers/flashcards-generate-post")` to pick up the re-mocked binding. Call `vi.resetModules()` + `vi.restoreAllMocks()` in the test teardown.

Full example: `tests/integration/flashcards-generate.test.ts`.

#### Sub-pattern B — Accept/reject state-machine integration

Sign in once in `beforeAll`; reuse the session's Supabase client to verify
DB state after each handler call:

```ts
const response = await postAcceptFlashcards(
  createApiContext({
    method: "POST",
    pathname: "/api/flashcards/accept",
    headers: { Cookie: session.headers.get("Cookie") ?? "" },
    cookies: session.cookies,
    locals: { user: session.user },
    body: JSON.stringify({ generationId: env.TEST_PARENT_A_GENERATION_ID }),
  })
);
expect(response.status).toBe(200);

const { data } = await supabase
  .from("flashcards")
  .select("status, srs_state, next_review_at")
  .eq("generation_id", env.TEST_PARENT_A_GENERATION_ID);
for (const card of data ?? []) {
  expect(card.status).toBe("accepted");
  expect(card.srs_state).not.toBeNull();
  expect(card.next_review_at).not.toBeNull();
}
```

**Queue-gate adversarial trick (risk #4):** insert a `status='draft'` card
with `next_review_at = '2000-01-01T00:00:00Z'` in-test (never in seed.sql),
call `startPracticeSession`, and assert the returned card IDs do not include
the adversarial row (or that `PRACTICE_ERROR_NO_DUE_CARDS` is thrown).
Delete the adversarial row in `afterAll`.

Full example: `tests/integration/flashcards-state-machine.test.ts`.

### 6.6 Adding a test for practice / mastery

Use when writing tests that touch the SRS update path or the mastery
indicator. Two canonical sub-patterns shipped by
`context/changes/testing-practice-mastery-signal/`.

#### Sub-pattern A — Practice-flow integration via handlers

Sign in once in `beforeAll`; build the fixture programmatically (insert
draft cards → accept via `postAcceptFlashcards` → backdate
`next_review_at`); drive `postPracticeStart → postPracticeReview →
postPracticeEnd`; assert directly against the DB after each step.

```ts
// beforeAll: insert generation + draft cards
const { error: genError } = await supabase
  .from("flashcard_generations")
  .insert({ id: genId, child_id: childId, requested_level: "letters" });

// accept to install real SRS state via production handler
await postAcceptFlashcards(makeAcceptContext(genId));

// force all cards due now (ts-fsrs initial step may be "just now" — be explicit)
await supabase
  .from("flashcards")
  .update({ next_review_at: "2000-01-01T00:00:00Z" })
  .eq("generation_id", genId);

// drive the flow
const startRes = await postPracticeStart(makeStartContext());
const { sessionId, cards } = (await startRes.json()) as StartPracticeSuccessResponse;

const reviewRes = await postPracticeReview(
  makeReviewContext({ sessionId, flashcardId: cards[0].id, rating: Rating.Good })
);
expect((await reviewRes.json() as ReviewPracticeSuccessResponse).outcome).toBe("correct");

// assert DB state after review
const { data: card } = await supabase
  .from("flashcards").select("srs_state, reps_count, last_reviewed_at, mastery_score")
  .eq("id", cards[0].id).single();
expect(card!.reps_count).toBeGreaterThanOrEqual(1);

// assert practice_attempts row
const { data: attempts } = await supabase
  .from("practice_attempts").select("outcome")
  .eq("session_id", sessionId).eq("flashcard_id", cards[0].id);
expect(attempts).toHaveLength(1);
expect(attempts![0].outcome).toBe("correct");

// end is idempotent — second call returns same endedAt
const end1 = await postPracticeEnd(makeEndContext(sessionId));
const end2 = await postPracticeEnd(makeEndContext(sessionId));
expect((await end2.json() as EndPracticeSuccessResponse).endedAt)
  .toBe((await end1.json() as EndPracticeSuccessResponse).endedAt); // same timestamp
```

Full example: `tests/integration/practice-flow.test.ts`.

#### Sub-pattern B — Mastery threshold via `buildMasteredSrsState`

Import the helper and install the resulting columns onto an already-accepted
card. The helper throws if ts-fsrs ever stops crossing the 90-point
threshold — so a mysterious mastery-test failure always points to the
helper's own error message, not a silent assertion mismatch.

```ts
import { buildMasteredSrsState } from "../helpers/srs-fixture";

// after inserting + accepting a card:
const fixture = buildMasteredSrsState();
await supabase.from("flashcards").update({
  srs_state: fixture.stored,
  mastery_score: fixture.mastery_score,
  reps_count: fixture.reps_count,
  last_reviewed_at: fixture.last_reviewed_at,
  next_review_at: fixture.next_review_at,
}).eq("id", cardId);

// then call the handler
const res = await getMasterySummaryHandler(makeGetContext());
const { summary } = (await res.json()) as MasterySummarySuccessResponse;
expect(summary).toEqual({ acceptedCount: 1, masteredCount: 1, percentMastered: 100 });
```

**Key notes:**
- Update **all five** SRS columns (`srs_state`, `mastery_score`, `reps_count`, `last_reviewed_at`, `next_review_at`) when installing a fixture — keeps production column invariants intact.
- Null `srs_state` cards are counted in `acceptedCount` but silently skipped in `masteredCount` (per `getMasterySummary` contract). Assert this explicitly when the test covers that edge case.
- Use `beforeEach` to pre-delete accepted cards at the target level before each case — prevents count bleed from earlier test cases in the same file.

Full example: `tests/integration/mastery-summary.test.ts`.

### 6.7 Per-rollout-phase notes

- **Phase 1 — Bootstrap + auth boundary** (shipped 2026-06-03): `context/changes/testing-bootstrap-auth-boundary/`. Vitest + `.env.test` fail-fast; handler extraction for seven representative routes; integration against hosted test project with two-parent seed. Representative unauthenticated matrix: one 303 route (`POST /api/children`), three 401 JSON routes (generate, mastery summary, practice review). Cross-parent IDOR: accept `generationId`, practice `review`/`end` `sessionId`; RLS smoke on `children`. CI test job intentionally deferred to rollout Phase 4 (§3 row 4).
- **Phase 2 — Deck generation & acceptance gates** (shipped 2026-06-04): `context/changes/deck-generation-acceptance-gates/`. LLM stub harness at the `ai`/`@ai-sdk/openai` boundary; level-guard unit + generate-error matrix (happy / timeout / failure / missing-key) + accept-reject state machine with adversarial draft-row exclusion (risk #4). Seed extended with a Parent A draft batch; reject handler extracted to `src/lib/api-handlers/flashcards-reject-post.ts`.
- **Phase 3 — Practice + mastery signal** (shipped 2026-06-05): `context/changes/testing-practice-mastery-signal/`. SRS adapter unit on all four ratings; practice flow integration (start → review×2 → end) with direct `practice_attempts` assertion + review-error matrix + end-idempotency; mastery summary integration with `buildMasteredSrsState` helper landing the ≥90 threshold deterministically. Practice-start handler extracted to `src/lib/api-handlers/practice-start-post.ts`; authn matrix completed with `postPracticeStart` and `postPracticeEnd` 401 cases.

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
