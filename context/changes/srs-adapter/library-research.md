# F-03: SRS libraries compatible with the project stack

> Researched 2026-06-02 (Exa `web_search_exa`).  
> Roadmap: F-03 `srs-adapter` · Stack: `context/foundation/tech-stack.md`  
> Blocks: Open Roadmap Q #1 (SRS library choice) · GitHub [#7](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/7), [#3](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/3)

## F-03 in context

**F-03** is the foundation slice that syncs **accepted flashcards** into a **ready-made spaced-repetition algorithm**, reads review state for **S-04** (practice session) and **S-05** (mastery indicator). PRD Non-Goals exclude building a custom SRS.

### Stack constraints

| Constraint | Source |
| ---------- | ------ |
| TypeScript, Astro 6 SSR API routes | `tech-stack.md` |
| Deploy: Cloudflare Workers (`@astrojs/cloudflare`, workerd runtime) | `wrangler.jsonc`, F-02 smoke test |
| Supabase persistence + RLS | F-01 schema |
| Zod at API boundaries | `AGENTS.md`, existing services |
| Solo / speed MVP — minimal integration surface | `roadmap.md` (`main_goal: speed`) |

Favors **embedded npm libraries** (algorithm in-process, state in Supabase) over external flashcard SaaS APIs unless the product deliberately outsources review UX.

### Existing domain model (SRS-agnostic)

From `20260526143400_reading_domain_schema.sql`:

- `flashcards`: `reps_count`, `last_reviewed_at`, `mastery_score` (0–100)
- `practice_sessions` + `practice_attempts` with binary `correct` / `incorrect` outcomes
- Migration comment: F-03 adapter **normalizes** upstream library ratings (e.g. FSRS 1–4, SM-2 0–5) onto binary outcomes

---

## Category A: Embedded TypeScript libraries (best fit)

These match roadmap unknown: *„gotowa biblioteka FSRS vs zewnętrzne API”*. The adapter stores scheduler state in Supabase and calls the library from API routes.

### FSRS (modern algorithm)

| Library | npm | Edge / CF Workers | Deps | Adoption | Notes |
| ------- | --- | ----------------- | ---- | -------- | ----- |
| **[ts-fsrs](https://www.npmjs.com/package/ts-fsrs)** | `ts-fsrs` | ✅ Pure TS, ESM; runs on workerd | 0 | ~52K/wk | **Default pick.** Official [OSR](https://github.com/open-spaced-repetition/ts-fsrs) package. `repeat()` / `next()`, retrievability for mastery %. Docs suggest Zod validation at boundaries. |
| **[@squeakyrobot/fsrs](https://www.npmjs.com/package/@squeakyrobot/fsrs)** | `@squeakyrobot/fsrs` | ✅ Keywords: `edge-runtime`, `cloudflare-workers` | 0 | ~11/wk | FSRS v4.5 (+ optional v6). `autoRating()` from response time. Less battle-tested than `ts-fsrs`. |
| **[srs-everything](https://github.com/jiangege/srs-everything)** | `srs-everything` | ✅ ESM TypeScript | 0 | Low | FSRS + queue / interleaving / postpone — could help S-04 session logic; broader API than MVP needs. |
| **[@austinshelby/simple-ts-fsrs](https://jsr.io/@austinshelby/simple-ts-fsrs)** | JSR | ✅ Minimal | 0 | Niche | Tiny FSRS; no card concept — app owns persistence (fits existing schema). |

### SM-2 (classic, simpler)

| Library | npm | Edge / CF Workers | Deps | Adoption | Notes |
| ------- | --- | ----------------- | ---- | -------- | ----- |
| **[supermemo](https://www.npmjs.com/package/supermemo)** | `supermemo` | ✅ Zero deps | 0 | ~900/wk | Classic SM-2. Simple `(item, grade) → item`. Easier to map to `reps_count` + `mastery_score`; weaker scheduling vs FSRS. |
| **[@open-spaced-repetition/sm-2](https://www.npmjs.com/package/@open-spaced-repetition/sm-2)** | `@open-spaced-repetition/sm-2` | ✅ TS, JSON-serializable `Card` | 0 | Very low | Same OSR ecosystem as `ts-fsrs`; `Scheduler` + `ReviewLog` map cleanly to Supabase. |
| **[@monkey-dev-vibes/spaced-repetition](https://www.npmjs.com/package/@monkey-dev-vibes/spaced-repetition)** | `@monkey-dev-vibes/spaced-repetition` | ✅ Pure fn, edge-ready | 0 | New | ~95 lines, auditable SM-2; minimal surface area. |

### Related but not for MVP scheduling

| Package | Role | CF Workers? |
| ------- | ---- | ----------- |
| **[@open-spaced-repetition/binding](https://www.npmjs.com/package/@open-spaced-repetition/binding)** | FSRS **parameter training** only | ❌ WASM/WASI not supported on edge (documented) |
| **quanta-fsrs**, **femto-fsrs** | Alternative FSRS impls | Unclear / niche maintenance |

---

## Category B: External SRS APIs (different architecture)

Hosted SRS products — F-03 would become sync-to-third-party + read-back, with extra auth, latency, and UX fragmentation.

| Service | Integration | Fit for RafcioCzyta MVP |
| ------- | ----------- | ----------------------- |
| **[Mochi API](https://mochi.cards/docs/api/)** | REST (cards/decks); Python/TS clients exist | ⚠️ Cards live in Mochi; parent/child stay in app — awkward dual source of truth |
| **Anki Cloud / self-hosted sync** | Sync protocol + REST/MCP | ❌ Heavy; wrong product shape |
| **[adaptcard](https://github.com/fkx816/adaptcard)** | Self-hosted Fastify + SQLite + `ts-fsrs` | ❌ Full LMS engine; overkill vs embedded library |

Given FR-006/007 (practice + mastery **inside the app**) and `speed`, external APIs are a poor default.

---

## Stack compatibility checklist

| Constraint | Embedded FSRS/SM-2 | External API |
| ---------- | ------------------ | -------------- |
| TypeScript / npm | ✅ | ⚠️ HTTP client only |
| Astro API routes on Cloudflare Workers | ✅ Pure TS schedulers | ⚠️ Network + API keys |
| Supabase persistence | ✅ Adapter maps library state → columns / JSON | ⚠️ Dual source of truth |
| Zod at boundaries | ✅ `ts-fsrs` docs recommend it | ✅ |
| Solo / 3-week MVP | ✅ Single dependency | ❌ More integration work |
| Binary outcomes in DB | ✅ Adapter normalizes 4 FSRS ratings | ✅ |

**FSRS → binary outcome mapping (MVP suggestion):** `Again` / `Hard` → `incorrect`; `Good` / `Easy` → `correct` (or stricter: only `Good` / `Easy` = correct).

---

## Shortlist for this stack

| Priority | Choice | Best for |
| -------- | ------ | -------- |
| **A** | `ts-fsrs` | Default: modern FSRS, high adoption, retrievability for S-05, OSR ecosystem |
| **B** | `@squeakyrobot/fsrs` | Explicit Cloudflare Workers positioning; smaller community |
| **C** | `supermemo` or `@open-spaced-repetition/sm-2` | Maximum simplicity; SM-2 maps easily to existing columns |
| **D** | `srs-everything` | If S-04 queue/interleaving logic should live in the library |

**Avoid for F-03 core path:** `@open-spaced-repetition/binding` on Workers (optimizer only); external Mochi/Anki APIs unless deliberately outsourcing review UX.

---

## Likely adapter shape (library-agnostic)

1. **On accept (S-03 hook):** initialize scheduler state per flashcard (e.g. `createEmptyCard()` in `ts-fsrs`).
2. **On review (S-04):** load state → `scheduler.next(card, now, rating)` → persist due date, stability, difficulty; update `reps_count`, `last_reviewed_at`, derive `mastery_score`.
3. **Due queue:** query cards where `next_review_at <= now()` (may need a small migration if FSRS state does not fit current columns).
4. **Mastery (S-05):** aggregate retrievability or interval thresholds across accepted cards.

Service target: `src/lib/services/srs-adapter.ts` (or similar). Routes under `src/pages/api/` with `prerender = false`.

---

## Suggested decision path

1. Choose **algorithm family**: FSRS (`ts-fsrs`) vs SM-2 (`supermemo` / `@open-spaced-repetition/sm-2`).
2. Confirm **persistence shape**: extend `flashcards` vs JSON column for full FSRS card state.
3. Spike on **Cloudflare preview**: accept → initialize → one review → due queue → mastery aggregate.
4. Run `/10x-plan srs-adapter` once Q #1 is locked.

---

## References

- [ts-fsrs](https://www.npmjs.com/package/ts-fsrs) · [docs](https://open-spaced-repetition.github.io/ts-fsrs/)
- [@squeakyrobot/fsrs](https://www.npmjs.com/package/@squeakyrobot/fsrs)
- [supermemo](https://www.npmjs.com/package/supermemo)
- [@open-spaced-repetition/sm-2](https://www.npmjs.com/package/@open-spaced-repetition/sm-2)
- [Mochi API](https://mochi.cards/docs/api/)
