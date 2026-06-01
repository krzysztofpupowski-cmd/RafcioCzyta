# AI Flashcard Generation (S-02) — Plan Brief

> Full plan: `context/changes/ai-flashcard-generation/plan.md`

## What & Why

Wire F-02's `generateFlashcards()` service behind a parent-triggered "Generuj fiszki" button on `/dashboard`. This is the slice where US-01 (_"parent picks level, app generates flashcards"_) finally becomes user-visible — every preceding slice (F-01 schema, F-02 LLM provider, S-01 child profile) has been invisible plumbing.

## Starting Point

F-02 shipped a fully working `generateFlashcards(supabase, { childId, requestedLevel })` service that calls `gpt-4o-mini`, enforces a level guardrail, and persists `flashcard_generations` + `flashcards` (status='draft') with RLS in place. S-01 owns `/dashboard` with a React island child-profile form. There is no UI yet to trigger generation, no API endpoint, and no rendering of drafts.

## Desired End State

A parent with a child profile visits `/dashboard`, sees a new "Generuj fiszki" card below the existing profile card, clicks one button, waits up to 10 seconds with an inline spinner, and sees 8 freshly-generated draft flashcards listed below the button with "oczekuje na akceptację" badges. No accept/reject UI — that is S-03's job. The slice proves the F-02 generator works end-to-end from the parent's perspective.

## Key Decisions Made

| Decision              | Choice                                                                           | Why (1 sentence)                                                                    | Source |
| --------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------ |
| Post-generation UX    | Minimal read-only list of just-generated drafts on `/dashboard`                  | Parent sees concrete output without S-02 stepping on S-03's accept/reject territory | Plan   |
| UI placement          | Second card below the existing child-profile card on `/dashboard`                | Single-page flow, no extra route, mobile-friendly stacking already works            | Plan   |
| API contract style    | JSON `fetch()` endpoint (`POST /api/flashcards/generate`)                        | A 9-second LLM call inside a form-encoded redirect would give zero pending-state UX | Plan   |
| Pending UX            | Disabled button + spinner + "Generuję fiszki... (do 10s)"                        | Reuses the auth-form pattern, sets the 10s expectation, fits the after-hours budget | Plan   |
| Level source          | Always use the child's stored `current_level` (no override form)                 | Single source of truth, the profile is the level; matches PRD's framing             | Plan   |
| NULL-level resolution | API route resolves `current_level = NULL` → `'letters'` (per F-02 plan boundary) | FR-002's "Nie wiem" keeps working end-to-end; F-02 explicitly punted this to S-02   | Plan   |
| Stale-drafts policy   | Allow stacking — new generation creates new rows; old drafts left untouched      | Simplest implementation; S-03 will sort it out with the acceptance UI               | Plan   |
| Concurrency           | Client-side button disable + `AbortController`; no server-side rate limit        | Sufficient at PRD scale (small users, low qps); avoids new schema for a lock        | Plan   |

## Scope

**In scope:**

- New JSON endpoint `POST /api/flashcards/generate` (first JSON endpoint in the codebase).
- DTO layer (`src/lib/dto/flashcards.ts`) keeping `Flashcard`/`Database`-derived types out of the React island per L-001.
- New React island `<FlashcardGenerationCard>` with button, pending state, error banner, and `AbortController` cancellation.
- New read-only `<DraftFlashcardList>` component rendering just-generated cards with level + "oczekuje na akceptację" badges.
- `/dashboard` layout change: wrap the existing inner card in a `flex-col gap-6` container and add the generation card below.
- Service-error → Polish-copy mapping in the API route (timeout, missing API key, upstream LLM failure, DB error).

**Out of scope:**

- Accept/reject UI, draft filtering, dedicated drafts page (S-03).
- Schema changes, new service functions, migrations.
- Level override form (the generation card has no level picker).
- Server-side concurrency lock, rate limits, or queues.
- Background-job / streaming generation.
- Automated tests (no runner configured).
- Middleware changes, env var changes, or edits to existing auth/profile components.

## Architecture / Approach

```
/dashboard.astro (modified)
  └─ wrapper <div class="flex flex-col gap-6">
       ├─ existing child-profile card (S-01, untouched)
       └─ <FlashcardGenerationCard client:load>  [NEW]
            ├─ "Generuj 8 fiszek" button → fetch POST /api/flashcards/generate (JSON)
            │      └─ authn → getMyChild → resolve NULL→'letters' → generateFlashcards()
            │           └─ returns { ok: true, generationId, requestedLevel, cards: [DTO×8] }
            └─ <DraftFlashcardList cards={cards} />  [NEW]
                 └─ read-only list with level + "oczekuje na akceptację" badges
```

Two new components, one new API route, one new DTO module, one Astro page diff. F-02's service and F-01's schema are not touched.

## Phases at a Glance

| Phase                                                       | What it delivers                                                                                         | Key risk                                                                                                                                                                                        |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Backend — JSON API route + DTO layer                     | `POST /api/flashcards/generate` returning JSON; DTO mapper isolating `Flashcard` from the React boundary | Service-error → Polish-copy mapping is string-match-brittle; if F-02's service changes its error strings the mapping silently breaks                                                            |
| 2. Frontend — generation card + drafts list on `/dashboard` | React island with pending/error UX + `AbortController`; read-only drafts list; dashboard wrapper diff    | `useFormStatus()` is form-only — the new button needs an explicit `pending` prop, not a copy-paste of `SubmitButton`; mobile layout must keep the 8-card list scrollable inside the cosmic card |

**Prerequisites:** F-01 (`reading-domain-schema`, done), F-02 (`llm-flashcard-provider`, done), S-01 (`parent-auth-and-reading-level`, done). All three prerequisites already merged per `context/foundation/roadmap.md`.
**Estimated effort:** ~1–2 after-hours sessions across the two phases (Phase 1 ≈ 1 file each for DTO and endpoint; Phase 2 ≈ 2 components plus the small `/dashboard` wrapper diff).

## Open Risks & Assumptions

- **Service-error string matching is brittle.** The API route pattern-matches F-02's English `Error.message` strings to map to Polish copy. If F-02 changes those strings without notifying S-02, the user gets generic fallback copy instead of the targeted message — caught only by manual smoke tests. Mitigation: keep the mapping centralized in the API route file and document the three exact strings in a constant.
- **No server-side concurrency guard.** A determined parent with two tabs can produce two generation rows in parallel. Per Q7 (stacking allowed) this is acceptable, but it means the draft list could grow unboundedly between S-02 and S-03 ships. Mitigation: S-03 must handle a non-empty draft backlog gracefully — flag this for the S-03 plan.
- **The NULL-level UX hint is the only signal that "Litery" was picked.** Parents who picked "Nie wiem" see a small one-liner in the generation card. If they miss it, the generated cards may seem unexpectedly easy. Mitigation: the hint copy _"Litery (najprostszy start)"_ is explicit and matches the FR-002 wording.

## Success Criteria (Summary)

- Parent with a child profile and a valid `OPENAI_API_KEY` can press one button on `/dashboard` and see 8 draft flashcards rendered within 10 seconds, matched to the child's reading level.
- `flashcard_generations` and `flashcards` rows persist in Supabase with the expected `requested_level`, `model = 'openai:gpt-4o-mini'`, and `status = 'draft'`.
- Every error path (no auth, no child, missing key, timeout, upstream LLM failure, DB error) surfaces a Polish-language error banner without crashing the page.
