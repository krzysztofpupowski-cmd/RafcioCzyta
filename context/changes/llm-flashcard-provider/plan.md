# LLM Flashcard Provider (F-02) Implementation Plan

## Overview

Wire an LLM provider into the codebase so that `generateFlashcards()` can be called by S-02 to produce a batch of Zod-validated, DB-persisted draft flashcards matched to a child's reading level. This is a pure foundation slice — no API route, no UI. The single deliverable is a tested, lint-clean service function that S-02 can import.

## Current State Analysis

- `ai` and `@ai-sdk/openai` are **not installed**. `zod` is already at `^4.0.0`.
- `OPENAI_API_KEY` is **not declared** in `astro.config.mjs` `env.schema` and not in `.dev.vars`.
- `src/lib/services/flashcard-generation.ts` does **not exist**.
- Database tables are ready: `flashcard_generations` (child_id, requested_level, model, prompt_version) and `flashcards` (generation_id, child_id, front_text, hint_text, level, status) — both from F-01 migration `20260526143400_reading_domain_schema.sql`. Default `status = 'draft'` is set at the DB layer.
- All patterns that F-02 must follow are established: `children.ts` ESLint-disable template (L-001), `astro:env/server` secret import, `AppSupabase` type, service-receives-supabase-client convention.

### Key Discoveries

- `flashcards.generation_id` is nullable FK to `flashcard_generations.id` (`src/db/database.types.ts:104,118`) — link the batch to the generation row.
- `flashcard_generations` Insert requires only `child_id` + `requested_level`; `model` and `prompt_version` are `string | null` (`src/db/database.types.ts:73–80`).
- The `reading_level` enum order is `letters < syllables < words < simple_sentences` (`supabase/migrations/20260526143400_reading_domain_schema.sql:41–46`). A constant level-rank array in the service is the post-validation guard.
- `AbortSignal.timeout()` is available on `compatibility_date: 2026-05-08` (`wrangler.jsonc:7`), but validate on `npm run dev` (workerd) after wiring — not only in Node.
- The service **never creates its own Supabase client** — it receives `AppSupabase` from the caller, same as `children.ts`.
- The `process.env.OPENAI_API_KEY` pattern in `ai-sdk-notes.md` examples must not be used; use `import { OPENAI_API_KEY } from "astro:env/server"` — same as `SUPABASE_URL` in `src/lib/supabase.ts:3`.
- Null `current_level` ("Nie wiem") is resolved to `'letters'` **in the API route** before calling the service, so the service signature always receives `StoredReadingLevel` (non-null).

## Desired End State

`generateFlashcards(supabase, { childId, requestedLevel })` is importable and returns `{ generation: FlashcardGeneration; cards: Flashcard[] }`:

- Exactly 8 flashcards are requested from `gpt-4o-mini`; any card whose `level` exceeds `requestedLevel` is filtered out in TypeScript after the LLM response.
- A `flashcard_generations` row is inserted with `model = 'openai:gpt-4o-mini'` and `prompt_version = '1'`.
- All surviving cards are inserted into `flashcards` with `status = 'draft'` (DB default) and `generation_id` pointing to the generation row.
- The call completes within the `AbortSignal.timeout(9_500)` budget or throws a readable error.
- `npm run lint` and `npm run build` pass with no new errors.

## What We're NOT Doing

- No API route (`src/pages/api/flashcards/generate.ts`) — that is S-02.
- No UI or dashboard changes — S-02.
- No null-level → 'letters' logic inside the service — the caller (S-02 API route) is responsible.
- No Cloudflare AI Gateway integration — not in MVP scope.
- No Workers AI binding — library-research.md rates this Priority D due to Polish quality uncertainty.
- No streaming — one-shot structured batch only.
- No retry logic beyond what `@ai-sdk/openai` handles internally.

## Implementation Approach

Install the Vercel AI SDK + OpenAI provider, declare the secret, then create the service. Two phases keep the build green at every step: Phase 1 touches only config (packages + env schema, no code that uses them), Phase 2 adds the service file.

The service uses AI SDK 6 structured output (`generateText` with `Output.object({ schema })`) — a single call returning a nested `cards` array, declared alongside a Zod schema in the same file. A small `LEVEL_ORDER` const provides the post-validation rank comparison. Persistence uses two sequential Supabase inserts (generation row → flashcard rows); no transaction is needed because the generation row is created first and the flashcard FK is nullable — orphaned flashcards are visible in the DB but do not corrupt state.

## Critical Implementation Details

**ESLint disable header** — The new service file must open with the L-001 service-module header from `context/foundation/lessons.md`, including `no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-return`, and `no-redundant-type-constituents`. Omitting it will cause lint errors on every `Database`-derived type used in the file.

**`@ai-sdk/openai` provider instantiation** — Use `createOpenAI({ apiKey: OPENAI_API_KEY })` with the `astro:env/server` import, not `process.env`. The `openai` default export reads `process.env.OPENAI_API_KEY` which is not populated in the Cloudflare workerd runtime.

**Zod `.nullable()` not `.optional()`** — `hint_text` must be `z.string().nullable()`. OpenAI structured output rejects `.optional()` fields in some schema configurations (`ai-sdk-notes.md:131–136`).

**AI SDK 6 structured output** — Use `generateText` plus `Output.object({ schema })`, not deprecated `generateObject`. The `npm install ai @ai-sdk/openai` command installs the current AI SDK 6 line, where structured object generation is routed through the `output` setting.

---

## Phase 1: Packages and Env Secret

### Overview

Install `ai` + `@ai-sdk/openai`, declare `OPENAI_API_KEY` in `astro.config.mjs` env schema, and add a placeholder entry to `.env.example`. After this phase the build remains green and no service code references the new packages yet.

### Changes Required

#### 1. Install AI SDK packages

**File**: `package.json` (via `npm install`)

**Intent**: Add `ai` and `@ai-sdk/openai` as runtime dependencies. `zod` is already present at `^4.0.0` — no version change needed.

**Contract**: Run `npm install ai @ai-sdk/openai`. Verify both appear in `dependencies` in `package.json`.

---

#### 2. Declare `OPENAI_API_KEY` in env schema

**File**: `astro.config.mjs`

**Intent**: Register the provider secret as a server-only, secret, optional env field — the same pattern used for `SUPABASE_URL` and `SUPABASE_KEY` at lines 19–20. Marking it `optional: true` keeps CI green when the secret is absent.

**Contract**: Add `OPENAI_API_KEY: envField.string({ context: "server", access: "secret", optional: true })` inside the existing `env.schema` object.

---

#### 3. Document the secret in `.env.example`

**File**: `.env.example`

**Intent**: Give future contributors a template entry so they know to add the key to `.dev.vars` for local development and `wrangler secret put OPENAI_API_KEY` for production.

**Contract**: Add a commented line `# OPENAI_API_KEY=` (or an uncommented empty assignment `OPENAI_API_KEY=`) following the existing Supabase entries in the file.

---

### Success Criteria

#### Automated Verification

- `npm install ai @ai-sdk/openai` exits 0 and both packages appear in `package.json` dependencies
- `npm run build` passes with no new errors (secret is optional so build does not need the key)
- `npm run lint` passes

#### Manual Verification

- `.dev.vars` contains a real `OPENAI_API_KEY` value (added by the implementer; gitignored — no code verification possible)

**Implementation Note**: After Phase 1 automated checks pass and the key is in `.dev.vars`, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Flashcard Generation Service

### Overview

Create `src/lib/services/flashcard-generation.ts` — the Zod schema, level-ordering guard, prompt builder, AI SDK 6 structured-output call, and DB persistence. This is the only file added in this phase.

### Changes Required

#### 1. Create the flashcard generation service

**File**: `src/lib/services/flashcard-generation.ts`

**Intent**: Provide `generateFlashcards(supabase, { childId, requestedLevel })` — the single export S-02 will call. The function calls `gpt-4o-mini` with an AI SDK 6 structured output schema and a Polish early-reading prompt, post-validates the returned cards (filtering any card whose level exceeds `requestedLevel`), inserts a `flashcard_generations` audit row with model and prompt_version set, bulk-inserts all surviving cards as `flashcards` with `generation_id` linked, and returns `{ generation, cards }`.

**Contract**:

File structure (in order):

1. ESLint disable comment block — use the L-001 service-module header from `context/foundation/lessons.md`; must cover `no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-return`, and `no-redundant-type-constituents`.
2. Imports — `createOpenAI` from `@ai-sdk/openai`; `generateText` and `Output` from `ai`; `z` from `zod`; `OPENAI_API_KEY` from `astro:env/server`; `AppSupabase` from `./children`; `Flashcard`, `FlashcardGeneration`, `StoredReadingLevel` from their respective modules.
3. `flashcardBatchSchema` — Zod object with `cards: z.array(z.object({ front_text: z.string(), hint_text: z.string().nullable(), level: z.enum(['letters','syllables','words','simple_sentences']) }))`.
4. `LEVEL_ORDER` — readonly tuple `['letters', 'syllables', 'words', 'simple_sentences']` used for post-validation rank comparison.
5. `buildPrompt(level: StoredReadingLevel): string` — returns a Polish-language prompt that specifies level, requests exactly 8 cards, and names the domain (early reading for children). Prompt instructs the model to match all `level` fields to the requested level.
6. `generateFlashcards(supabase: AppSupabase, input: { childId: string; requestedLevel: StoredReadingLevel }): Promise<{ generation: FlashcardGeneration; cards: Flashcard[] }>` — function body:
   - If `OPENAI_API_KEY` is missing, throw `new Error("OpenAI API key is not configured.")` before creating the provider.
   - Create `createOpenAI({ apiKey: OPENAI_API_KEY })` provider instance.
   - Call `generateText` with `model`, `output: Output.object({ schema: flashcardBatchSchema })`, `prompt: buildPrompt(input.requestedLevel)`, `abortSignal: AbortSignal.timeout(9_500)`.
   - Post-validate: filter `output.cards` keeping only cards where `LEVEL_ORDER.indexOf(card.level) <= LEVEL_ORDER.indexOf(input.requestedLevel)`.
   - Insert one `flashcard_generations` row: `{ child_id: input.childId, requested_level: input.requestedLevel, model: 'openai:gpt-4o-mini', prompt_version: '1' }`. Retrieve the inserted row via `.select().single()`.
   - Bulk insert `flashcards`: map each surviving card to `{ child_id: input.childId, generation_id: generation.id, front_text, hint_text, level }` (status defaults to `'draft'` at DB layer). Retrieve inserted rows via `.select()`.
   - Return `{ generation, cards }`.
   - Error policy:
     - Missing key, LLM, and abort failures throw fixed readable messages that do not expose raw provider error strings to callers.
     - Supabase insert failures follow the existing `children.ts` service convention: throw `new Error(error.message)` after each failed DB call.

---

### Success Criteria

#### Automated Verification

- `npm run lint` passes with no new errors on `src/lib/services/flashcard-generation.ts`
- `npm run build` passes

#### Manual Verification

- With `OPENAI_API_KEY` set in `.dev.vars` and the dev server running (`npm run dev`), call `generateFlashcards` from a temporary test route or a quick Node script with a real `childId` and `requestedLevel = 'words'`; verify: (a) the function returns within 10 s, (b) all returned cards have `level ≤ 'words'`, (c) a `flashcard_generations` row appears in Supabase Studio with `model = 'openai:gpt-4o-mini'`, (d) linked `flashcards` rows appear with `status = 'draft'`
- Verify `AbortSignal.timeout(9_500)` is enforced on the workerd runtime (not just Node): run with `npm run dev`, not `node` directly

**Implementation Note**: After Phase 2 automated checks pass, pause for manual confirmation of the smoke test before marking F-02 complete.

---

## Testing Strategy

### Unit Tests

No automated test runner is configured in this project. Post-validation logic (level-rank filter) can be verified by calling the service with a mocked provider if a test runner is added in a future change.

### Manual Testing Steps

1. Start dev server: `npm run dev` (Cloudflare workerd runtime)
2. Call `generateFlashcards` with `requestedLevel = 'letters'` — verify all returned cards have `level = 'letters'`
3. Call with `requestedLevel = 'words'` — verify no card has `level = 'simple_sentences'`
4. Remove `OPENAI_API_KEY` from `.dev.vars` temporarily — verify a readable error is thrown and not an unhandled `undefined` crash
5. Confirm `AbortSignal.timeout(9_500)` fires correctly by temporarily lowering to `500` ms and verifying an abort error is thrown

## Performance Considerations

`gpt-4o-mini` with 8 cards and a compact Polish prompt targets well under 10 s on typical OpenAI latency. Cap `maxOutputTokens` if latency spikes are observed in production (not needed for MVP). Measure on the Cloudflare preview build — not only on local Node — before marking S-02 done.

## Migration Notes

No new DB migrations required. F-01 tables and enums are fully in place. `prompt_version` starts at `'1'`; increment the constant manually in the service when the prompt copy changes materially.

## References

- Library research: `context/changes/llm-flashcard-provider/library-research.md`
- AI SDK implementation notes: `context/changes/llm-flashcard-provider/ai-sdk-notes.md`
- Codebase compatibility research: `context/changes/llm-flashcard-provider/research.md`
- ESLint disable template: `context/foundation/lessons.md` (L-001 service-module header)
- API route template: `src/pages/api/children.ts`
- Env schema pattern: `astro.config.mjs:17–22`
- Level enum (authoritative): `supabase/migrations/20260526143400_reading_domain_schema.sql:41–46`
- flashcard_generations Insert type: `src/db/database.types.ts:73–80`
- flashcards Insert type: `src/db/database.types.ts:114–127`
- Lessons: `context/foundation/lessons.md` (L-001 — ESLint disable pattern)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Packages and Env Secret

#### Automated

- [x] 1.1 `npm install ai @ai-sdk/openai` exits 0 and both packages appear in `package.json` dependencies — 1cc123f
- [x] 1.2 `npm run build` passes with no new errors — 1cc123f
- [x] 1.3 `npm run lint` passes — 1cc123f

#### Manual

- [x] 1.4 `.dev.vars` contains a real `OPENAI_API_KEY` value — 1cc123f

### Phase 2: Flashcard Generation Service

#### Automated

- [x] 2.1 `npm run lint` passes with no new errors on `src/lib/services/flashcard-generation.ts`
- [x] 2.2 `npm run build` passes

#### Manual

- [x] 2.3 `generateFlashcards` returns within 10 s on `npm run dev` (workerd runtime)
- [x] 2.4 All returned cards have `level ≤ requestedLevel`
- [x] 2.5 `flashcard_generations` row visible in Supabase Studio with `model = 'openai:gpt-4o-mini'`
- [x] 2.6 Linked `flashcards` rows visible with `status = 'draft'`
- [x] 2.7 `AbortSignal.timeout` verified on workerd runtime
