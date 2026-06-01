# Vercel AI SDK notes for F-02 / S-02

> Researched 2026-06-01 via Context7 (`/vercel/ai/ai_6.0.0-beta.128`).  
> Roadmap: F-02 `llm-flashcard-provider` · S-02 `ai-flashcard-generation`  
> Complements: `library-research.md` (stack options) · S-02 outcome in `context/foundation/roadmap.md`

Context7 library ID used: `/vercel/ai/ai_6.0.0-beta.128` (AI SDK 6 beta; aligns with [ai-sdk.dev](https://ai-sdk.dev/docs/introduction)). The repo does not install `ai` yet.

---

## Install & providers

```bash
npm install ai zod
npm install @ai-sdk/openai   # and/or @ai-sdk/anthropic @ai-sdk/google
```

Providers read API keys from env by default (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.). Custom instances work for Wrangler / `astro:env`:

```typescript
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY, // or import from astro:env/server
});
```

Registry pattern if you want one service module and multiple vendors:

```typescript
import { anthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createProviderRegistry } from 'ai';

export const registry = createProviderRegistry({
  anthropic,
  openai: createOpenAI({ apiKey: process.env.OPENAI_API_KEY }),
});
```

**Docs:** [Providers](https://ai-sdk.dev/docs/foundations/providers) · [OpenAI](https://ai-sdk.dev/docs/ai-sdk-providers/openai) · [Anthropic](https://ai-sdk.dev/docs/ai-sdk-providers/anthropic)

---

## Structured batch (core of F-02 / S-02)

Target shape (aligned with `flashcards` table and `library-research.md`):

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

### Option A — `generateObject` with nested `cards` (recommended)

Single call, one Zod object, fits Astro API + service layer:

```typescript
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const flashcardBatchSchema = z.object({
  cards: z.array(
    z.object({
      front_text: z.string(),
      hint_text: z.string().nullable(),
      level: z.enum(['letters', 'syllables', 'words', 'simple_sentences']),
    }),
  ),
});

const { object } = await generateObject({
  model: openai('gpt-4o-mini'), // fast model for <10s NFR
  schema: flashcardBatchSchema,
  prompt: buildPrompt(childReadingLevel), // S-02: level guardrails in prompt + validation
});

// object.cards → persist as draft flashcards
```

### Option B — `generateObject` with `output: 'array'`

When you want the model to return a **top-level array** (no `cards` wrapper):

```typescript
import { generateObject } from 'ai';
import { z } from 'zod';

const cardSchema = z.object({
  front_text: z.string(),
  hint_text: z.string().nullable(),
  level: z.enum(['letters', 'syllables', 'words', 'simple_sentences']),
});

const { object: cards } = await generateObject({
  model: openai('gpt-4o-mini'),
  output: 'array',
  schema: cardSchema,
  prompt: 'Generate 8 Polish reading flashcards for level: words. ...',
});
```

### Option C — `generateText` + `Output.object()` (AI SDK 6 style)

Same schema validation via `output`:

```typescript
import { generateText, Output } from 'ai';

const { output } = await generateText({
  model: openai('gpt-4o-mini'),
  output: Output.object({ schema: flashcardBatchSchema }),
  prompt: buildPrompt(childReadingLevel),
});
```

**Docs:** [Generating structured data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) · [`generateObject` reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-object)

---

## Zod rules (important for OpenAI structured output)

With `generateObject` + OpenAI, use **`.nullable()`**, not `.optional()` / `.nullish()`:

```typescript
hint_text: z.string().nullable(), // ✅
// hint_text: z.string().optional(), // ❌ can break JSON Schema
```

**Doc:** [Troubleshooting: no object generated / content filter](https://ai-sdk.dev/docs/troubleshooting/no-object-generated-content-filter)

---

## &lt;10 s NFR: timeout + model choice

Enforce the roadmap NFR on the **server** call (F-02 service, invoked from S-02 API):

```typescript
const result = await generateObject({
  model: openai('gpt-4o-mini'),
  schema: flashcardBatchSchema,
  prompt: buildPrompt(childReadingLevel),
  abortSignal: AbortSignal.timeout(9_500), // leave margin before 10s UX limit
  // maxOutputTokens if needed to cap latency/cost
});
```

Same pattern exists for `generateText` ([settings / abortSignal](https://ai-sdk.dev/docs/ai-sdk-core/settings)).

---

## How this maps to S-02 in the repo

| Layer | Responsibility | AI SDK usage |
|--------|----------------|--------------|
| **F-02** `llm-flashcard-provider` | Provider + `generateObject` + Zod + prompt with reading level | `src/lib/services/flashcard-generation.ts` |
| **S-02** `ai-flashcard-generation` | `POST` API, auth, child level from DB, persist drafts, parent UI | Call service only from `src/pages/api/*`, `prerender = false` |

S-02 outcome (FR-003): parent generates a batch matched to **selected reading level** — pass `child.current_level` into the prompt and **re-validate** `level` on each card against allowed enum + PRD guardrail (“not above child level”) in TypeScript, not only in the prompt.

---

## Cloudflare Workers (stack note)

Context7 queries on `/vercel/ai` did not return Workers-specific pages in the top hits; see `library-research.md` for:

- [Workers AI + AI SDK](https://developers.cloudflare.com/workers-ai/configuration/ai-sdk/)
- [`workers-ai-provider`](https://github.com/cloudflare/ai/tree/main/packages/workers-ai-provider)

Pattern is the same `generateObject` / `generateText`, with a Workers AI model from that provider instead of `@ai-sdk/openai`.

---

## Suggested reading order for implementation

1. [Introduction](https://ai-sdk.dev/docs/introduction)
2. [Generating structured data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)
3. [Settings](https://ai-sdk.dev/docs/ai-sdk-core/settings) (`abortSignal`, tokens)
4. Provider page for chosen vendor (OpenAI / Anthropic / [OpenRouter provider](https://github.com/openrouterteam/ai-sdk-provider))
5. `library-research.md` in this folder for env secrets + Cloudflare

---

## Version note

Context7 served **AI SDK 6 beta** snippets (`Output.object`, `generateText` + `output`). For stable APIs, use Context7 library ID `/vercel/ai/ai_5_0_0`; v5 leans more on `generateObject` without the `Output` helper namespace.
