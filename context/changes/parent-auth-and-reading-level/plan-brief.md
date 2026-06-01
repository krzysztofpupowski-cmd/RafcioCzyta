# Parent Auth & Reading Level (S-01) — Plan Brief

> Full plan: `context/changes/parent-auth-and-reading-level/plan.md`

## What & Why

Light up the first user-visible flow of RafcioCzyta: an authenticated parent creates exactly one child profile (display name + reading level) on `/dashboard`, with FR-002's "Nie wiem — najprostszy start" as a first-class fifth radio option that maps to `current_level = NULL`. The same form on `/dashboard` lets the parent change the level later. This is the slice that converts the F-01 schema into something a parent can actually see and use — the entry point of Stream A and the prerequisite for AI flashcard generation (S-02).

## Starting Point

The repo already ships Supabase cookie auth (sign-in / sign-up / sign-out endpoints, React form islands, middleware that protects `/dashboard`) and the F-01 schema (`public.children` with nullable `current_level`, RLS, unique index `children_one_per_parent_idx`). `/dashboard` is currently a placeholder "Welcome, {user.email}" card with a sign-out button — no domain content. Sign-in lands users on `/`, not `/dashboard`. `zod` is referenced in AGENTS.md but is not yet a direct project dependency.

## Desired End State

A logged-in parent visiting `/dashboard` sees the child-profile form: empty in onboarding state, pre-filled in edit state. Submitting it creates or updates a `children` row scoped to their `auth.users.id`. "Nie wiem" sets `current_level = NULL`; any concrete radio sets the matching enum value. Sign-in lands on `/dashboard` instead of `/`. No schema changes, no middleware changes, no new routes.

## Key Decisions Made

| Decision                             | Choice                                                                                                                  | Why (1 sentence)                                                                                                                                                       | Source |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Onboarding placement                 | Merged into `/dashboard` (conditional UI based on whether a child row exists)                                           | Avoids a `/onboarding` route; `/dashboard` becomes the canonical authenticated home with one form that handles both create and update.                                 | Plan   |
| Profile fields                       | `display_name` + `reading_level` (no birth year, no age)                                                                | PRD FR-002 only requires reading level; name is the minimum humanizing field a parent expects.                                                                         | Plan   |
| FR-002 "Nie wiem" UI                 | Fifth explicit radio option ("Nie wiem — zacznij od najprostszego") that the API normalizes to `current_level = NULL`   | Honors F-01's nullable column decision without introducing a fifth enum value; user sees a clear safe-start affordance.                                                | Plan   |
| Post-sign-in redirect                | `/dashboard` always (`signin.ts` change from `/` to `/dashboard`)                                                       | One-line change that turns FR-001 + FR-002 into a single continuous flow; no `?next=` plumbing needed.                                                                 | Plan   |
| Middleware enforcement when no child | None — `/dashboard` renders the onboarding form inline; middleware untouched                                            | `/dashboard` is the only protected route in this slice and its primary UI is the form, so the user cannot accidentally skip FR-002 without leaving the protected area. | Plan   |
| Level change UX                      | Same form on `/dashboard`, pre-filled with current values; submit upserts                                               | One component for create + update keeps the diff small and reuses every line of validation; no separate "edit mode" toggle to ship in S-01.                            | Plan   |
| Validation                           | zod on the API route (source of truth) + matching client-side validation in the React island                            | Mirrors the existing `SignInForm`/`SignUpForm` pattern and satisfies AGENTS.md's "validate with zod" rule.                                                             | Plan   |
| API contract                         | Form-encoded `POST /api/children`, redirect-style (303 back to `/dashboard` on success or with `?error=…` on failure)   | Identical pattern to `/api/auth/{signin,signup,signout}`; the React form needs no `fetch()` wrapper.                                                                   | Plan   |
| Insert-vs-update routing             | Server reads `children where parent_user_id = auth.uid()`, then picks `update` or `insert`; catches `23505` as fallback | Explicit read-then-write matches the auth-route style and surfaces the single-child rule clearly; `.upsert()` would also work but hides the choice.                    | Plan   |
| Localization                         | Polish copy for the child-profile form; auth forms stay English (pre-existing)                                          | Slice is parent-facing in Polish per PRD; aligning auth-form copy is out of scope.                                                                                     | Plan   |

## Scope

**In scope:**

- New zod dependency in `package.json`.
- New `src/lib/schemas/child.ts` (form payload schema + `toCurrentLevel` helper).
- New `src/lib/services/children.ts` (`getMyChild` + `upsertMyChild`).
- New `src/pages/api/children.ts` (form-encoded POST endpoint).
- New `src/components/child/ReadingLevelField.tsx` and `src/components/child/ChildProfileForm.tsx`.
- Rewrite of `src/pages/dashboard.astro` to fetch the child server-side and render the form.
- One-line change in `src/pages/api/auth/signin.ts` (redirect target `/` → `/dashboard`).

**Out of scope:**

- Any schema change — F-01 covers everything.
- Multi-child support (lifting the unique index is a future migration).
- `/onboarding` route — onboarding is `/dashboard`'s empty state.
- Middleware changes — `PROTECTED_ROUTES` stays as-is.
- `?next=` deep-link redirect plumbing.
- Flashcard generation, batch acceptance, practice, mastery (S-02..S-05).
- Automated test runner — none configured per AGENTS.md.
- Rebrand of `/` landing page or auth forms' English copy.

## Architecture / Approach

Two phases that decouple cleanly. Phase 1 ships the backend in isolation — zod, the schemas module, the service module, the API endpoint, and the sign-in redirect — verifiable end-to-end via Studio and curl with no UI. Phase 2 builds two React components in `src/components/child/` and rewires `/dashboard` to server-fetch the parent's child row and render `<ChildProfileForm initialChild={child} client:load />`. Data flow: middleware resolves `context.locals.user` → `/dashboard.astro` fetches the child via the service module → React island renders form with initial state → form submits form-encoded to `/api/children` → endpoint validates with zod, normalizes `"unknown"` to `null`, calls `upsertMyChild` → redirect back to `/dashboard`. RLS on `public.children` (`parent_user_id = auth.uid()`) is the only authorization layer and the security backstop — the endpoint never echoes a client-supplied `parent_user_id`.

## Phases at a Glance

| Phase                                               | What it delivers                                                                                                                                                | Key risk                                                                                                                                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Backend — API, schemas, service, signin redirect | zod dependency + schemas + service + `POST /api/children` + signin redirect change; verifiable via curl + Studio.                                               | Wiring `"unknown"` → `null` incorrectly anywhere in the chain (zod, service, or DB) breaks FR-002's safe-start option silently — a row gets written with the wrong level.                |
| 2. Frontend — dashboard + React island              | New `ReadingLevelField` and `ChildProfileForm` components + rewritten `/dashboard.astro` that server-fetches the child and hydrates the form via `client:load`. | Reading initial state from `initialChild` incorrectly — flash of onboarding-state UI for parents who already have a child, or `null` displayed as the literal string "null" in the form. |

**Prerequisites:**

- F-01 is `done` — `children` table + RLS + DTOs are live.
- Docker / Supabase running locally for manual checks (`npx supabase start`, `npx supabase db reset --local` if needed — both run in the user's terminal, not the agent's).
- `.env` or `.dev.vars` populated with `SUPABASE_URL` and `SUPABASE_KEY`.

**Estimated effort:** ~1–2 evening sessions, ~3–5 hours including manual end-to-end verification across sign-in → onboarding → level update → "Nie wiem" → mobile-width check.

## Open Risks & Assumptions

- **App-layer responsibility for the "accepted at level → practice" invariant carries forward.** F-01 deliberately did not enforce it in the DB; S-01 does not touch practice but it does cement the user's level choice. Any later slice that filters flashcards by level must read `children.current_level` (with `null` ⇒ start from `letters` per F-01 §"Critical Implementation Details").
- **Single-child rule (`children_one_per_parent_idx`) is assumed stable.** Lifting it later requires this slice's form to grow a child-selector; not a blocker today.
- **zod version pin** — picking the most recent stable line is intentional; if a follow-up slice needs a different zod major, the migration is straightforward (no zod-specific code outside the new schemas module).
- **Race-condition fallback (`23505` → update) is defensive, not load-bearing.** Real-world parents can't double-submit fast enough for it to fire; it exists so a bug in the read-then-write path does not surface as a 500.

## Success Criteria (Summary)

- A parent can sign in (FR-001), land on `/dashboard`, set their child's reading level — including the "Nie wiem" safe start — and see the saved profile pre-filled on reload (FR-002).
- The same `/dashboard` form lets the parent change the level later, with "Nie wiem" round-tripping cleanly as `current_level = NULL`.
- `npm run lint` and `npm run build` pass; no changes outside the slice's listed files; no middleware changes; no schema changes; the next slice (S-02) inherits a stable `children` row to drive flashcard generation against.
