# Parent Auth & Reading Level (S-01) Implementation Plan

## Overview

S-01 lights up the first user-visible flow of RafcioCzyta: an authenticated parent creates exactly one child profile (display name + reading level) on `/dashboard`, where "Nie wiem — najprostszy start" is a first-class fifth choice that maps to `current_level = NULL` per F-01. The same form on `/dashboard` later lets the parent change the level. This is the first slice in Stream A; it consumes F-01's `children` table without adding any schema.

## Current State Analysis

- **Auth scaffolding is complete.** `src/middleware.ts:6` resolves the cookie session and attaches `context.locals.user`. `PROTECTED_ROUTES = ["/dashboard"]` (`src/middleware.ts:4`) already redirects anonymous parents to `/auth/signin`. Form-encoded redirect endpoints exist at `src/pages/api/auth/{signin,signup,signout}.ts`. React islands `SignInForm.tsx` and `SignUpForm.tsx` follow a clear pattern: client `useState` + `validate()` + `clearError(field)` + form posts to `/api/auth/...` + `serverError` lifted from `Astro.url.searchParams.get("error")`.
- **F-01 data model is ready.** `public.children` has `parent_user_id`, `display_name`, nullable `current_level` (enum `letters | syllables | words | simple_sentences`), and a unique index `children_one_per_parent_idx` on `parent_user_id` (`supabase/migrations/20260526143400_reading_domain_schema.sql:161`). Four per-operation RLS policies use `parent_user_id = (select auth.uid())` directly (no helper needed). DTOs `Child`, `ChildInsert`, `ChildUpdate`, `ReadingLevel` are exported from `@/types` (`src/types.ts:9-11`).
- **`/dashboard` is a placeholder welcome page** (`src/pages/dashboard.astro`) — a "Welcome, {user.email}" card with a sign-out button. No real content. The slice repurposes it as the child-profile home.
- **Sign-in currently lands users at `/`** (`src/pages/api/auth/signin.ts:19`), not `/dashboard`. Sign-up lands at `/auth/confirm-email`. Q4 settled that the slice changes sign-in's redirect target to `/dashboard`; sign-up is untouched because email confirmation is part of Supabase's flow and sign-in carries the parent into `/dashboard` afterwards anyway.
- **zod is NOT a project dependency.** It appears in `package-lock.json` only as a transitive (likely from `@supabase/ssr`). `package.json` does not list it, and no API route currently uses it. AGENTS.md prescribes "validate request bodies with zod" — Phase 1 adds the runtime dep.
- **No test runner is configured.** Per AGENTS.md, verification is `npm run lint`, `npm run build`, and manual checks.
- **Agent shell limits.** Per CLAUDE.md, the agent cannot run `npx supabase db reset|start|stop`, `npm run dev`, or `npx wrangler dev`. Agent-friendly commands: `npm run lint`, `npm run build`, `npx astro sync`, `git`. Anything DB-state-touching is for the user's own terminal.

## Desired End State

After this plan lands and the user runs `npm run dev` against a local Supabase:

- An authenticated parent visiting `/dashboard` with **no child** sees the child-profile form (display name empty, "Nie wiem — najprostszy start" pre-selected). Submitting the form creates a `children` row scoped to their `auth.users.id` and refreshes `/dashboard` showing the same form pre-filled with the saved values.
- An authenticated parent visiting `/dashboard` with **an existing child** sees the same form pre-filled and can submit it to update the display name and/or the reading level. The "Nie wiem" radio remains selectable to reset `current_level` to `NULL`.
- A successful sign-in redirects to `/dashboard` (not `/`). Sign-up's flow is unchanged: `/auth/signup` → `/auth/confirm-email` → user clicks the link / dev auto-confirm → `/auth/signin` → `/dashboard`.
- An anonymous parent visiting `/dashboard` continues to be redirected to `/auth/signin` by the existing middleware (no middleware changes).
- `npm run lint` and `npm run build` both pass without changes outside this slice's scope.

### Key Discoveries

- **FR-002 "don't know" is stored as `NULL`.** F-01 deliberately chose `children.current_level` nullable rather than adding a fifth enum value (`supabase/migrations/20260526143400_reading_domain_schema.sql:81-88`, F-01 plan §"Critical Implementation Details"). The UI exposes it as the fifth radio option; the API normalizes the wire value `"unknown"` to `null`.
- **The single-child rule is a unique index, not a column constraint.** `children_one_per_parent_idx` makes a second `insert` for the same parent fail with Postgres SQLSTATE `23505`. The API treats the form as upsert-shaped and picks `insert` vs `update` based on whether a row already exists for the authenticated user's id.
- **RLS already enforces parent ownership.** The `children_*` policies use `parent_user_id = (select auth.uid())` directly. The endpoint does not have to validate `parent_user_id` against the session — RLS will reject any insert/update where they diverge.
- **React form pattern is set.** `SignInForm.tsx:36-87` and `SignUpForm.tsx:51-134` are the templates: a small `validate()`, `clearError(field)` on change, `<form method="POST" action="/api/...">` posting form-encoded data, `<ServerError message={serverError} />` for redirect-borne errors. The child form follows this verbatim, with one new field type (radio group for reading level).
- **API redirect-style is the convention.** `src/pages/api/auth/signin.ts:15-19` and siblings: redirect to a path with `?error=…` on failure, redirect to a success path otherwise. The child endpoint follows this exactly — redirect back to `/dashboard?error=…` on validation failure, redirect to `/dashboard` on success.
- **Path alias `@/*` → `./src/*`** is already wired (per CLAUDE.md and existing imports like `@/lib/supabase`, `@/types`). New files import via `@/lib/services/children`, `@/lib/schemas/child`, etc., without further config.

## What We're NOT Doing

- **No schema changes.** F-01 already shipped everything needed. No new migrations, no enum changes (FR-002's "don't know" stays as `NULL`, not a new enum value), no RLS policy edits.
- **No multi-child support.** `children_one_per_parent_idx` stays. Multi-child is a future migration that drops the index; out of scope for S-01.
- **No flashcard generation, no SRS wiring, no practice UI.** S-02..S-05 own those. The dashboard exposes only the child profile in this slice.
- **No new `/onboarding` route.** Q1 settled this — onboarding is the empty state of `/dashboard`, not a separate page.
- **No middleware changes.** Q5 settled this — `/dashboard` shows the form inline when no child exists; the middleware's `PROTECTED_ROUTES` list is untouched.
- **No `?next=` parameter plumbing.** Q4 picked "always redirect to `/dashboard`" over deep-link preservation.
- **No sign-up redirect change.** Email confirmation flow stays; the user lands on `/dashboard` only after sign-in.
- **No automated tests.** AGENTS.md: no test runner configured. Verification is lint + build + manual. Adding a runner is out of scope.
- **No re-localization of auth forms.** SignIn/SignUp forms stay in English; the child-profile form's user-visible copy is Polish to match the parent audience. (Mixed-language UI is a pre-existing condition of the codebase; aligning auth copy is out of scope.)
- **No rename of `/dashboard`.** Keeping the route name keeps the diff small. A future rebrand can rename to `/family` or similar.
- **No update of `/` landing page** (`src/pages/index.astro`, `src/components/Welcome.astro`). Still the starter welcome screen; rebranding is a separate concern.

## Implementation Approach

Two phases that decouple cleanly. Phase 1 is pure backend: add zod, introduce a schemas module and a service module, ship `POST /api/children`, and flip sign-in's redirect to `/dashboard`. Phase 1 is verifiable in isolation via Studio / curl — no UI required to prove the endpoint works. Phase 2 builds the React island and rewires `/dashboard` to fetch the current child server-side and render the form with `initialChild` set to `null` (onboarding) or the row (edit mode). The split lets the manual verification step at the end of Phase 1 pause and re-baseline before any UI lands, matching the F-01 "pause between phases for manual confirmation" pattern.

## Critical Implementation Details

- **"Nie wiem" round-trips as the literal string `"unknown"` on the wire, then becomes `null` server-side.** The radio group submits one of five values: `"letters" | "syllables" | "words" | "simple_sentences" | "unknown"`. The zod schema accepts all five. The service layer normalizes `"unknown"` to `null` before passing to Supabase; everywhere else, `current_level: ReadingLevel | null` is the typed shape. Do not introduce a fifth enum value in the DB or a new TS literal that leaks `"unknown"` outside the form/API boundary.
- **The endpoint must pick insert vs update — `Supabase.upsert` is allowed but the existing-row check pattern is clearer.** Inside `POST /api/children`, after authn and zod validation, call the service with `parentUserId = user.id`. The service fetches the existing row with a Supabase JS filter `.eq("parent_user_id", parentUserId)`; do not write SQL-only `auth.uid()` into a PostgREST filter. If present → `update` by `id`. If absent → `insert` with `parent_user_id = user.id`. Catching SQLSTATE `23505` on the insert path and falling back to update covers the rare double-submit race; the alternative `.upsert({ ... }, { onConflict: "parent_user_id" })` works too because the unique index is on that column, but the explicit check matches the existing auth code style (read-then-write, no hidden cleverness).
- **The API endpoint is not in `PROTECTED_ROUTES`; it authenticates itself inline.** Middleware only redirects HTML navigations to `/auth/signin` for `/dashboard`. For `POST /api/children`, the endpoint reads `context.locals.user` (already populated by middleware) and, if `null`, redirects to `/auth/signin` with `context.redirect("/auth/signin", 303)`. This matches what the existing auth API routes do implicitly — they don't need a user, but the child endpoint does.
- **`children.parent_user_id` is set to `context.locals.user.id`, never from the form.** This is the single most important security guard in the slice. Even though RLS would reject mismatched inserts, the endpoint must not echo a client-provided `parent_user_id` into Supabase. The zod schema does not include that field; it is added in the service function from the session.
- **CSRF posture intentionally matches the existing auth form endpoints for this MVP slice.** The endpoint accepts same-site cookie-authenticated form POSTs and does not introduce a separate CSRF token mechanism in S-01; this keeps behavior consistent with `src/pages/api/auth/{signin,signup,signout}.ts` and avoids introducing a one-off security model in this slice.
- **Sign-in redirect change is one line, but it's a flow-level change.** `src/pages/api/auth/signin.ts:19` flips `redirect("/")` to `redirect("/dashboard")`. After this change, `/` is no longer the post-auth landing page; manual verification step 2.10 explicitly covers it.

## Phase 1: Backend — child profile API, zod schemas, service helper, sign-in redirect

### Overview

Add `zod` as a dependency, introduce `src/lib/reading-level-form.ts` (zod-free form values/types), `src/lib/schemas/child.ts` (parser for the form payload), `src/lib/services/children.ts` (typed Supabase calls), and `src/pages/api/children.ts` (form-encoded `POST` that authenticates, validates, normalizes `"unknown"` → `null`, and chooses insert vs update). Change the sign-in success redirect from `/` to `/dashboard`.

### Changes Required

#### 1. Add zod to dependencies

**File**: `package.json`

**Intent**: zod is the validation library prescribed by AGENTS.md but not yet installed. Add it so the schemas module compiles and the API endpoint can validate form input.

**Contract**: `zod` appears under `dependencies` (not `devDependencies`) at a current `4.x` line. The pinned version is the most recent stable line resolvable by `npm install zod` at implementation time. The lockfile (`package-lock.json`) is regenerated by the install; commit both. No other dependency edits.

#### 2. Form values and payload schema

**Files**: `src/lib/reading-level-form.ts`, `src/lib/schemas/child.ts`

**Intent**: Keep the form's reading-level values in a zod-free module that is safe for React islands, while keeping server-side payload validation in the zod schema module used by `POST /api/children`.

**Contract**:

- `src/lib/reading-level-form.ts` exports `READING_LEVEL_FORM_VALUES = ["letters", "syllables", "words", "simple_sentences", "unknown"] as const` and the derived type `ReadingLevelFormValue` (the fifth literal `"unknown"` represents the FR-002 "Nie wiem" choice). This file imports no zod and no Supabase code.
- `src/lib/schemas/child.ts` imports `READING_LEVEL_FORM_VALUES` and `ReadingLevelFormValue`, then exports a zod schema `childProfileFormSchema` validating:
  - `displayName`: `z.string().trim().min(1, "Imię dziecka jest wymagane").max(80, "Imię nie może być dłuższe niż 80 znaków")`.
  - `level`: value constrained to `READING_LEVEL_FORM_VALUES`; invalid/missing values must surface the user-facing message `"Wybierz poziom czytania"` using the current zod 4-compatible API shape.
- Export a helper `toCurrentLevel(value: ReadingLevelFormValue): ReadingLevel | null` that returns `null` for `"unknown"` and the value unchanged otherwise. Type the return against `@/types`'s `ReadingLevel`.
- `src/lib/schemas/child.ts` contains no runtime side effects and no Supabase imports, but React code should import only from `src/lib/reading-level-form.ts` so zod stays out of the client bundle.

#### 3. Children service module

**File**: `src/lib/services/children.ts`

**Intent**: Centralize the two Supabase calls the slice needs (read the current parent's child, write/update it) so the API route stays thin and downstream slices (S-02 onwards) can reuse the same accessors when they need the child for generation context.

**Contract**:

- Imports `SupabaseClient` from `@supabase/supabase-js`, `Database` from `@/db/database.types`, and `Child`, `ReadingLevel` from `@/types`.
- Exports a narrow client alias `type AppSupabase = SupabaseClient<Database>` for downstream reuse (avoid duplicating it in every service).
- Exports `getMyChild(supabase: AppSupabase, parentUserId: string): Promise<Child | null>` — single `select * from children where parent_user_id = parentUserId limit 1` expressed as `.eq("parent_user_id", parentUserId).limit(1).maybeSingle()` in Supabase JS; RLS remains the ownership backstop. Returns `null` when no row. On Supabase error, throw — the caller catches and converts to a user-facing error.
- Exports `upsertMyChild(supabase: AppSupabase, input: { parentUserId: string; displayName: string; currentLevel: ReadingLevel | null }): Promise<Child>`:
  - Reads the existing row by `.eq("parent_user_id", input.parentUserId)`.
  - If present: `update({ display_name, current_level }).eq("id", existing.id).select().single()`.
  - If absent: `insert({ parent_user_id, display_name, current_level }).select().single()`. On `23505` (single-child race) fall back to the update path against the freshly fetched row.
  - Returns the persisted `Child`. Throws on unrecoverable Supabase errors.
- The module exports only async functions and the `AppSupabase` alias — no React, no Astro types, no zod (validation is the schemas module's job).

#### 4. Child-profile API endpoint

**File**: `src/pages/api/children.ts`

**Intent**: The slice's single mutation endpoint. Authenticates, validates, normalizes the level, calls the service, and redirects back to `/dashboard`. Form-encoded request body, redirect-style response — mirrors the auth endpoints so the React form pattern carries over with no special handling.

**Contract**:

- Top of file: `import type { APIRoute } from "astro";` plus imports for `createClient`, the schema (`childProfileFormSchema`, `toCurrentLevel`), and `upsertMyChild`.
- Export `const prerender = false;` (AGENTS.md hard rule for API routes).
- Export `const POST: APIRoute = async (context) => { … }`:
  - Read `context.locals.user`. If `null`, `return context.redirect("/auth/signin", 303)`.
  - Read `await context.request.formData()`. Pull `displayName` and `level`. Run `childProfileFormSchema.safeParse({ displayName, level })`. On failure, redirect with `303` to `/dashboard?error=<encoded first-issue message>` (a single user-facing message is enough — the React island also validates client-side, so the server message is the safety net).
  - `const supabase = createClient(context.request.headers, context.cookies)`. If `null`, redirect with `303` to `/dashboard?error=` with the "Supabase nie jest skonfigurowany" copy (mirrors the existing auth route guards in `signin.ts:11`).
  - Build `currentLevel = toCurrentLevel(parsed.data.level)`. Call `upsertMyChild(supabase, { parentUserId: user.id, displayName: parsed.data.displayName, currentLevel })`.
  - Wrap the service call in `try/catch`. On error: `context.redirect("/dashboard?error=" + encodeURIComponent(err.message ?? "Nie udało się zapisać profilu dziecka"), 303)`.
  - On success: `return context.redirect("/dashboard", 303)` (no `?ok=1` query; the dashboard's UI state — a populated form — is the success signal).
- No JSON response branch; this endpoint is form-encoded redirect-style only.

#### 5. Sign-in redirect target

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Land authenticated parents on the canonical home of the slice instead of `/`. One-line behavioral change, but it is the user-visible glue between FR-001 (sign in) and FR-002 (set level).

**Contract**: Replace `return context.redirect("/")` on success with `return context.redirect("/dashboard")`. No other edits in this file. The error redirect at line 16 stays as `redirect("/auth/signin?error=…")`.

### Success Criteria

#### Automated Verification

- `zod` is listed under `dependencies` in `package.json`.
- `src/lib/reading-level-form.ts`, `src/lib/schemas/child.ts`, `src/lib/services/children.ts`, and `src/pages/api/children.ts` all exist and import cleanly: `npx astro sync` exits 0.
- `src/pages/api/auth/signin.ts` redirects to `/dashboard` on success (string match `"/dashboard"` in the success path).
- `src/pages/api/children.ts` exports `const prerender = false;` and `const POST`.
- `npm run lint` exits 0 with no new warnings.
- `npm run build` exits 0.

#### Manual Verification

- Sign in as a test parent via `/auth/signin`. After Supabase confirms, the browser lands on `/dashboard` (not `/`).
- With the local Supabase running, send `POST /api/children` (e.g. via the browser dev tools or curl) with form-encoded `displayName=Rafcio&level=syllables`. Confirm the response is a `303` redirect to `/dashboard` and that a `children` row appears in Studio under the test parent with `current_level = 'syllables'`.
- Re-submit the same endpoint with `displayName=Rafcio&level=unknown`. Confirm the same row is updated and `current_level` is now `NULL`.
- Re-submit with `displayName=&level=letters` (empty name). Confirm the response redirects to `/dashboard?error=Imi%C4%99%20dziecka%20jest%20wymagane` (or the URL-encoded equivalent).
- POST to `/api/children` with an unauthenticated request (no Supabase session cookie). Confirm the response redirects to `/auth/signin`.

**Implementation Note**: After completing Phase 1 and all automated verification passes, pause here for manual confirmation that the endpoint behaves correctly in Studio before starting Phase 2. The Progress section enumerates the corresponding `- [ ]` items.

---

## Phase 2: Frontend — dashboard becomes the child-profile home

### Overview

Replace `/dashboard`'s placeholder content with a server-fetch of the current parent's child + the new React island form. Build two small React components: `ReadingLevelField` (the 5-option radio group) and `ChildProfileForm` (the form orchestrator). Reuse `FormField`, `SubmitButton`, and `ServerError` from `src/components/auth/` verbatim. No middleware changes; no Layout changes.

### Changes Required

#### 1. Reading-level radio group

**File**: `src/components/child/ReadingLevelField.tsx`

**Intent**: A controlled radio group rendering the 5 reading-level options with Polish labels, including the FR-002 "Nie wiem" choice as a first-class fifth option. Self-contained component used only by `ChildProfileForm`, but kept separate so the option list is easy to audit and future slices (S-02 generation form) can reuse it.

**Contract**:

- Props: `{ value: ReadingLevelFormValue; onChange: (next: ReadingLevelFormValue) => void; error?: string; name?: string }`. Default `name = "level"`.
- Imports `READING_LEVEL_FORM_VALUES` and `ReadingLevelFormValue` from `@/lib/reading-level-form` so the option set never drifts from the API schema without pulling zod into the client bundle.
- Renders a `fieldset` with a `<legend>` ("Poziom czytania dziecka"), one `<input type="radio">` per option (each with `name={name}` so the form's `formData` carries the value), and Polish copy in this exact mapping:
  - `letters` → "Litery"
  - `syllables` → "Sylaby"
  - `words` → "Pojedyncze słowa"
  - `simple_sentences` → "Proste zdania"
  - `unknown` → "Nie wiem — zacznij od najprostszego"
- Visual treatment matches the existing form aesthetic (`bg-white/10`, `border-white/20`, `text-white`, `focus-visible:ring-purple-400`). Use `cn()` from `@/lib/utils` for conditional class merges.
- Error rendering follows `FormField`'s pattern: red border on the fieldset + small `<p>` with `CircleAlert` icon when `error` is set.
- Accessible: each radio has a matching `<label>` and the fieldset has `aria-describedby` pointing at the error message when present.

#### 2. Child-profile form

**File**: `src/components/child/ChildProfileForm.tsx`

**Intent**: The React island that powers `/dashboard`'s primary UI. Renders the name field and the level radio group, runs client-side validation parallel to the server's zod schema, and posts to `/api/children`. One component handles both the empty state (no child yet) and the edit state (existing child) by reading initial values from props.

**Contract**:

- Default export `ChildProfileForm`. Props: `{ initialChild: Child | null; serverError?: string | null }`.
- Initial state derived from `initialChild`:
  - `displayName`: `initialChild?.display_name ?? ""`.
  - `level`: `initialChild?.current_level ?? "unknown"` (NULL maps to `"unknown"` on the way in, mirroring `toCurrentLevel` on the way out).
- `validate()` runs on submit and mirrors the zod schema's user-visible messages:
  - `displayName.trim()` is required (message: "Imię dziecka jest wymagane").
  - `displayName.trim().length` ≤ 80 ("Imię nie może być dłuższe niż 80 znaków").
  - `level` ∈ `READING_LEVEL_FORM_VALUES` (defensive — the radio enforces this anyway).
- `clearError(field)` runs on any change.
- `<form method="POST" action="/api/children" onSubmit={handleSubmit} noValidate className="space-y-4">`. Inside: a `FormField` for `displayName` (reuses `src/components/auth/FormField.tsx` with a `User` icon from `lucide-react` for visual variety; if `User` does not feel right pick `BookOpen` — pick one and stick with it), a `ReadingLevelField` for the level, `<ServerError message={serverError} />`, and a `SubmitButton` (pending text "Zapisywanie..." / non-pending "Zapisz profil dziecka").
- Submit-time UX: when `initialChild` is `null`, the button label may read "Utwórz profil dziecka" instead of "Zapisz profil dziecka" to make the create vs update distinction obvious. Either choice is acceptable; pick one in code and leave the other unused.
- No `client:idle`/`client:visible` — the parent page uses `client:load`, same as `SignInForm`/`SignUpForm`.

#### 3. Dashboard becomes the slice's surface

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the placeholder welcome card with the server-rendered shell that fetches the current parent's child and hands it to `ChildProfileForm`. Empty state and edit state are the same component — only `initialChild` differs.

**Contract**:

- Frontmatter: `import Layout`, `import ChildProfileForm from "@/components/child/ChildProfileForm"`, `import { createClient } from "@/lib/supabase"`, `import { getMyChild } from "@/lib/services/children"`.
- Read `const { user } = Astro.locals`. (Middleware already guarantees this is non-null for `/dashboard` — but type-narrow with an early return / fallback rendering just in case.)
- Build a Supabase client from request headers + cookies. If `null`, render a clear "Supabase nie jest skonfigurowany" state inside the layout (mirror `signin.astro`'s tolerance for missing config).
- Fetch `const child = await getMyChild(supabase, user.id)`. On error: surface as `serverError` to the form. Otherwise pass `child` (which may be `null`) into the form.
- Read `const error = Astro.url.searchParams.get("error")`. Pass it through to the form's `serverError` prop.
- Top of the page: a header showing the parent's email (preserve the existing "logged in as" affordance) and the sign-out form (existing pattern from the placeholder dashboard) — small but kept so the page is functional.
- The form is a React island: `<ChildProfileForm initialChild={child} serverError={error} client:load />`.
- Layout title: `"Profil dziecka"` (replacing `"Dashboard"`). Keep the cosmic background visuals so the design language of the rest of the app is preserved.

#### 4. Co-locate hooks if extracted (optional, only if needed)

**File**: `src/components/hooks/useChildProfileForm.ts` (or similar)

**Intent**: If `ChildProfileForm` grows to the point where the validation / state-management logic is hard to read inline, extract a hook into `src/components/hooks/` per AGENTS.md. If the inline component stays small (it should — both auth forms are <140 lines), skip this file.

**Contract**: If extracted, the hook returns `{ displayName, setDisplayName, level, setLevel, errors, handleSubmit }` and contains all `useState` + `validate()` + `clearError()` logic. The component then becomes a thin renderer. Default: omit this file.

### Success Criteria

#### Automated Verification

- `src/components/child/ReadingLevelField.tsx` and `src/components/child/ChildProfileForm.tsx` both exist and compile.
- `src/pages/dashboard.astro` imports `ChildProfileForm` and `getMyChild` and renders the React island via `client:load`.
- `npm run lint` exits 0 with no new warnings (in particular: no `react-hooks/exhaustive-deps`, no `react/react-in-jsx-scope`, no `astro/no-unused-css-selector` regressions).
- `npm run build` exits 0.
- `npx astro sync` exits 0 (sanity-check the Astro type-graph after the page rewrite).

#### Manual Verification

- Open `/dashboard` as a freshly signed-in parent with no child row. The form renders with `displayName = ""` and "Nie wiem — zacznij od najprostszego" pre-selected. Submitting with a valid name returns to `/dashboard` and the form is now pre-filled with the saved values.
- Change the level from `unknown` to `syllables` (or any non-unknown option) and submit. The form reloads pre-filled with the new level. Confirm in Studio that the `children` row's `current_level` matches.
- Change the level from `syllables` back to `unknown` and submit. Confirm Studio shows `current_level = NULL`.
- Submit the form with `displayName` cleared. The form shows the inline client-side error "Imię dziecka jest wymagane" and the request is not sent (no network call). Confirm via dev tools' Network tab.
- Force the server-side validation path by temporarily disabling JS in dev tools and submitting an empty name. The page reloads with `?error=Imi%C4%99%20dziecka%20jest%20wymagane`; the `ServerError` banner renders the message above the submit button.
- Open `/auth/signin` and sign in with valid credentials. After Supabase confirms, the browser lands on `/dashboard` (FR-001 → FR-002 hand-off).
- Open `/dashboard` while signed out. The browser is redirected to `/auth/signin` (middleware unchanged).
- Render check on mobile width (≤375px): the form fits within the viewport, the radio options stack vertically and remain tappable, and the submit button is full-width. Matches the existing SignInForm look-and-feel.

**Implementation Note**: After completing Phase 2 and all automated verification passes, pause here for manual confirmation that the end-to-end flow (sign in → land on dashboard → set / change level) feels right before marking S-01 complete.

---

## Testing Strategy

### Unit Tests

No automated unit tests — the repo has no test runner (AGENTS.md). The zod schema and the `toCurrentLevel` helper are the most test-worthy units; in this slice they are validated by manual smoke tests (Phase 1 manual step "submit `level=unknown`") and by the build's type-check pass. Adding a test runner is out of scope for S-01.

### Integration Tests

Not applicable — no test runner. The end-to-end flow is validated manually in Phase 2's success criteria.

### Manual Testing Steps

1. Start local Supabase (`npx supabase start`) and the dev server (`npm run dev`) in the user's own terminal. Run `npx supabase db reset --local` if needed to ensure the F-01 migration is applied.
2. Sign up as a fresh parent at `/auth/signup` (dev mode auto-confirms email). Then sign in at `/auth/signin`.
3. Confirm the redirect lands on `/dashboard` (Phase 1, step 2.10 above) and that the form renders in onboarding state.
4. Submit the form with `displayName = "Rafcio"` and `level = "Nie wiem — zacznij od najprostszego"`. Confirm `children` row in Studio with `current_level = NULL`.
5. Update `level` to "Sylaby" and re-submit. Confirm Studio row has `current_level = 'syllables'`.
6. Change `displayName` to a long string (>80 chars) and submit. Confirm inline error renders and no request goes out.
7. Sign out via the top bar (existing sign-out endpoint untouched). Confirm `/dashboard` redirects to `/auth/signin`.
8. Sign in again. Confirm the form pre-fills with the persisted child profile (no flash of empty state).

## Performance Considerations

- At MVP scale (PRD `target_scale.users = small`, `qps = low`), the slice's two Supabase round-trips (`getMyChild` on every `/dashboard` render, `upsertMyChild` on every form submit) are well within Supabase's free-tier envelope. The `children` table has a unique index on `parent_user_id` (F-01) so `getMyChild` is an indexed point lookup.
- The form is a React island with `client:load` (matches existing auth forms). The hydration cost is identical to `SignInForm`/`SignUpForm` — small, two `useState`s and a `<form>`.

## Migration Notes

- **No DB migration.** F-01 already established the schema.
- **No rollback complexity.** Revert the slice's commits to remove the endpoint, the components, and the redirect change. Any `children` rows created during testing are deletable via Studio or `delete from children where parent_user_id = '…'` (RLS-protected to that parent).
- **Cloudflare Workers deploy considerations.** The endpoint is SSR (`prerender = false`), so it runs in the worker runtime. zod is small and bundles cleanly in Cloudflare Workers. No edge-case import is introduced.

## References

- Roadmap entry: `context/foundation/roadmap.md` (§ "S-01: Logowanie i poziom dziecka").
- PRD requirements: `context/foundation/prd.md` (US-01, FR-001, FR-002, Access Control).
- F-01 shipped schema: `supabase/migrations/20260526143400_reading_domain_schema.sql` (children table, RLS, `is_my_child`).
- F-01 plan & brief: `context/changes/reading-domain-schema/plan.md`, `context/changes/reading-domain-schema/plan-brief.md`.
- Auth pattern templates: `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`, `src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx`.
- Middleware (untouched): `src/middleware.ts`.
- Repo conventions: `AGENTS.md`, `CLAUDE.md`.
- GitHub issue: [#8](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/8).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `.cursor/skills/10x-plan/references/progress-format.md`.

### Phase 1: Backend — child profile API, zod schemas, service helper, sign-in redirect

#### Automated

- [x] 1.1 `zod` listed under `dependencies` in `package.json` — a962345
- [x] 1.2 `src/lib/reading-level-form.ts`, `src/lib/schemas/child.ts`, `src/lib/services/children.ts`, `src/pages/api/children.ts` all exist and `npx astro sync` exits 0 — a962345
- [x] 1.3 `src/pages/api/auth/signin.ts` success path redirects to `/dashboard` — a962345
- [x] 1.4 `src/pages/api/children.ts` exports `const prerender = false;` and `const POST` — a962345
- [x] 1.5 `npm run lint` passes — a962345
- [x] 1.6 `npm run build` passes — a962345

#### Manual

- [x] 1.7 Sign-in success redirects to `/dashboard` (not `/`) — a962345
- [x] 1.8 `POST /api/children` with valid name + level inserts a row and redirects to `/dashboard` — a962345
- [x] 1.9 Re-submitting `POST /api/children` updates the existing row (no 23505 surfacing) — a962345
- [x] 1.10 `POST /api/children` with `level=unknown` writes `current_level = NULL` — a962345
- [x] 1.11 `POST /api/children` with empty displayName redirects to `/dashboard?error=…` — a962345
- [x] 1.12 Unauthenticated `POST /api/children` redirects to `/auth/signin` — a962345

### Phase 2: Frontend — dashboard becomes the child-profile home

#### Automated

- [x] 2.1 `src/components/child/ReadingLevelField.tsx` and `src/components/child/ChildProfileForm.tsx` exist and compile
- [x] 2.2 `src/pages/dashboard.astro` imports `ChildProfileForm` and `getMyChild` and hydrates the island via `client:load`
- [x] 2.3 `npm run lint` passes
- [x] 2.4 `npm run build` passes
- [x] 2.5 `npx astro sync` passes

#### Manual

- [x] 2.6 First-time parent sees onboarding form (empty name, "Nie wiem" pre-selected)
- [x] 2.7 Submitting valid form persists child and renders form pre-filled on reload
- [x] 2.8 Changing level from `unknown` to a concrete enum value persists and renders correctly
- [x] 2.9 Changing level back to `unknown` writes `NULL` and pre-selects "Nie wiem" on reload
- [x] 2.10 Client-side validation blocks empty `displayName` without a network call
- [x] 2.11 Server-side validation path (JS disabled) renders error banner on `/dashboard?error=…`
- [x] 2.12 Sign-in → `/dashboard` integration (FR-001 → FR-002 hand-off) works end-to-end
- [x] 2.13 Mobile width (≤375px) renders form correctly with stacked radios
