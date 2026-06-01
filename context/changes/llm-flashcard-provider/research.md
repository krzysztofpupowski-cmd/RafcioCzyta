---
date: 2026-06-01T10:34:00+02:00
researcher: AI Agent
git_commit: 784e10637eb292f96c124ef58da341675a53f9f0
branch: main
repository: RafcioCzyta
topic: "Is ai-sdk-notes.md compatible with the codebase for implementing S-02 (ai-flashcard-generation)?"
tags: [research, codebase, llm-flashcard-provider, ai-sdk, cloudflare-workers, s-02, f-02]
status: complete
last_updated: 2026-06-01
last_updated_by: AI Agent
---

# Research: AI SDK Notes Compatibility for F-02 / S-02

**Date**: 2026-06-01T10:34:00+02:00
**Researcher**: AI Agent
**Git Commit**: `784e10637eb292f96c124ef58da341675a53f9f0`
**Branch**: main
**Repository**: RafcioCzyta

## Research Question

Review the codebase and decide whether `context/changes/llm-flashcard-provider/ai-sdk-notes.md` is compatible with it. Goal: implement S-02 (`ai-flashcard-generation`) from `context/foundation/roadmap.md`.

## Summary

**`ai-sdk-notes.md` is fully compatible with the codebase.** Every architectural claim in the notes maps to a real pattern already established in the repo. The Zod schema in the notes is an exact match for the F-01 database schema. Service module patterns, `astro:env` secret wiring, and Cloudflare Workers runtime constraints all align.

Four concrete gaps must be addressed before S-02 can be implemented — none are incompatibilities, all are additive:

1. **Packages not installed** — `ai`, `@ai-sdk/<provider>` (and possibly `zod` sub-imports for v4 compat) need `npm install`.
2. **Provider secret not declared** — `OPENAI_API_KEY` (or equivalent) must be added to `astro.config.mjs` `env.schema` and `.dev.vars` / Wrangler.
3. **`flashcard-generation.ts` service does not exist** — must be created following the `children.ts` template.
4. **No S-02 API route** — `src/pages/api/flashcards/generate.ts` (or similar) does not exist yet.

One **code deviation** to note: the notes use `process.env.OPENAI_API_KEY` in examples, but the project uses `import { OPENAI_API_KEY } from "astro:env/server"`. This is cosmetic — the pattern to follow is the one already in the codebase.

---

## Detailed Findings

### 1. Database schema — Zod schema is an exact match

The Zod schema in `ai-sdk-notes.md` (lines 50–58) defines:

```typescript
z.object({
  cards: z.array(
    z.object({
      front_text: z.string(),
      hint_text: z.string().nullable(),
      level: z.enum(['letters', 'syllables', 'words', 'simple_sentences']),
    }),
  ),
});
```

Each field maps to the F-01 migration and generated types:

| Zod field | DB column | SQL constraint | TS type |
|-----------|-----------|----------------|---------|
| `front_text: z.string()` | `flashcards.front_text` | `text not null` | `string` |
| `hint_text: z.string().nullable()` | `flashcards.hint_text` | `text null` | `string \| null` |
| `level: z.enum([...])` | `flashcards.level` | `reading_level not null` | `"letters" \| "syllables" \| "words" \| "simple_sentences"` |

The four enum values in the Zod schema — `letters`, `syllables`, `words`, `simple_sentences` — are **exactly** the values of the `reading_level` DB enum (migration `supabase/migrations/20260526143400_reading_domain_schema.sql:41–46`, types `src/db/database.types.ts:247`).

The notes' instruction to use `.nullable()` not `.optional()` for OpenAI structured output (`ai-sdk-notes.md:131–136`) is correct and already aligned with the DB schema.

**`flashcard_generations` table** is also in place (`supabase/migrations/20260526143400_reading_domain_schema.sql:92–99`) with the columns F-02 needs: `child_id`, `requested_level`, `model`, `prompt_version`. The service will write here before bulk-inserting `flashcards` rows with `status = 'draft'`.

**`flashcard_status` enum**: `draft | accepted | rejected` — new AI cards should be inserted with `status = 'draft'` (DB default `supabase/migrations/20260526143400_reading_domain_schema.sql:114`).

- `src/db/database.types.ts:100–113` — `flashcards` Row type
- `src/db/database.types.ts:65–80` — `flashcard_generations` Row/Insert types
- `src/types.ts:13–19` — exported aliases

### 2. Secrets and `astro:env` — pattern is established and directly extensible

Secrets are declared in `astro.config.mjs:17–22` using `envField.string({ context: "server", access: "secret", optional: true })`. The F-02 provider key follows the exact same pattern:

```typescript
// astro.config.mjs env.schema addition:
OPENAI_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
```

Runtime consumption via `import { OPENAI_API_KEY } from "astro:env/server"` — same as `SUPABASE_URL` / `SUPABASE_KEY` (`src/lib/supabase.ts:3`).

**Deviation from ai-sdk-notes.md examples**: the notes show `process.env.OPENAI_API_KEY`. In this codebase, use `astro:env/server` instead. The `createOpenAI({ apiKey: OPENAI_API_KEY })` call pattern from the notes is otherwise identical.

**`.dev.vars` / Wrangler**: the key goes in `.dev.vars` for local dev and `wrangler secret put OPENAI_API_KEY` for production — same workflow as Supabase secrets (`.dev.vars:1–2`).

CI (`.github/workflows/ci.yml:23–25`) will need `OPENAI_API_KEY` added as a repo secret if the build step exercises it; for `optional: true` secrets the build succeeds without it.

- `astro.config.mjs:17–22` — env schema
- `src/lib/supabase.ts:3` — `astro:env` import pattern
- `.dev.vars:1–2` — local secrets file (gitignored)

### 3. Service module pattern — children.ts is the canonical template

No `flashcard-generation.ts` exists yet. The notes map F-02 to `src/lib/services/flashcard-generation.ts` (`ai-sdk-notes.md:164`). This aligns with project convention (`AGENTS.md`: services go in `src/lib/services/`).

The canonical template is `src/lib/services/children.ts`:

- **ESLint disable block at the top** (lines 1–7) — required per L-001 because all `Database`-derived types (`Flashcard`, `FlashcardGeneration`, `ReadingLevel`) are error types in the linter. The new service file must replicate this block.
- **`AppSupabase` type** (`SupabaseClient<Database>`) as the supabase parameter type (line 15).
- **Service function** receives `supabase` + typed inputs, throws on error, returns typed result.
- **No direct `createClient()` call inside the service** — the client is always created in the caller (page or API route) and passed in.

```typescript
// src/lib/services/flashcard-generation.ts — required header
// database.types.ts is excluded from ESLint's project service; all Database-derived
// types are error-typed here. See context/foundation/lessons.md L-001.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */
```

- `src/lib/services/children.ts:1–7` — ESLint disable template
- `context/foundation/lessons.md:L-001` — explains why

### 4. API route pattern — children.ts is the canonical template

`src/pages/api/children.ts` is the only non-auth POST API route and the template for S-02's endpoint. The S-02 route must:

1. Export `export const prerender = false` (line 7 in `children.ts`).
2. Read `context.locals.user` for auth; return 401 if null (lines 10–13).
3. Call `createClient(context.request.headers, context.cookies)` — **not** from `context.locals` (the supabase client is not on locals; see `src/middleware.ts:6–16`).
4. Validate request body with Zod (`safeParse`).
5. Call the service function; handle errors with try/catch.

The S-02 route will additionally need to call `getMyChild(supabase, userId)` to read `child.current_level` before calling the generation service.

- `src/pages/api/children.ts` — canonical POST route
- `src/middleware.ts:6–16` — confirms `supabase` is not on `context.locals`
- `src/env.d.ts:1–5` — locals type declaration

### 5. Child level data flow for S-02

`children.current_level` is `ReadingLevel | null` in the DB:

- `src/db/database.types.ts:40` — `current_level: reading_level | null`
- `src/types.ts:9` — `Child` alias

`null` means "Nie wiem" (parent chose "don't know"). The migration comment at `supabase/migrations/20260526143400_reading_domain_schema.sql:80` and the roadmap risk note (S-02: "guardrail PRD — materiał nie powyżej poziomu") both indicate the generation should default to `letters` when `current_level` is null.

S-02 must enforce the roadmap business rule: **generated cards must not have a `level` above `child.current_level`**. The notes state this explicitly (`ai-sdk-notes.md:167`): re-validate `level` on each card in TypeScript, not only in the prompt. The service should use `StoredReadingLevel` (from `src/lib/reading-level-form.ts:6`) which excludes the "unknown" sentinel.

The dashboard currently shows only a child-profile form — no flashcard generation UI exists (`src/pages/dashboard.astro:39–68`). S-02 will add a new page or extend dashboard with a "generate" trigger.

- `src/lib/reading-level-form.ts:1–7` — `StoredReadingLevel` type and form values
- `src/lib/schemas/child.ts:24–28` — `toCurrentLevel()` converts "unknown" → null
- `src/pages/dashboard.astro:13–34` — how child data is loaded today

### 6. Cloudflare Workers runtime — compatible

| Concern | Finding |
|---------|---------|
| `nodejs_compat` | Enabled (`wrangler.jsonc:7`) — broadens Node API surface |
| `compatibility_date` | `2026-05-08` — very recent; standard Web APIs including `AbortSignal.timeout()` available |
| AI SDK fetch path | `ai` + `@ai-sdk/openai` are fetch-based — no Node-specific networking required |
| `AbortSignal.timeout(9_500)` | Should work on this runtime date; validate in `npm run dev` after wiring |
| Workers AI binding | **Not configured** — only needed if using `workers-ai-provider`; not required for external providers |
| `zod` | Already installed (`package.json`: `"zod": "^4.0.0"`) |
| `ai`, `@ai-sdk/*` | **Not installed** — additive step, no removal or version conflict |

- `wrangler.jsonc:1–25` — full Workers config
- `astro.config.mjs:10–23` — adapter config (default `cloudflare()`, no overrides needed)
- `package.json:14–36` — current dependency set

---

## Code References

- `supabase/migrations/20260526143400_reading_domain_schema.sql:41–46` — `reading_level` enum (authoritative)
- `supabase/migrations/20260526143400_reading_domain_schema.sql:92–99` — `flashcard_generations` table
- `supabase/migrations/20260526143400_reading_domain_schema.sql:107–126` — `flashcards` table
- `src/db/database.types.ts:65–80` — `flashcard_generations` Row/Insert types
- `src/db/database.types.ts:100–113` — `flashcards` Row type
- `src/db/database.types.ts:244–248` — all F-01 enum unions
- `src/types.ts:5–19` — exported type aliases
- `src/lib/services/children.ts:1–7` — ESLint disable template (L-001 pattern)
- `src/lib/services/children.ts:15` — `AppSupabase` type
- `src/pages/api/children.ts` — canonical POST API route
- `src/middleware.ts:6–16` — middleware: `user` on locals, not `supabase`
- `src/env.d.ts:1–5` — locals type declaration
- `astro.config.mjs:17–22` — `env.schema` for secrets
- `src/lib/supabase.ts:3` — `astro:env/server` import pattern
- `src/lib/reading-level-form.ts:1–7` — `StoredReadingLevel`, `ReadingLevelFormValue`
- `src/pages/dashboard.astro:13–34` — child data load (template for S-02 auth pattern)
- `wrangler.jsonc:7` — `nodejs_compat` flag
- `context/foundation/lessons.md:L-001` — ESLint disable rule for service modules

---

## Architecture Insights

**Layer mapping from ai-sdk-notes.md is correct and maps cleanly to repo conventions:**

| Layer | File | Convention fit |
|-------|------|---------------|
| F-02 provider/service | `src/lib/services/flashcard-generation.ts` | `src/lib/services/` pattern ✅ |
| S-02 API route | `src/pages/api/flashcards/generate.ts` (suggested) | `src/pages/api/` + `prerender = false` ✅ |
| Schema | Zod in service file | Already in codebase (children schema in `src/lib/schemas/child.ts`) ✅ |
| Secrets | `astro:env/server` | Established pattern ✅ |

**Option A (`generateObject` with nested `cards` array) is the recommended approach** — it maps to a single Zod object that can be declared alongside the service, and aligns with "validate input with Zod" in `AGENTS.md`.

**The `AbortSignal.timeout(9_500)` pattern** from `ai-sdk-notes.md:150–153` is the correct way to enforce the <10s NFR on Cloudflare Workers — do not use `setTimeout` + race; use the native signal.

**ESLint rule for the new service file** (L-001): the file-wide `/* eslint-disable */` block must include `no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-return`, and `no-redundant-type-constituents`. The `children.ts` template at lines 1–7 is the exact pattern to copy.

---

## Historical Context (from prior changes)

- `context/changes/reading-domain-schema/` — F-01 completed 2026-05-27: all 5 tables, 3 enums, 20 RLS policies. `impl-review.md` confirmed F1/F2/F3 issues fixed. Flashcard types are stable — no pending migrations affect F-02.
- `context/changes/parent-auth-and-reading-level/` — S-01 completed 2026-05-28: `POST /api/children`, child profile upsert, `current_level` storing `null` for "Nie wiem". The child's level is in DB; S-02 route reads it via `getMyChild()`.
- `context/changes/llm-flashcard-provider/library-research.md` — recommends Vercel AI SDK (`ai` + `@ai-sdk/*`) as Priority A for this stack; confirms Workers AI is Priority D (quality caveat for Polish graded reading).

---

## Related Research

- `context/changes/llm-flashcard-provider/library-research.md` — stack-compatible library options and decision path
- `context/changes/llm-flashcard-provider/ai-sdk-notes.md` — AI SDK 6 structured-batch implementation notes (subject of this research)

---

## Open Questions

1. **Which LLM provider?** — Open Roadmap Q #2 (GitHub #4). Unresolved; blocks F-02 from being production-ready. For implementation, either pick a provider or use OpenRouter to defer the decision.
2. **`AbortSignal.timeout()` on workerd** — Verify with `npm run dev` after installing `ai`. Compatible date is set but runtime validation is still recommended before committing the pattern.
3. **`null` level → `letters` rule placement** — Confirm whether to default in the API route before calling the service, or inside the service itself. Recommend: API route maps `null → 'letters'` explicitly so the service always receives a non-null `StoredReadingLevel`.
4. **`model` and `prompt_version` columns on `flashcard_generations`** — The notes do not address these nullable audit columns. Decide whether F-02 should populate them (recommended: yes — record model id and prompt version for quality tracking).
5. **S-02 UI** — Dashboard has no generation UI. S-02 scope includes a "generate batch" trigger; whether it lives on `/dashboard` or a new page is not decided yet.
