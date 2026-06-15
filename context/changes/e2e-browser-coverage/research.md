---
date: 2026-06-15T10:12:00+02:00
researcher: Claude Sonnet 4.6
git_commit: f27aa1c2aa44a7adac395f991069acb8a7b5268a
branch: main
repository: aiProject
topic: "E2E browser coverage gaps for risks #2 and #5 (no Vitest duplication)"
tags: [research, e2e, playwright, risk-2, risk-5, auth-redirect, deck-tabs, optimistic-ui]
status: complete
last_updated: 2026-06-15
last_updated_by: Claude Sonnet 4.6
---

# Research: E2E browser coverage gaps for risks #2 and #5

**Date**: 2026-06-15T10:12:00+02:00
**Researcher**: Claude Sonnet 4.6
**Git Commit**: f27aa1c2aa44a7adac395f991069acb8a7b5268a
**Branch**: main
**Repository**: aiProject

## Research Question

What browser-level (Playwright) scenarios for risks #2 and #5 are not and cannot be covered by the existing Vitest integration layer? Research scoped to gaps only — no duplication of what Vitest already tests.

## Summary

**Playwright infrastructure is already live and healthy** — three tests pass (setup + 2 specs). The auth-redirect gap for risk #2 is mostly covered; the remaining gaps are sign-out cookie clearing and an HTML-body leak check. Risk #5 has **zero** browser coverage and is the highest-value target: `FlashcardDashboardCard` uses `client:only="react"` with pure-`useState` optimistic updates — no list re-fetches, no URL-based tabs, no SSR for the deck UI — making every post-mutation UI transition invisible to Vitest.

---

## Detailed Findings

### Existing Playwright infrastructure

| File                                                   | Purpose                                                                                       | Status  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------- |
| `playwright.config.ts`                                 | Config: Chrome only, `storageState` auth, `npm run dev` webServer, loads `.env` + `.env.test` | Wired   |
| `tests/e2e/auth.setup.ts`                              | UI sign-in → saves `playwright/.auth/user.json`                                               | Passing |
| `tests/e2e/unauthenticated-dashboard-redirect.spec.ts` | Risk #2: GET /dashboard without cookies → redirects to sign-in                                | Passing |
| `tests/e2e/seed.spec.ts`                               | Exemplar: authenticated dashboard → child profile form → reload                               | Passing |

`test-results/.last-run.json`: `{ "status": "passed", "failedTests": [] }` — all 3 tests green.

E2E entry points in `package.json`: `test:e2e`, `test:e2e:ui`, `test:e2e:report`. **Not yet wired into CI** (only Vitest runs in `.github/workflows/ci.yml`).

Env vars required by E2E: `TEST_PARENT_A_EMAIL`, `TEST_PARENT_A_PASSWORD`, `SUPABASE_URL`, `SUPABASE_KEY` (from `.env.test`). `PLAYWRIGHT_BASE_URL` optional (default `http://localhost:4321`).

---

### Risk #2 — Unauthenticated dashboard access

#### What Vitest already covers (do not duplicate)

- `tests/middleware/protected-routes.test.ts` — middleware guard: synthetic context, unauthenticated `/dashboard` → 302 + `Location: /auth/signin`
- `tests/integration/authn-protected-apis.test.ts` — 7 representative API routes: `POST /api/children` 303, generate/mastery/practice-start/practice-review/practice-end 401 JSON
- `tests/integration/authz-rls-smoke.test.ts` — Supabase RLS prevents cross-parent reads

#### `PROTECTED_ROUTES` — complete picture

```4:4:src/middleware.ts
const PROTECTED_ROUTES = ["/dashboard"];
```

Only `/dashboard` is an SSR parent-only page. All other `.astro` pages (`/`, `/auth/signin`, `/auth/signup`, `/auth/confirm-email`) are public. API routes guard themselves per-handler. **No missing routes today.**

#### `dashboard.astro` — defense-in-depth structure

`src/pages/dashboard.astro` accesses `locals.user` at line 16. If middleware is bypassed (regression scenario), the frontmatter still runs DB queries — but with an empty `userId`, RLS returns nothing. The render branch conditionally gates all parent UI (`{authUser && …}`); a `<meta http-equiv="refresh">` fallback fires client-side if `!authUser` (line 84). Vitest cannot exercise the meta-refresh path.

#### Browser-only gaps for risk #2

| Gap                                                                                                                   | Why Vitest cannot catch it                                                                                                                  | Priority |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Sign-out → `/dashboard` redirects to sign-in**                                                                      | Vitest has no sign-out test at all; cookie-clearing requires browser cookie jar                                                             | **High** |
| **HTML body must not contain parent data** on unauthenticated `/dashboard` (raw network response, not DOM visibility) | `unauthenticated-dashboard-redirect.spec.ts` only checks heading visibility, not response body; Vitest handler tests do not render SSR HTML | Medium   |
| **Meta-refresh fallback** on `dashboard.astro:84` if middleware regresses                                             | Client-side `<meta>` execution requires browser; not observable via handler unit test                                                       | Low      |
| **Flash of protected content** before redirect                                                                        | Race between SSR HTML delivery and client-side redirect; only visible in browser                                                            | Low      |

**Current gap coverage in `unauthenticated-dashboard-redirect.spec.ts`:** heading not visible ✓, URL redirected ✓, sign-in page rendered ✓. **Missing:** network-level assertion (`page.waitForResponse`) that the `/dashboard` request returned 302/303 (not 200 with partial data).

---

### Risk #5 — Deck list wrong after accept/reject

#### What Vitest already covers (do not duplicate)

- `tests/integration/flashcards-state-machine.test.ts`:
  - Accept happy path — DB `status=accepted`, SRS columns initialized
  - Double-accept → 404
  - Reject happy path — DB `status=rejected`
  - Adversarial draft card excluded from practice queue
  - `listDraftBatches` SQL filter: draft batches visible, accepted/rejected excluded
- `tests/integration/authn-protected-apis.test.ts`: accept 401, reject 401 (cross-parent IDOR)
- `tests/integration/flashcards-generate.test.ts`: generate happy/timeout/failure/missing-key

**Not covered by any Vitest test**: `listAcceptedFlashcards` (no test references it).

#### UI architecture — why it's a pure browser problem

`FlashcardDashboardCard` (`src/components/flashcards/FlashcardDashboardCard.tsx`) uses `client:only="react"` — **the entire deck UI has no SSR HTML**. It mounts on the client with serialized Astro props:

```38:40:src/components/flashcards/FlashcardDashboardCard.tsx
const [draftBatches, setDraftBatches] = useState<DraftBatchDTO[]>(initialDraftBatches);
const [acceptedCards, setAcceptedCards] = useState<AcceptedFlashcardDTO[]>(initialAcceptedCards);
const [activeTab, setActiveTab] = useState<ActiveTab>("prepared");
```

**There is no GET list API endpoint.** `listDraftBatches` and `listAcceptedFlashcards` are service functions called only from SSR (`dashboard.astro:53-54`). Post-mutation, the component applies **optimistic local state updates only** — never re-fetches:

| Action               | State mutation                                                               | Tab switch                        |
| -------------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| Accept               | `setDraftBatches(filter out)` + `setAcceptedCards([...data.cards, ...prev])` | None — user stays on prepared tab |
| Reject               | `setDraftBatches(filter out)`                                                | None                              |
| 404 on accept/reject | `setDraftBatches(filter out)` (stale-batch cleanup, no accepted update)      | None                              |
| Generate             | `setDraftBatches(append)`                                                    | Force switch to prepared          |

**Tabs are URL-less client state** — `activeTab` resets to `"prepared"` on every full page load. No `?tab=accepted` routing exists.

**No rejected tab** — rejected batches disappear from "Przygotowane" only; there is no "Odrzucone" panel.

#### `DraftBatchPanel` two-step confirm (risk #5 UI gap)

Reject requires two clicks: "Odrzuć partię" → confirm dialog → "Potwierdź odrzucenie" or "Anuluj". This two-step flow is invisible to Vitest:

```21:84:src/components/flashcards/DraftBatchPanel.tsx
// confirming: boolean state; two-step confirm UX
```

#### Browser-only gaps for risk #5

| Gap                                                                                                       | Root cause (Vitest blind spot)                                                                                                           | Priority |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Accept flow: batch disappears from "Przygotowane", cards appear in "Zaakceptowane"**                    | `client:only` React state; no SSR HTML; no Vitest component test                                                                         | **High** |
| **Reject flow: batch disappears; two-step confirm UX works**                                              | Two-step confirm in `DraftBatchPanel` is pure client UI                                                                                  | **High** |
| **Reload consistency: lists match DB after mutations**                                                    | Only a full `page.reload()` triggers `listDraftBatches` + `listAcceptedFlashcards` SSR re-fetch; optimistic state could diverge silently | **High** |
| **Tab isolation: accept while on "Przygotowane" tab — accepted cards visible only after tab click**       | `handleAccept` sets state but does NOT call `setActiveTab("accepted")`; cards update client-state without revealing them                 | Medium   |
| **`listAcceptedFlashcards` correctness end-to-end**                                                       | Never tested by any Vitest test; only exercised via SSR re-render (reload)                                                               | Medium   |
| **Accept response card ordering diverges from reload order**                                              | Accept merges `[...data.cards, ...prev]`; SSR uses `order("updated_at", { ascending: false })`; ordering may differ                      | Medium   |
| **404 stale-batch cleanup: prepared shrinks, accepted unchanged**                                         | 404 branch removes from prepared but does not add to accepted — correct behavior but browser-only observable                             | Low      |
| **Cross-widget: mastery updates after accept (`rc-flashcards-accepted`), practice due-count stays stale** | `MasteryIndicatorCard` listens to custom event; `PracticeSessionCard` does not — only visible in browser after accept                    | Low      |
| **Empty-state strings** ("Brak fiszek oczekujących…", "Brak zaakceptowanych fiszek.")                     | Rendered only when arrays are empty; observable only after all batches accepted/rejected                                                 | Low      |

---

## Code References

- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard"]`
- `src/pages/dashboard.astro:16` — `const authUser = Astro.locals.user`
- `src/pages/dashboard.astro:53-54` — SSR calls `listDraftBatches` + `listAcceptedFlashcards`
- `src/pages/dashboard.astro:84` — meta-refresh fallback `{!authUser && <meta http-equiv="refresh" ...>}`
- `src/pages/dashboard.astro:117-124` — `<FlashcardDashboardCard client:only="react" />`
- `src/components/flashcards/FlashcardDashboardCard.tsx:38-40` — `useState` seeds from SSR props
- `src/components/flashcards/FlashcardDashboardCard.tsx:71-83` — generate optimistic append + `setActiveTab("prepared")`
- `src/components/flashcards/FlashcardDashboardCard.tsx:108-113` — accept optimistic update (no tab switch)
- `src/components/flashcards/FlashcardDashboardCard.tsx:137-138` — reject optimistic update
- `src/components/flashcards/DraftBatchPanel.tsx:21,47-84` — two-step confirm for reject
- `tests/e2e/unauthenticated-dashboard-redirect.spec.ts` — existing risk #2 spec
- `tests/e2e/auth.setup.ts` — storageState setup
- `tests/e2e/seed.spec.ts` — authenticated exemplar
- `playwright.config.ts` — baseURL, projects, webServer config
- `.env.test.example:9-10` — `TEST_PARENT_A_EMAIL` / `TEST_PARENT_A_PASSWORD`

---

## Architecture Insights

### Why risk #5 is a pure browser problem

```
dashboard.astro (SSR)
  └─ listDraftBatches() + listAcceptedFlashcards()   ← Vitest covers
       └─ passed as initialDraftBatches / initialAcceptedCards props
            └─ FlashcardDashboardCard  client:only="react"
                 └─ useState (no SSR HTML)             ← Vitest blind
                      └─ optimistic updates on accept/reject/generate
                           └─ never re-fetches lists   ← Vitest blind
```

Vitest integration tests call the API handlers directly and query the DB — they prove the server side is correct. They cannot observe that `FlashcardDashboardCard`'s `useState` will be seeded with the right data on the next SSR render or that the optimistic filter removes the right batch from the right array.

### Why `listAcceptedFlashcards` is an untested code path

No Vitest test calls `listAcceptedFlashcards` directly or exercises it through a handler (there is no GET list route). It is only invoked from `dashboard.astro:54` during SSR. Its correctness — which cards appear in the accepted tab after a page reload — is verifiable only via `page.reload()` in Playwright.

### Playwright setup is production-ready for new specs

`playwright/.auth/user.json` is regenerated each run via `auth.setup.ts`. New specs in `tests/e2e/` that use the default `chromium` project automatically get Parent A's session. Unauthenticated specs must override `storageState` with empty cookies (pattern from `unauthenticated-dashboard-redirect.spec.ts`).

---

## Historical Context (from prior changes)

- `context/changes/testing-bootstrap-auth-boundary/` — Phase 1 shipped: middleware guard, 7 API authn cases, RLS smoke, `signInAs` helper. This is the layer risk #2 browser tests must not duplicate.
- `context/changes/deck-generation-acceptance-gates/` — Phase 2 shipped: accept/reject DB state machine, LLM stub harness, adversarial draft-row exclusion. This is the server layer risk #5 browser tests complement (not replace).
- `context/changes/testing-practice-mastery-signal/` — Phase 3 shipped: practice flow + mastery. Not directly in scope but `PracticeSessionCard.initialDueCount` stale-after-accept is an adjacent observation.
- `context/changes/testing-ci-quality-gates/` — Phase 4 shipped: `npm test` in CI. E2E (`npm run test:e2e`) not yet in CI workflow.

---

## Related Research

No prior research.md in this change folder or peer changes.

---

## Open Questions

1. **Should E2E be added to CI?** Currently only Vitest runs in `.github/workflows/ci.yml`. The test-plan §5 marks e2e as "planned" for CI. A Phase 5 decision point.

2. **Need a Playwright seed fixture for flashcards?** `seed.spec.ts` only exercises child profile. Risk #5 E2E tests need a pre-existing draft batch in the test project. Options: (a) `beforeAll` generates via UI flow; (b) generate via API in setup; (c) add a Playwright fixture file with pre-seeded data using `TEST_PARENT_A_GENERATION_ID` from `.env.test`.

3. **`listAcceptedFlashcards` test coverage gap** — should a Vitest integration test be added for this function before the E2E spec, to separate server-logic bugs from browser-state bugs?

4. **`PROTECTED_ROUTES` expansion** — future parent-only pages (e.g. `/settings`, `/children/:id`) will need to be added to `PROTECTED_ROUTES`. The risk #2 E2E spec should be parameterized or a factory pattern established so new protected routes get coverage automatically.
