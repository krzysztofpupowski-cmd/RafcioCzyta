# F-02: LLM libraries compatible with the project stack

> Researched 2026-06-01 (Exa web search).  
> Roadmap: F-02 `llm-flashcard-provider` · Stack: `context/foundation/tech-stack.md`  
> Blocks: Open Roadmap Q #2 (provider + child-data policy) · GitHub [#6](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/6), [#4](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/4)

## F-02 in context

**F-02** is the foundation slice that calls an LLM with the child’s reading level and returns a **batch of draft flashcards** matching the domain model (`front_text`, optional `hint_text`, `level`) within the **&lt;10 s** NFR. It unblocks **S-02**.

### Stack constraints

| Constraint                                                          | Source             |
| ------------------------------------------------------------------- | ------------------ |
| TypeScript, Astro 6 SSR API routes                                  | `tech-stack.md`    |
| Deploy: Cloudflare Workers (`@astrojs/cloudflare`, `nodejs_compat`) | `wrangler.jsonc`   |
| Zod for API validation                                              | `AGENTS.md`        |
| AI not in starter — wire provider after bootstrap                   | `tech-stack.md`    |
| Secrets server-only (`astro:env` / Wrangler, like `SUPABASE_*`)     | `astro.config.mjs` |

Favors **fetch-based, edge-safe SDKs** and **JSON Schema / Zod structured output**, invoked only from server routes.

### Target output shape (aligned with `flashcards` table)

```typescript
// Conceptual Zod schema — enum values must match `public.reading_level`
z.object({
  cards: z.array(
    z.object({
      front_text: z.string(),
      hint_text: z.string().nullable(),
      level: z.enum(["letters", "syllables", "words", "simple_sentences"]),
    }),
  ),
});
```

---

## Recommended libraries

### 1. Vercel AI SDK — `ai` + `@ai-sdk/*` (strong default)

| Package               | Role                                                                    |
| --------------------- | ----------------------------------------------------------------------- |
| `ai`                  | `generateText` / `streamText` with `Output.object()` / `Output.array()` |
| `@ai-sdk/openai`      | OpenAI models                                                           |
| `@ai-sdk/anthropic`   | Claude                                                                  |
| `@ai-sdk/google`      | Gemini                                                                  |
| `workers-ai-provider` | Cloudflare Workers AI binding                                           |

**Why it fits F-02**

- Provider-agnostic: swap OpenAI ↔ Anthropic ↔ Gemini without rewriting the flashcard service.
- Structured batches map to flashcards via `Output.array({ element: z.object({ ... }) })`.
- Official Cloudflare path: [Workers AI + AI SDK](https://developers.cloudflare.com/workers-ai/configuration/ai-sdk/), [`workers-ai-provider`](https://github.com/cloudflare/ai/tree/main/packages/workers-ai-provider).
- Matches repo patterns: Zod in API routes, logic in `src/lib/services/`.

**References**

- [Generating structured data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)
- [AI SDK docs](https://ai-sdk.dev/docs/introduction)

**Deploy:** Extend `astro.config.mjs` `env.schema` for provider API keys; call only from `src/pages/api/*` with `prerender = false`.

---

### 2. Direct provider SDKs (single vendor, minimal abstraction)

All document **Cloudflare Workers** as supported (fetch-based; no Node-only `httpAgent`).

| Library       | npm                 | Structured output                                                     | Docs                                                                                                                                                              |
| ------------- | ------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI        | `openai`            | `response_format: { type: "json_schema", ... }`                       | [openai-node](https://github.com/openai/openai-node)                                                                                                              |
| Anthropic     | `@anthropic-ai/sdk` | `messages.parse()` + `zodOutputFormat()` / `jsonSchemaOutputFormat()` | [TS SDK](https://platform.claude.com/docs/en/api/sdks/typescript), [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) |
| Google Gemini | `@google/genai`     | `responseFormat` + Zod (`zod-to-json-schema`)                         | [Structured output](https://ai.google.dev/gemini-api/docs/structured-output)                                                                                      |

**When to pick:** Provider already chosen (Open Roadmap Q #2). Smallest dependency surface; you own retry/timeout for &lt;10 s.

**Caveat:** `@anthropic-ai/vertex-sdk` has had edge-runtime friction; on Workers prefer **direct Anthropic API** (`@anthropic-ai/sdk`), not Vertex, unless you accept extra auth work.

---

### 3. OpenRouter — `@openrouter/sdk`

Single HTTP API over many models (OpenAI-compatible), typed client, `responseFormat: { type: "json_schema", ... }`.

**Why it fits**

- Defers final LLM vendor while unblocking integration work.
- One secret (`OPENROUTER_API_KEY`); model id per environment.
- Works anywhere `fetch` works (Workers).

**Tradeoffs:** Extra vendor; child-data privacy/DPA is OpenRouter + underlying model — relevant for Polish children’s prompts.

**References**

- [TypeScript SDK overview](https://openrouter.ai/docs/client-sdks/typescript/overview)
- [Structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)

---

### 4. Cloudflare Workers AI (platform-native)

| Approach  | API / package                                                |
| --------- | ------------------------------------------------------------ |
| Low-level | `env.AI.run(model, { messages, response_format })`           |
| AI SDK    | `workers-ai-provider` + `generateText` / structured `Output` |

**Why it fits**

- Same host as the app; add `"ai": { "binding": "AI" }` to `wrangler.jsonc`.
- [JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/) (OpenAI-style `response_format`).
- Optional [AI Gateway](https://developers.cloudflare.com/ai-gateway/integrations/aig-workers-ai-binding/) for logging/latency.

**Tradeoffs**

- Polish + pedagogical quality for graded reading may lag frontier models — validate before committing.
- JSON mode: no streaming on Workers AI (acceptable for one-shot batch generation).
- Measure batch latency on Cloudflare preview against &lt;10 s NFR.

---

### 5. Cloudflare AI Gateway (routing layer, not an LLM)

Routes to OpenAI / Anthropic / Workers AI / OpenRouter with observability and caching. Complements any option above; not a substitute for an LLM.

**Reference:** [AI Gateway docs](https://developers.cloudflare.com/ai-gateway/)

---

## Shortlist for this stack

| Priority | Choice                                           | Best for                                                    |
| -------- | ------------------------------------------------ | ----------------------------------------------------------- |
| **A**    | `ai` + one `@ai-sdk/*`                           | Default: structured batch, provider switch, Cloudflare docs |
| **B**    | `@openrouter/sdk`                                | Unblock F-02 before final vendor (Q #2)                     |
| **C**    | `openai` / `@anthropic-ai/sdk` / `@google/genai` | Single vendor, minimal deps after Q #2                      |
| **D**    | `workers-ai-provider` / `env.AI`                 | Lowest ops cost; validate Polish quality + latency          |

**Poor fit for F-02 core path:** browser-only SDKs; heavy LangChain for one structured call; Supabase Studio OpenAI hook (local dev only).

---

## NFR and product constraints

1. **&lt;10 s batch** — Prefer fast models (`gpt-4o-mini`, Claude Haiku, Gemini Flash, Workers `@cf/...-fast`); cap `max_tokens`; one structured call, not N parallel calls.
2. **Child data in prompts** — Prefer vendors with clear data-retention / EU options; avoid logging full prompts in production until policy is set (roadmap blocker).
3. **Polish** — Model choice often matters more than SDK; spike with real `reading_level` prompts.

---

## Suggested decision path

1. Choose **abstraction**: AI SDK (`ai`) vs single SDK vs OpenRouter.
2. Choose **provider** (issue #4 / Open Roadmap Q #2).
3. Spike: level in → Zod-validated `cards[]` out → persist `flashcard_generations` + `flashcards` as `draft`.
4. Measure end-to-end latency on **Cloudflare preview**, not only local Node.

---

## Implementation sketch (library-agnostic)

- Service: `src/lib/services/flashcard-generation.ts` (or similar).
- Route: `POST` under `src/pages/api/`, `export const prerender = false`.
- Secrets: provider key via `astro:env` + `.dev.vars` / Wrangler secrets.
- Persist drafts per F-01 schema; no client-side LLM calls.
