# AI Flashcard Generation (S-02) Implementation Plan

## Overview

Wire F-02's `generateFlashcards()` service behind a parent-triggered "Generuj fiszki" button on `/dashboard`. The slice's deliverable: a parent with a child profile can press one button and see 8 freshly-generated draft flashcards listed on the dashboard, pending acceptance (which S-03 will own). No schema changes, no new service function — pure API route + UI work.

## Current State Analysis

- **F-02 shipped the service.** `generateFlashcards(supabase, { childId, requestedLevel })` in `src/lib/services/flashcard-generation.ts:43-109` calls `gpt-4o-mini` with `AbortSignal.timeout(9_500)`, post-filters by `LEVEL_ORDER`, inserts a `flashcard_generations` row, bulk-inserts 8 `flashcards` rows (status defaults to `'draft'` at the DB layer), and returns `{ generation, cards }`. **S-02 does not modify its generation/persistence behavior.**
- **F-02 explicitly punted "null level → letters" resolution to S-02.** Per `context/changes/llm-flashcard-provider/plan.md` §"Key Discoveries", the service signature requires `StoredReadingLevel` (non-null); the API route is the layer that resolves `current_level = NULL` (FR-002 "Nie wiem") to `'letters'`.
- **S-01 owns `/dashboard`.** `src/pages/dashboard.astro:1-69` renders the parent's email, a sign-out form, and the `<ChildProfileForm client:load>` React island in a single cosmic-themed card. Primitives `userId`, `childDisplayName`, `childLevel` are extracted in the frontmatter per Lesson L-001.
- **S-01 established the API conventions.** `src/pages/api/children.ts` is form-encoded redirect-style: read `context.locals.user` → `context.redirect("/auth/signin", 303)` on no user, build supabase via `createClient(headers, cookies)`, parse with `zod.safeParse`, redirect to `/dashboard?error=...` on failure, redirect to `/dashboard` on success. **The 9-second LLM call does not fit this style** — a full page reload after a 9s blank wait gives no inline pending UX. S-02 introduces the first JSON `fetch()` endpoint.
- **L-001 is fully internalized.** Service modules use the canonical disable header (`src/lib/services/children.ts:1-7`). Astro pages extract primitives from `Child` before passing them to React (`src/pages/dashboard.astro:23-29`). React components accept primitives (`src/components/child/ChildProfileForm.tsx:9-13`).
- **`SubmitButton` uses `useFormStatus()`** (`src/components/auth/SubmitButton.tsx:12`) — form-only. The generation card needs its own button with explicit `pending` state.
- **Agent shell limits** (per CLAUDE.md / AGENTS.md): the agent cannot run `npx supabase` or `npm run dev`. Verification is `npm run lint`, `npm run build`, and manual user testing. Smoke-testing the JSON endpoint requires the user to run `npm run dev` in their own terminal.

## Desired End State

After this plan lands and the user runs `npm run dev` against a local Supabase with `OPENAI_API_KEY` set:

- An authenticated parent with a child profile visits `/dashboard` and sees a second card below the child-profile card titled "Generuj fiszki", showing the level that will be used (e.g. _"Poziom: Sylaby"_ or _"Poziom: Litery (najprostszy start)"_ if the child's level is `NULL`) and a primary button "Generuj 8 fiszek".
- Clicking the button disables it, shows an inline spinner and "Generuję fiszki... (do 10s)", and issues `POST /api/flashcards/generate` (JSON body `{}`, JSON response).
- On success (≤10s), the button re-enables, the spinner clears, and 8 freshly-generated draft cards appear in a read-only list under the button — each showing `front_text`, optional `hint_text`, the `level` badge, and a static "oczekuje na akceptację" indicator. No accept/reject buttons (S-03 owns those).
- On failure (timeout, missing API key, OpenAI quota error, DB error), the button re-enables and a Polish-language error banner renders above the button via `<ServerError>`. The parent can immediately try again.
- A parent with **no child profile** sees the generation card with the button disabled and a hint: _"Najpierw utwórz profil dziecka powyżej, aby wygenerować fiszki."_
- An unauthenticated request to `POST /api/flashcards/generate` returns `401` JSON `{ ok: false, error: "Musisz być zalogowany." }` (the endpoint does not redirect — it is JSON-only).
- A second click while a generation is in flight is blocked client-side (button disabled) and any prior in-flight `fetch()` is cancelled via `AbortController` before a new one starts. Server-side has no rate limit.
- Triggering generation while previous drafts are still pending acceptance **stacks**: a new `flashcard_generations` row is inserted and 8 new `flashcards` rows appear. Old drafts are left untouched (S-03's territory).
- `npm run lint` and `npm run build` both pass.

### Key Discoveries

- **F-02's `generateFlashcards()` already enforces the level guardrail** (`src/lib/services/flashcard-generation.ts:69-71`): cards whose `level` exceeds `requestedLevel` are filtered out before insert. The API route does NOT have to re-validate.
- **DTO mapping is required to keep `Flashcard` (Database-derived) out of the React island.** The `Flashcard` row has 12 columns (`mastery_score`, `reps_count`, `status`, etc.) the UI does not need. A DTO with 4 primitive fields (`id`, `front_text`, `hint_text`, `level`) is the L-001-compliant boundary.
- **`createClient(headers, cookies)` is the universal Supabase factory.** Both API routes and Astro pages use it. The endpoint reads `context.request.headers` and `context.cookies` (same as `src/pages/api/children.ts:15`).
- **The `children_one_per_parent_idx` unique index** (`supabase/migrations/20260526143400_reading_domain_schema.sql:161-162`) means `getMyChild` returns the single child or `null` — no list to disambiguate.
- **RLS does the heavy lifting.** The `flashcard_generations_insert` and `flashcards_insert` policies use `public.is_my_child(child_id)` (`supabase/migrations/20260526143400_reading_domain_schema.sql:253, 271`). The API route does not need to manually authorize — RLS rejects writes against another parent's child.
- **`reading_level` enum values are exported as a typed union** via `StoredReadingLevel` in `src/lib/reading-level-form.ts:6`. The DTO can reuse this without importing from `@/types` (no L-001 cascade).
- **`OPENAI_API_KEY` is declared as `optional: true`** in `astro.config.mjs` env schema (per F-02 plan). The service throws `"OpenAI API key is not configured."` when it's missing; the API route maps this to a Polish user-facing error.

## What We're NOT Doing

- **No schema changes.** F-01 + F-02 shipped everything needed. No new migrations.
- **No new service function or generation behavior changes.** `generateFlashcards()` from F-02 is reused for all LLM/DB work. The only allowed service-file change is exporting stable error contract constants/codes so the API route can map failures without brittle inline literals.
- **No accept/reject UI, no draft filtering, no draft-list page.** That is S-03 (`batch-flashcard-acceptance`). S-02's draft list is intentionally read-only and renders only the _just-generated_ batch — not all historical drafts.
- **No level-override form.** Per Q5, the generation button takes no level input; the API uses the child's stored `current_level`. The 5-option radio group from S-01 stays as the only level-setting UI.
- **No server-side concurrency lock or rate limit.** Per Q8, client-side button disable + `AbortController` is enough at PRD's scale (`users: small`, `qps: low`). A second tab can still issue a parallel generation — acceptable per Q7 "allow stack".
- **No background-job / queue / streaming.** One-shot synchronous request inside the worker's 30s response window. The 9.5s timeout is enforced by F-02's `AbortSignal.timeout(9_500)`.
- **No request body validation.** The endpoint accepts an empty `POST` body; nothing is read from the request body in MVP. (A future S-02b could add an override param — explicitly out of scope.)
- **No retry logic.** A failed generation surfaces the error and lets the parent click the button again. No automatic retries — fits the "after-hours, 3-week" budget.
- **No automated tests.** No test runner is configured (per AGENTS.md). Verification is `npm run lint`, `npm run build`, and manual smoke tests.
- **No middleware changes.** `/api/flashcards/generate` is not in `PROTECTED_ROUTES`; the endpoint authenticates inline (same pattern as `POST /api/children`).
- **No edits to existing components.** `ChildProfileForm`, `SubmitButton`, `ServerError`, `FormField` are untouched. The generation card has its own button (explicit `pending` prop, not `useFormStatus()`).
- **No new env vars.** `OPENAI_API_KEY` is already declared in `astro.config.mjs` env schema (F-02).

## Implementation Approach

Two phases that decouple cleanly: Phase 1 is pure backend (DTO + JSON API route), verifiable in isolation via `curl` against `npm run dev`. Phase 2 builds the React island and wires it into `/dashboard`. The split matches the F-02 / S-01 cadence — pause between phases for manual verification.

The API route is the first JSON `fetch()` endpoint in the codebase. It establishes a small but real new pattern: empty/JSON request body, 401 on unauthenticated (no redirect — `fetch()` follows redirects silently and the parent would see nothing), Polish error copy mapped from the service's English exceptions, and a `{ ok: true | false, ... }` discriminated-union response shape. S-03 will likely follow the same shape for batch accept/reject endpoints.

The React island is a small standalone component — not a child of `ChildProfileForm`. Two reasons: (1) the two flows are conceptually separate (configure profile vs. trigger generation); (2) keeping the island independent means S-03 can replace `<DraftFlashcardList>` with an interactive version without touching the generation card.

## Critical Implementation Details

- **JSON endpoint returns 401 (not 303 redirect) on no user.** Form endpoints redirect because the browser handles redirects; `fetch()` follows them silently and the React island would never see an error. The endpoint returns `Response.json({ ok: false, error: "Musisz być zalogowany." }, { status: 401 })` so the island can render a banner and the parent can re-authenticate manually.
- **Service failures are mapped through a shared error contract (constants/codes), not inline string literals.** Export stable error contract values from `src/lib/services/flashcard-generation.ts` (or a sibling `flashcard-generation-errors.ts`) and use them in both throw-sites and API mapping. Required mappings: missing API key → `500` + _"Generator fiszek nie jest skonfigurowany. Skontaktuj się z administratorem."_; timeout → `504` + _"Generowanie fiszek przekroczyło 10 sekund. Spróbuj ponownie."_; upstream generation failure → `503` + _"Nie udało się wygenerować fiszek. Spróbuj ponownie."_; unknown/dynamic errors (e.g. Supabase DB messages) → `500` + message fallback.
- **`AbortController` on the client must cancel BEFORE issuing a new request.** The pattern: keep an `abortRef = useRef<AbortController | null>(null)`; on click, `abortRef.current?.abort()`, then `abortRef.current = new AbortController()`, then `fetch(..., { signal: abortRef.current.signal })`. Without the prior `.abort()`, the React state from a stale resolved request can clobber a fresh one.
- **The level shown in the generation card UI must match the level sent to the LLM.** When `childLevel === null`, the card displays _"Poziom: Litery (najprostszy start)"_ AND the server resolves to `'letters'`. Diverging the two is a confusing UX regression — keep them in sync via a single `resolveDisplayLevel()` helper exported from `src/lib/reading-level-form.ts` (or co-located in the new DTO module) and use it on both sides.

---

## Phase 1: Backend — JSON API route + DTO layer

### Overview

Create the DTO module (`src/lib/dto/flashcards.ts`) and the JSON endpoint (`src/pages/api/flashcards/generate.ts`). After this phase, `curl -X POST http://localhost:4321/api/flashcards/generate` with a session cookie returns the JSON success/error shape. No UI exists yet.

### Changes Required

#### 1. Flashcard DTO module

**File**: `src/lib/dto/flashcards.ts`

**Intent**: Define the JSON wire format for the generation endpoint without leaking `Database`-derived types (`Flashcard`, `FlashcardGeneration`) across the API/React boundary. Provides a single `Flashcard → GeneratedFlashcardDTO` mapper used by the API route.

**Contract**:

- Export `interface GeneratedFlashcardDTO { id: string; front_text: string; hint_text: string | null; level: StoredReadingLevel }`. Import `StoredReadingLevel` from `@/lib/reading-level-form` (zod-free, Database-free).
- Export `interface GenerateFlashcardsSuccessResponse { ok: true; generationId: string; requestedLevel: StoredReadingLevel; cards: GeneratedFlashcardDTO[] }`.
- Export `interface GenerateFlashcardsErrorResponse { ok: false; error: string }`.
- Export `type GenerateFlashcardsResponse = GenerateFlashcardsSuccessResponse | GenerateFlashcardsErrorResponse` (the discriminated union the React island consumes).
- Export `function toGeneratedFlashcardDTO(card: Flashcard): GeneratedFlashcardDTO` mapping the four fields. Because `Flashcard` is Database-derived, this file uses the L-001 service-module disable header (same shape as `src/lib/services/children.ts:1-7`).
- This is the only place `Flashcard` is referenced outside `src/lib/services/`. The React island never imports it.

#### 2. Generation API endpoint

**File**: `src/pages/api/flashcards/generate.ts`

**Intent**: The slice's single mutation endpoint. JSON-only contract: authenticate, fetch the parent's child, resolve null level → `'letters'`, call `generateFlashcards()`, map result to DTO, return JSON. Maps service errors to Polish user-facing messages with appropriate HTTP status.

**Contract**:

- Top of file: `import type { APIRoute } from "astro";` plus imports for `createClient` (`@/lib/supabase`), `getMyChild` (`@/lib/services/children`), `generateFlashcards` + shared error contract constants/codes (`@/lib/services/flashcard-generation` or `@/lib/services/flashcard-generation-errors`), DTO mapper + response types (`@/lib/dto/flashcards`).
- Export `const prerender = false;` (AGENTS.md hard rule).
- Export `const POST: APIRoute = async (context) => { … }`:
  - Read `context.locals.user`. If `null`, return `Response.json({ ok: false, error: "Musisz być zalogowany." } satisfies GenerateFlashcardsErrorResponse, { status: 401 })`.
  - Build `const supabase = createClient(context.request.headers, context.cookies)`. If `null`, return `Response.json({ ok: false, error: "Supabase nie jest skonfigurowany." }, { status: 500 })`.
  - Fetch `const child = await getMyChild(supabase, user.id)` inside a try/catch. On DB error, return `500` + the error message.
  - If `child === null`, return `Response.json({ ok: false, error: "Najpierw utwórz profil dziecka, aby generować fiszki." }, { status: 400 })`.
  - Resolve `const requestedLevel: StoredReadingLevel = (child.current_level as StoredReadingLevel | null) ?? "letters"`. The cast narrows the `reading_level` enum (Database-derived) to the `StoredReadingLevel` literal union; safe because the enum values are identical.
  - Wrap `const { generation, cards } = await generateFlashcards(supabase, { childId: child.id, requestedLevel })` in try/catch.
  - On success: build the response with `cards.map(toGeneratedFlashcardDTO)` and `generationId: generation.id`, return `Response.json(response satisfies GenerateFlashcardsSuccessResponse, { status: 200 })`.
  - On error: map by the shared service error contract (constants/codes), not hard-coded route-local literals, and return status + Polish copy per "Critical Implementation Details". Default fallback: `500` + `err.message` (typically a Supabase DB error string).
- The endpoint never redirects — every response is JSON. No form parsing, no `formData()` call.
- File uses the L-001 service-module disable header because it touches `Child` (`child.current_level`, `child.id`) and `Flashcard` via the service result.

### Success Criteria

#### Automated Verification

- `src/lib/dto/flashcards.ts` and `src/pages/api/flashcards/generate.ts` both exist.
- `src/pages/api/flashcards/generate.ts` exports `const prerender = false;` and `const POST`.
- `npx astro sync` exits 0.
- `npm run lint` exits 0 with no new warnings.
- `npm run build` exits 0.

#### Manual Verification

- With local Supabase running and `OPENAI_API_KEY` set in `.dev.vars`, sign in as a test parent who has a child profile with `current_level = 'syllables'`. Send `POST http://localhost:4321/api/flashcards/generate` with the session cookie (e.g. via browser dev tools `fetch("/api/flashcards/generate", { method: "POST" })`). Confirm:
  - Response status is `200`.
  - Response body matches `GenerateFlashcardsSuccessResponse` shape with `ok: true`, `generationId` (uuid), `requestedLevel: "syllables"`, and `cards` array of length 8.
  - Each card has `id`, `front_text`, optional `hint_text`, and `level` ≤ `"syllables"`.
  - In Supabase Studio, a new `flashcard_generations` row exists for this child with `requested_level = 'syllables'`, and 8 linked `flashcards` rows have `status = 'draft'`.
- Set the child's `current_level` to `NULL` ("Nie wiem") via the existing profile form. Re-trigger the endpoint. Confirm response has `requestedLevel: "letters"` and all card levels are `"letters"`.
- Send `POST /api/flashcards/generate` while signed out (no cookies). Confirm response is `401` with `{ ok: false, error: "Musisz być zalogowany." }`.
- Sign in as a test parent who has NOT created a child profile yet. Send the same POST. Confirm `400` with `{ ok: false, error: "Najpierw utwórz profil dziecka, aby generować fiszki." }`.
- Temporarily remove `OPENAI_API_KEY` from `.dev.vars`, restart `npm run dev`, and trigger the endpoint as a signed-in parent. Confirm `500` with the Polish "Generator fiszek nie jest skonfigurowany..." message (the service's `"OpenAI API key is not configured."` string is correctly mapped).
- Trigger the endpoint twice in rapid succession via `Promise.all([fetch(...), fetch(...)])`. Confirm both return `200` (no server-side rate limit per Q8), and Supabase Studio shows 2 generation rows + 16 draft cards.

**Implementation Note**: After Phase 1 automated checks pass and manual verification with `curl`/devtools is complete, pause for confirmation before starting Phase 2.

---

## Phase 2: Frontend — generation card + drafts list on /dashboard

### Overview

Build two small React components — `<FlashcardGenerationCard>` (the island) and `<DraftFlashcardList>` (read-only renderer) — and add a second card to `/dashboard` below the existing child-profile card. The island handles its own pending state, error rendering, `AbortController` cancellation, and on-success rendering of the freshly-generated batch.

### Changes Required

#### 1. Read-only drafts list

**File**: `src/components/flashcards/DraftFlashcardList.tsx`

**Intent**: A presentational component that renders the just-generated batch as a vertical list of cards with the level badge and the "oczekuje na akceptację" indicator. No interactivity. S-03 will replace this with an interactive accept/reject version.

**Contract**:

- Props: `{ cards: GeneratedFlashcardDTO[] }`. Import `GeneratedFlashcardDTO` from `@/lib/dto/flashcards`. (Type-only import keeps zod and Database off the client bundle.)
- Render `null` when `cards.length === 0` (empty state is the responsibility of the parent component).
- Render an unordered list (`<ul>`) of cards, each as an `<li>` with:
  - The `front_text` in a prominent text size (e.g. `text-lg font-semibold text-white`).
  - The `hint_text` rendered as a secondary line below (`text-sm text-blue-100/70`) — only if non-null.
  - A small level badge using the same Polish copy as `ReadingLevelField` (`letters → "Litery"`, `syllables → "Sylaby"`, `words → "Pojedyncze słowa"`, `simple_sentences → "Proste zdania"`) via a shared helper imported from `@/lib/reading-level-form` (single source of truth; no local duplicate mapping).
  - A static badge "oczekuje na akceptację" styled similarly to other cosmic-theme pill badges (`rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200`).
- Visual treatment matches the existing card aesthetic: `rounded-lg border border-white/10 bg-white/5 p-3`. The list uses `space-y-2`.
- Accessible: `<ul>` with `aria-label="Wygenerowane fiszki oczekujące na akceptację"`.

#### 2. Generation card React island

**File**: `src/components/flashcards/FlashcardGenerationCard.tsx`

**Intent**: The island that drives the entire S-02 user-visible flow. Shows the level that will be used, the primary "Generuj 8 fiszek" button (with pending/disabled state), the error banner, and the `<DraftFlashcardList>` on success. Manages its own `AbortController` and `pending` state.

**Contract**:

- Default export `FlashcardGenerationCard`. Props: `{ childExists: boolean; childLevel: string | null }`. (`childLevel` is `string | null`, not `ReadingLevel | null`, per L-001 — the Astro page extracts the primitive.)
- Imports: `React, { useEffect, useRef, useState }`; lucide icons `Sparkles`, `CircleAlert`; the `<ServerError>` and `<DraftFlashcardList>` components; `READING_LEVEL_FORM_VALUES` and `type StoredReadingLevel` from `@/lib/reading-level-form`; `type GenerateFlashcardsResponse, type GeneratedFlashcardDTO` from `@/lib/dto/flashcards`.
- Resolve the display level once via shared helper(s) from `@/lib/reading-level-form`: if `childLevel` is `null`, the displayed level is `"Litery (najprostszy start)"`; otherwise use the canonical Polish label for that level from the shared mapping.
- State:
  - `pending: boolean` (default `false`).
  - `error: string | null` (default `null`).
  - `cards: GeneratedFlashcardDTO[]` (default `[]`).
  - `abortRef = useRef<AbortController | null>(null)`.
- Add unmount cleanup: `useEffect(() => () => abortRef.current?.abort(), [])` so in-flight requests are cancelled when leaving `/dashboard`.
- `async function handleClick()`:
  - If `pending`, return early (defensive — the button is also `disabled`).
  - `abortRef.current?.abort()`, then `abortRef.current = new AbortController()`.
  - `setPending(true)`, `setError(null)`. Do NOT clear `cards` yet — keep the previous batch visible until the new one arrives (avoids a flash of empty state).
  - `try { const res = await fetch("/api/flashcards/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: abortRef.current.signal }); const data = (await res.json()) as GenerateFlashcardsResponse; if (data.ok) { setCards(data.cards); } else { setError(data.error); } } catch (err) { if (err instanceof DOMException && err.name === "AbortError") return; setError("Nie udało się połączyć z serwerem. Sprawdź połączenie i spróbuj ponownie."); } finally { setPending(false); }`.
- Render structure (Tailwind classes match the existing dashboard card aesthetic):
  - Outer card: `rounded-2xl border border-white/10 bg-white/10 p-8 text-white backdrop-blur-xl`.
  - Heading `<h2>`: "Generuj fiszki" (gradient text matching the profile card header).
  - Subtitle paragraph: `"Poziom: <displayLevel>"`.
  - If `!childExists`: render a muted hint `"Najpierw utwórz profil dziecka powyżej, aby wygenerować fiszki."` and a disabled button. Skip the fetch wiring.
  - If `childExists`:
    - `<button type="button" onClick={handleClick} disabled={pending}>` with pending content `<span className="animate-spin..."/>Generuję fiszki... (do 10s)` and idle content `<Sparkles className="size-4" /> Generuj 8 fiszek`. Style matches `SubmitButton`'s purple primary look (`bg-purple-600 hover:bg-purple-500 disabled:opacity-60`).
    - `<ServerError message={error} />` directly below the button.
    - `<DraftFlashcardList cards={cards} />` below the error banner.
- No `useEffect`-based hydration/data-fetch logic. The component does not poll, subscribe, or fetch on mount; the only `useEffect` is the unmount cleanup that aborts in-flight requests.
- File contains no `@/types` import and no `eslint-disable` — only primitives and DTO types cross its boundary (L-001 compliant by construction).

#### 3. Dashboard adds the generation card below the profile card

**File**: `src/pages/dashboard.astro`

**Intent**: Render the generation card directly below the existing child-profile card, passing the primitives the island needs. Keep the existing profile card untouched.

**Contract**:

- Add to frontmatter imports: `import FlashcardGenerationCard from "@/components/flashcards/FlashcardGenerationCard";`.
- Derive a `childExists` boolean primitive from row presence, not display-name text: initialize `let childExists = false;` in frontmatter and set `childExists = true` only when `getMyChild(...)` returns a non-null row. Place this in the existing child-loading block near line ~24 so UI gating matches backend `child === null` semantics.
- In the JSX `<Layout>`, wrap the existing inner card and the new card in a vertical stack: change the outer container from `class="bg-cosmic flex min-h-screen items-center justify-center p-4"` to use `class="bg-cosmic flex min-h-screen items-start justify-center p-4 sm:items-center"`, and add a `<div class="flex w-full max-w-md flex-col gap-6">` wrapper around the existing inner card. The existing card keeps its `class="w-full max-w-md rounded-2xl border ..."` (now `w-full` since the wrapper carries the width constraint).
- Below the existing child-profile inner card and inside the wrapper, render `<FlashcardGenerationCard childExists={childExists} childLevel={childLevel} client:load />`.
- Do NOT change the existing card's content, the sign-out form, the header, or any other markup. The diff is: add one import, add one boolean primitive, add one wrapper div with `flex-col gap-6`, add one island below the existing card.

### Success Criteria

#### Automated Verification

- `src/components/flashcards/DraftFlashcardList.tsx` and `src/components/flashcards/FlashcardGenerationCard.tsx` both exist and compile.
- `src/pages/dashboard.astro` imports `FlashcardGenerationCard` and hydrates it via `client:load`.
- `npx astro sync` exits 0.
- `npm run lint` exits 0 with no new warnings (in particular: no `@typescript-eslint/no-unsafe-*` errors in the new React components — they should be L-001-compliant by construction).
- `npm run build` exits 0.

#### Manual Verification

- Sign in as a test parent and visit `/dashboard`. Confirm the page renders two stacked cards: the existing "Profil dziecka" card on top and the new "Generuj fiszki" card below.
- With `current_level = NULL` ("Nie wiem"): the generation card shows _"Poziom: Litery (najprostszy start)"_. Click "Generuj 8 fiszek". Confirm the button enters the pending state ("Generuję fiszki... (do 10s)" with spinner), and within 10s the 8 cards appear in the list below the button — all with the "Litery" badge and "oczekuje na akceptację" badge.
- Change the level to `syllables` via the profile form, refresh, and re-trigger generation. Confirm the new batch appears below the previous one's location (the state replaces; the first batch is gone from the UI but its rows remain in Supabase per Q7 stacking).
- Sign out, then send `fetch("/api/flashcards/generate", { method: "POST" })` from devtools. Confirm the response is `401` JSON and (when re-running while still on `/dashboard` after sign-out) the error banner renders "Musisz być zalogowany.".
- Visit `/dashboard` as a freshly-signed-up parent with no child profile yet. Confirm the generation card renders with the button disabled and the hint _"Najpierw utwórz profil dziecka powyżej, aby wygenerować fiszki."_. Create a child profile via the existing form, refresh, and confirm the generation card now shows the active button.
- Double-click the "Generuj 8 fiszek" button as fast as possible during a generation. Confirm only one fetch is in flight at a time (Network tab shows a single pending request; the second click is no-op while the button is disabled).
- Set `current_level` to `simple_sentences`, click Generate, and immediately (within ~3s) navigate back to `/auth/signin` then return to `/dashboard`. Confirm the prior in-flight request was aborted (no spurious state update on remount; no error banner; the page renders cleanly).
- Mobile width (≤375px): both cards stack vertically inside the layout, the list of 8 cards scrolls within the viewport without horizontal overflow, and the primary button stays full-width.
- Temporarily set `OPENAI_API_KEY` in `.dev.vars` to an invalid string (e.g. `sk-INVALID`), restart `npm run dev`, click Generate. Confirm the error banner renders _"Nie udało się wygenerować fiszek. Spróbuj ponownie."_ (the service's "Flashcard generation failed..." string mapped to Polish).

**Implementation Note**: After Phase 2 automated checks pass and the end-to-end flow (sign in → land on dashboard → set level → generate → see 8 drafts listed) feels right, pause for final confirmation before marking S-02 complete.

---

## Testing Strategy

### Unit Tests

No automated test runner is configured (AGENTS.md). Phase 1's API route is the most test-worthy unit (the service-error → Polish-copy mapping is brittle). Verified by manual smoke tests against `npm run dev` in this slice; consider adding `vitest` in a future change to cover the mapping table.

### Integration Tests

Not applicable — no test runner.

### Manual Testing Steps

1. Start local Supabase (`npx supabase start`) and the dev server (`npm run dev`) in the user's own terminal.
2. Confirm `.dev.vars` contains a valid `OPENAI_API_KEY`.
3. Sign in as a test parent with an existing child profile (`current_level = 'syllables'`).
4. Visit `/dashboard`. Confirm two cards render: profile (top) and generation (bottom).
5. Click "Generuj 8 fiszek". Confirm the button enters pending state with the "do 10s" copy and the spinner, and within ~10s the 8 cards appear in a list below with `front_text`, optional `hint_text`, a "Sylaby" level badge, and the "oczekuje na akceptację" badge on each.
6. Confirm in Supabase Studio that a new `flashcard_generations` row exists with `requested_level = 'syllables'` and 8 linked `flashcards` rows have `status = 'draft'`.
7. Change the level to "Nie wiem" via the profile form and re-submit. Refresh `/dashboard`. Click Generate again. Confirm the level hint shows _"Litery (najprostszy start)"_ and the 8 cards all have the "Litery" badge.
8. Sign in as a different parent who has no child profile. Confirm the generation card's button is disabled and the hint to create a profile first is visible.
9. While signed in, run `await fetch("/api/flashcards/generate", { method: "POST" }).then(r => r.json())` in devtools. Confirm the response shape matches `GenerateFlashcardsSuccessResponse` (or `{ ok: false, error: ... }` for failures).

## Performance Considerations

- The full generation request stays under F-02's 9.5s budget; the UI claims "do 10s" to set expectations. The Cloudflare workerd response window is 30s, so even an LLM call that approaches the timeout still has headroom.
- Phase 2's island adds no `useEffect` polling and no subscriptions; hydration cost is identical to `ChildProfileForm`.
- The dashboard's existing `getMyChild` call already runs on every render (S-01 behavior). The new card does NOT trigger another DB query — `childExists` is derived from the existing `childDisplayName` primitive.
- The 8-card response payload is small (~1-2 KB JSON). No streaming, no progressive rendering needed.

## Migration Notes

- **No DB migration.** F-01 + F-02 are sufficient.
- **Rollback.** Revert the slice's commits to remove `src/lib/dto/flashcards.ts`, `src/pages/api/flashcards/generate.ts`, the two React components, and the dashboard wrapper diff. Any `flashcard_generations` / `flashcards` rows created during testing remain in the DB and are deletable via Studio or `delete from flashcard_generations where child_id in (...)` (RLS-protected to the parent).
- **Cloudflare Workers deploy.** The new endpoint is SSR (`prerender = false`); it runs in the worker runtime, same as `/api/children`. `AbortSignal.timeout` is workerd-compatible per F-02's verified compatibility date. No bundle-size concerns — DTO module is tiny, no new dependencies.

## References

- Roadmap entry: `context/foundation/roadmap.md` (§ "S-02: Generacja fiszek przez AI").
- PRD requirements: `context/foundation/prd.md` (US-01, FR-003, NFR partia <10 s, Business Logic).
- F-02 service: `src/lib/services/flashcard-generation.ts:43-109`.
- F-02 plan & brief: `context/changes/llm-flashcard-provider/plan.md`, `context/changes/llm-flashcard-provider/plan-brief.md`.
- F-01 schema (RLS, level enum, draft default): `supabase/migrations/20260526143400_reading_domain_schema.sql:41-46, 102-126, 253-282`.
- S-01 patterns: `src/pages/dashboard.astro`, `src/components/child/ChildProfileForm.tsx`, `src/pages/api/children.ts`, `src/lib/services/children.ts`.
- L-001 lesson: `context/foundation/lessons.md`.
- Auth components reused: `src/components/auth/ServerError.tsx`.
- Reading-level helpers: `src/lib/reading-level-form.ts`.
- Repo conventions: `AGENTS.md`, `CLAUDE.md`.
- GitHub issue: [#9](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/9).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `.cursor/skills/10x-plan/references/progress-format.md`.

### Phase 1: Backend — JSON API route + DTO layer

#### Automated

- [x] 1.1 `src/lib/dto/flashcards.ts` and `src/pages/api/flashcards/generate.ts` both exist — 2d8bb02
- [x] 1.2 `src/pages/api/flashcards/generate.ts` exports `const prerender = false;` and `const POST` — 2d8bb02
- [x] 1.3 `npx astro sync` exits 0 — 2d8bb02
- [x] 1.4 `npm run lint` passes with no new warnings — 2d8bb02
- [x] 1.5 `npm run build` passes — 2d8bb02

#### Manual

- [x] 1.6 `POST /api/flashcards/generate` as signed-in parent with `current_level = 'syllables'` returns `200` with 8 cards, all `level ≤ 'syllables'` — 2d8bb02
- [x] 1.7 New `flashcard_generations` row visible in Studio with `requested_level = 'syllables'`; 8 linked `flashcards` rows have `status = 'draft'` — 2d8bb02
- [x] 1.8 With `current_level = NULL`, the response has `requestedLevel: "letters"` and all cards have `level = "letters"` — 2d8bb02
- [x] 1.9 Unauthenticated `POST /api/flashcards/generate` returns `401` JSON `{ ok: false, error: "Musisz być zalogowany." }` — 2d8bb02
- [x] 1.10 Parent with no child profile gets `400` JSON `{ ok: false, error: "Najpierw utwórz profil dziecka, aby generować fiszki." }` — 2d8bb02
- [x] 1.11 Missing `OPENAI_API_KEY` returns `500` with the Polish "Generator fiszek nie jest skonfigurowany..." message — 2d8bb02
- [x] 1.12 Two parallel requests both return `200` (no rate limit); Studio shows 2 generation rows + 16 draft cards — 2d8bb02

### Phase 2: Frontend — generation card + drafts list on /dashboard

#### Automated

- [x] 2.1 `src/components/flashcards/DraftFlashcardList.tsx` and `src/components/flashcards/FlashcardGenerationCard.tsx` exist and compile — b5e2b0b
- [x] 2.2 `src/pages/dashboard.astro` imports `FlashcardGenerationCard` and hydrates it via `client:load` — b5e2b0b
- [x] 2.3 `npx astro sync` exits 0 — b5e2b0b
- [x] 2.4 `npm run lint` passes with no new warnings — b5e2b0b
- [x] 2.5 `npm run build` passes — b5e2b0b

#### Manual

- [x] 2.6 `/dashboard` renders two stacked cards (profile on top, generation below) for a signed-in parent — b5e2b0b
- [x] 2.7 Clicking "Generuj 8 fiszek" with `current_level = 'syllables'` shows pending state with "do 10s" copy and renders 8 cards within 10s — b5e2b0b
- [x] 2.8 With `current_level = NULL`, the level hint shows _"Litery (najprostszy start)"_ and generated cards all have the "Litery" badge — b5e2b0b
- [x] 2.9 Parent with no child profile sees a disabled button and the "Najpierw utwórz profil dziecka..." hint — b5e2b0b
- [x] 2.10 Double-click during pending is blocked client-side (single network request in flight) — b5e2b0b
- [x] 2.11 In-flight request is cancelled cleanly when the user navigates away (no console error, no spurious state update) — b5e2b0b
- [x] 2.12 Mobile width (≤375px) stacks both cards and the draft list with no horizontal overflow — b5e2b0b
- [x] 2.13 Invalid `OPENAI_API_KEY` triggers the Polish "Nie udało się wygenerować fiszek..." error banner — b5e2b0b
