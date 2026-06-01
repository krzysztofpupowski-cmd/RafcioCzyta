# LLM Flashcard Provider (F-02) — Plan Brief

> Full plan: `context/changes/llm-flashcard-provider/plan.md`
> Research: `context/changes/llm-flashcard-provider/research.md`
> Library research: `context/changes/llm-flashcard-provider/library-research.md`
> AI SDK notes: `context/changes/llm-flashcard-provider/ai-sdk-notes.md`

## What & Why

F-02 wires an LLM provider so the codebase can generate structured flashcard batches matched to a child's reading level. Without this foundation layer, S-02 (the user-facing generation flow) cannot start. The deliverable is a single importable service function — no API route, no UI.

## Starting Point

F-01 is complete: `flashcard_generations` and `flashcards` tables exist with the correct schema, RLS policies, and type aliases in `src/types.ts`. The `children.ts` service is the template for all ESLint and dependency-injection conventions. Neither `ai` nor `@ai-sdk/openai` is installed; no provider secret is declared.

## Desired End State

`generateFlashcards(supabase, { childId, requestedLevel })` is callable from S-02's API route. It returns 8 Zod-validated draft flashcards (all at or below the requested reading level), a linked `flashcard_generations` audit row with `model = 'openai:gpt-4o-mini'` and `prompt_version = '1'`, and completes within the 10 s NFR enforced by `AbortSignal.timeout(9_500)`.

## Key Decisions Made

| Decision                    | Choice                                                                     | Why (1 sentence)                                                                             | Source          |
| --------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------- |
| LLM provider                | OpenAI `gpt-4o-mini` via `@ai-sdk/openai`                                  | Best Polish quality, structured-output path well-tested on Cloudflare Workers                | Plan            |
| Service boundary            | Service generates AND persists                                             | Keeps S-02 API route thin; one function call gives auth route everything it needs            | Plan            |
| null current_level handling | API route maps `null → 'letters'` before calling service                   | Service always receives `StoredReadingLevel` — cleaner signature; research.md recommendation | Research        |
| Post-validation guardrail   | TypeScript filters cards exceeding `requestedLevel` after `generateObject` | PRD business rule "not above child level" must be enforced in code, not only in prompt       | Research / Plan |
| Audit columns               | Populate `model` and `prompt_version`                                      | Zero extra cost; enables quality traceability from day one                                   | Plan            |
| Batch size                  | 8 cards per call                                                           | Enough review variety without risking the 10 s NFR                                           | Plan            |
| Env secret pattern          | `astro:env/server` import (not `process.env`)                              | Matches established codebase pattern; `process.env` is not populated on workerd              | Research        |

## Scope

**In scope:**

- `npm install ai @ai-sdk/openai`
- `OPENAI_API_KEY` declared in `astro.config.mjs` env.schema + `.env.example`
- `src/lib/services/flashcard-generation.ts` — Zod schema, level-rank guard, `generateFlashcards()` with DB persistence

**Out of scope:**

- API route (`src/pages/api/flashcards/generate.ts`) — S-02
- UI / dashboard changes — S-02
- null-level → 'letters' conversion — S-02 API route
- Cloudflare AI Gateway, Workers AI binding, retry logic, streaming

## Architecture / Approach

The service file follows the `children.ts` template exactly: ESLint disable header (L-001), `AppSupabase` parameter type, no internal `createClient()`. It imports `createOpenAI` with the `astro:env/server` key, declares a `flashcardBatchSchema` Zod object, and calls `generateObject` with `AbortSignal.timeout(9_500)`. A small `LEVEL_ORDER` constant enables the post-validation rank comparison. Persistence is two sequential Supabase inserts: generation row first (retrieves `id`), then flashcard rows with `generation_id` linked.

## Phases at a Glance

| Phase                           | What it delivers                                                                | Key risk                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1. Packages + env secret        | `ai` + `@ai-sdk/openai` installed; `OPENAI_API_KEY` declared; build stays green | None significant — secret is `optional: true` so CI passes without it                                       |
| 2. Flashcard generation service | `generateFlashcards()` callable, lint-clean, DB-persisting, sub-10s on workerd  | `AbortSignal.timeout()` behaviour on `compatibility_date: 2026-05-08` — validate on `npm run dev`, not Node |

**Prerequisites:** F-01 complete (done 2026-05-27). User adds real `OPENAI_API_KEY` to `.dev.vars` before Phase 2 manual verification.  
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- `AbortSignal.timeout(9_500)` is expected to work on `compatibility_date: 2026-05-08` but has not been runtime-validated yet on this project — validate in Phase 2 manual testing.
- Polish graded-reading prompt quality is unvalidated with real children's content; a bad prompt may yield low card acceptance in S-03. The `prompt_version` audit column is specifically for iterating on this.
- `OPENAI_API_KEY` data-retention / EU settings should be reviewed before production use with real child prompts (Open Roadmap Q #2 data-policy aspect).

## Success Criteria (Summary)

- `npm run lint` and `npm run build` pass with no new errors after both phases.
- `generateFlashcards` called with `requestedLevel = 'words'` returns `{ generation, cards }` where all cards have `level ≤ 'words'`, the generation row records `model = 'openai:gpt-4o-mini'`, and the call completes under 10 s on the Cloudflare workerd dev server.
- F-02 is marked done in the roadmap and S-02 is unblocked.
