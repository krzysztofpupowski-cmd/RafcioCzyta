---
project: "RafcioCzyta"
version: 1
status: draft
created: 2026-05-25
updated: 2026-06-02
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: RafcioCzyta

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Tradycyjna nauka czytania nie nadąża za tempem dziecka, które potrzebuje szybkiego poczucia postępu — zanim książki staną się atrakcyjne, wygrywa telefon. Aplikacja ma dostarczać rodzicowi fiszki dopasowane do poziomu dziecka, ale tylko po akceptacji rodzica — żeby materiał nie był ani za nudny, ani za trudny.

## North star

**Achieved (2026-06-02): S-05 — Prosty wskaźnik opanowania po ćwiczeniach** — domknął US-01 end-to-end: poziom → generacja → akceptacja partiami → ćwiczenie w gotowym SRS → widoczny postęp (`MasteryIndicatorCard`, live FSRS retrievability ≥90%). Główne kryterium sukcesu PRD (_„rodzic akceptuje co najmniej 75% fiszek, dziecko ćwiczy zaakceptowany materiał"_) ma teraz pełną ścieżkę produktową na `/dashboard`.

> **Gwiazda przewodnia** — najmniejszy pełny przepływ widoczny dla rodzica; **zrealizowany** w S-05. Kolejna praca: post-MVP z PRD §Non-Goals / Parked (nie nowe slice’y w tej tabeli).

## At a glance

| ID   | Change ID                     | Outcome (user can …)                                                                               | Prerequisites    | PRD refs                           | Status   |
| ---- | ----------------------------- | -------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------- | -------- |
| F-01 | reading-domain-schema         | (foundation) schemat domeny: poziom, fiszki, status akceptacji, postęp ćwiczeń                     | —                | Access Control, Business Logic     | done     |
| F-02 | llm-flashcard-provider        | (foundation) generacja fiszek przez skonfigurowanego dostawcę AI                                   | F-01             | NFR (generacja <10 s)              | done     |
| F-03 | srs-adapter                   | (foundation) zaakceptowane fiszki synchronizują się z gotowym algorytmem powtórek                  | F-01             | Non-Goals (bez własnego SRS)       | done     |
| S-01 | parent-auth-and-reading-level | zalogować się i ustawić poziom dziecka (w tym „nie wiem / najprostszy start")                      | F-01             | US-01, FR-001, FR-002              | done     |
| S-02 | ai-flashcard-generation       | wygenerować partię fiszek dopasowanych do wybranego poziomu                                        | F-01, F-02, S-01 | US-01, FR-003                      | done     |
| S-03 | batch-flashcard-acceptance    | zaakceptować lub odrzucić partię propozycji AI i przeglądać przygotowane oraz zaakceptowane fiszki | S-02             | US-01, FR-004, FR-005              | done     |
| S-04 | srs-practice-session          | uruchomić prostą sesję ćwiczeń na zaakceptowanych fiszkach w gotowym SRS                           | S-03, F-03       | US-01, FR-006, NFR (sesja <10 min) | done     |
| S-05 | mastery-indicator             | zobaczyć prosty wskaźnik opanowania materiału wynikający z powtórek                                | S-04             | US-01, FR-007                      | done     |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme              | Chain                    | Note                                                                                         |
| ------ | ------------------ | ------------------------ | -------------------------------------------------------------------------------------------- |
| A      | Konto i dane       | `F-01` → `S-01`          | `S-01` done (2026-05-28) — poziom i konto gotowe.                                            |
| B      | Materiał AI        | `F-02` → `S-02` → `S-03` | `S-03` done (2026-06-01) — akceptacja partiami live; Stream B kompletny. |
| C      | Ćwiczenia i postęp | `F-03` → `S-04` → `S-05` | `S-05` done (2026-06-02) — wskaźnik opanowania na `/dashboard` (`GET /api/mastery/summary` + `MasteryIndicatorCard`); Stream C i gwiazda przewodnia US-01 kompletne. |

## Baseline

What's already in place in the codebase as of `2026-05-25` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — per tech-stack.md: Astro 6 SSR + React 19 + Tailwind 4
- **Backend / API:** present — per tech-stack.md: Astro API routes (`src/pages/api/`)
- **Data:** partial — Supabase client + migracja F-01 (`children`, fiszki, postęp); S-01 profil dziecka; S-02 generacja draftów; S-03 akceptacja/odrzucenie partii + listy na `/dashboard`; F-03 `ts-fsrs` adapter (`srs_state`, `next_review_at`) + per-card SRS init on accept; S-04 `practice_sessions` / `practice_attempts` writes + due-queue practice on `/dashboard`; S-05 live mastery summary (retrievability ≥90% at `current_level`) + client refetch po ćwiczeniu/akceptacji
- **Auth:** present — Supabase cookie auth; sign-in ląduje na `/dashboard` z formularzem poziomu dziecka (S-01)
- **Deploy / infra:** present — per tech-stack.md: Cloudflare Workers + `.github/workflows/ci.yml`
- **Observability:** partial — `wrangler.jsonc` observability; brak Sentry/otel w aplikacji

## Foundations

### F-01: Schemat domeny nauki czytania

- **Outcome:** (foundation) tabele i polityki RLS na poziom czytania, fiszki (szkic / zaakceptowane / odrzucone), sesje ćwiczeń i zapis postępu między sesjami.
- **Change ID:** reading-domain-schema
- **PRD refs:** Access Control, Business Logic, FR-002, FR-004, FR-006, FR-007
- **Unlocks:** S-01, S-02, S-03, S-04, S-05; reguła „tylko zaakceptowany materiał na poziomie dziecka trafia do ćwiczeń"
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Bez trwałego modelu każdy kolejny slice to mocki w pamięci — przy `time` to największy ukryty koszt; sequencja zaczyna tutaj świadomie.
- **Completed:** 2026-05-27 — migracja `20260526143400_reading_domain_schema.sql` (5 tabel + 3 enumy + 20 polityk RLS), `src/db/database.types.ts` + `src/types.ts` po stronie aplikacji. Impl-review (F1/F2/F3) zamknięty — patrz `context/changes/reading-domain-schema/reviews/impl-review.md`.
- **Status:** done

### F-02: Dostawca AI do generacji fiszek

- **Outcome:** (foundation) wywołanie modelu językowego z kontekstem poziomu dziecka zwraca partię fiszek w formacie zapisanym w F-01.
- **Change ID:** llm-flashcard-provider
- **PRD refs:** FR-003, NFR (partia fiszek do akceptacji <10 s)
- **Unlocks:** S-02
- **Prerequisites:** F-01
- **Parallel with:** F-03 (po F-01)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Jakość fiszek decyduje o 75% akceptacji — opóźnienie wyboru dostawcy blokuje cały Stream B.
- **Completed:** 2026-06-01 — `ai` + `@ai-sdk/openai` zainstalowane; `OPENAI_API_KEY` w env schema; `src/lib/services/flashcard-generation.ts` z `generateFlashcards()` (gpt-4o-mini, 8 kart, Zod, AbortSignal.timeout(9500), RLS-safe). Smoke test potwierdzony na workerd runtime. Commits: 1cc123f (p1) · e7e020c (p2) · 1a2e3fc (epilogue).
- **Status:** done

### F-03: Adapter gotowego algorytmu powtórek

- **Outcome:** (foundation) zaakceptowane fiszki trafiają do zewnętrznego SRS; aplikacja odczytuje stan powtórek na potrzeby sesji i wskaźnika.
- **Change ID:** srs-adapter
- **PRD refs:** Non-Goals (bez własnego SRS), FR-006, FR-007
- **Unlocks:** S-04, S-05
- **Prerequisites:** F-01
- **Parallel with:** F-02 (po F-01)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** PRD wyklucza własny SRS — zła decyzja integracji poświęca tydzień po godzinach; trzeba domknąć przed `S-04`.
- **Completed:** 2026-06-02 — migracja `20260602120000_flashcard_srs_state.sql`; `ts-fsrs` + `src/lib/services/srs-adapter.ts` + `src/lib/schemas/srs.ts`; `acceptBatch` per-card SRS init + `backfillAcceptedCardsWithoutSrs`. Commits: 1fd6c10 (p1) · 677d269 (p2) · a00a2df (p3) · 83ee8ae (epilogue).
- **Status:** done

## Slices

### S-01: Logowanie i poziom dziecka

- **Outcome:** user can zalogować się na konto rodzica i ustawić poziom czytania dziecka, w tym opcję „nie wiem / najprostszy start".
- **Change ID:** parent-auth-and-reading-level
- **PRD refs:** US-01, FR-001, FR-002
- **Prerequisites:** F-01
- **Parallel with:** F-02 (po F-01)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Auth jest w baseline — ryzyko to duplikacja scaffoldu zamiast podpięcia poziomu pod nowy schemat.
- **Completed:** 2026-05-28 — `/dashboard` z formularzem profilu dziecka, `POST /api/children`, sign-in → `/dashboard`, „Nie wiem" → `current_level = NULL`. Impl-review (F1–F8 triaged) zamknięty — patrz `context/changes/parent-auth-and-reading-level/reviews/impl-review.md`.
- **Status:** done

### S-02: Generacja fiszek przez AI

- **Outcome:** user can wygenerować partię fiszek dopasowanych do wybranego poziomu czytania dziecka.
- **Change ID:** ai-flashcard-generation
- **PRD refs:** US-01, FR-003
- **Prerequisites:** F-01, F-02, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Przy `speed` pokusa skrócenia promptów pod NFR <10 s kosztem trafności — guardrail PRD (materiał nie powyżej poziomu) musi zostać w logice, nie tylko w prompcie.
- **Completed:** 2026-06-01 — `POST /api/flashcards/generate` (JSON endpoint, 401/400/5xx Polish errors), `DraftFlashcardList` + `FlashcardGenerationCard` React islands na `/dashboard` (AbortController, pending state), DTO layer (`src/lib/dto/flashcards.ts`). Commits: 2d8bb02 (p1) · b5e2b0b (p2).
- **Status:** done

### S-03: Akceptacja partiami i przegląd fiszek

- **Outcome:** user can zaakceptować lub odrzucić partię fiszek AI i przeglądać przygotowane oraz zaakceptowane fiszki bez pełnej edycji treści.
- **Change ID:** batch-flashcard-acceptance
- **PRD refs:** US-01, FR-004, FR-005, Business Logic
- **Prerequisites:** S-02
- **Parallel with:** F-03 (gdy F-01 gotowe — wybór SRS nie blokuje UI akceptacji)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** To jest bramka zaufania rodzica — bez partii akceptacji produkt łamie regułę biznesową z PRD.
- **Completed:** 2026-06-01 — `POST /api/flashcards/accept|reject`, `src/lib/services/flashcards.ts`, `FlashcardDashboardCard` (tabbed Przygotowane/Zaakceptowane, SSR hydration, optimistic updates, reject confirmation). Impl-review (4 fixed / 5 skipped) — patrz `context/changes/batch-flashcard-acceptance/reviews/impl-review.md`. Commits: db9d2b5 (p1) · d628ddb (p2) · 3ca19e3 (epilogue) · 00d275c (impl-review fixes).
- **Status:** done

### S-04: Sesja ćwiczeń w gotowym SRS

- **Outcome:** user can uruchomić prostą sesję ćwiczeń na zaakceptowanych fiszkach w gotowym algorytmie powtórek (sesja <10 min).
- **Change ID:** srs-practice-session
- **PRD refs:** US-01, FR-006, NFR (sesja <10 min, mobile)
- **Prerequisites:** S-03, F-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Główne ryzyko techniczne MVP (sukces FR-006) — przy `time` nie rozszerzać sesji poza prosty tryb.
- **Completed:** 2026-06-02 — `practice-session.ts` + `POST /api/practice/{start,review,end}`; `PracticeSessionCard` na `/dashboard` (SSR due count, cap 10, FSRS ratings, hint reveal). Impl-review NEEDS ATTENTION (F5 fixed; F1–F3 accepted MVP; F4/F7/F8 skipped) — patrz `context/changes/srs-practice-session/reviews/impl-review.md`. Commits: 94d40d9 (p1) · 6af9f85 (p2) · 13b0756 (epilogue).
- **Status:** done

### S-05: Wskaźnik opanowania materiału

- **Outcome:** user can zobaczyć prosty wskaźnik opanowania materiału wynikający z powtórek (nie precyzyjna diagnoza czytania).
- **Change ID:** mastery-indicator
- **PRD refs:** US-01, FR-007
- **Prerequisites:** S-04
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Przy `speed` trzymać metrykę prostą (np. odsetek „opanowanych" fiszek w SRS), bez rozbudowy analityki.
- **Completed:** 2026-06-02 — `getMasterySummary()` + `GET /api/mastery/summary`; `MasteryIndicatorCard` na `/dashboard` (SSR + refetch via `rc-practice-complete` / `rc-flashcards-accepted`). Impl-review NEEDS ATTENTION (F1–F3 skipped) — patrz `context/changes/mastery-indicator/reviews/impl-review.md`. Commits: 3566573 (p1) · aeeeb5c (p2) · b65c13e (epilogue).
- **Status:** done

## Backlog Handoff

| Roadmap ID | Change ID                     | Suggested issue title                     | GitHub                                                                | Ready for `/10x-plan` | Notes                                                       |
| ---------- | ----------------------------- | ----------------------------------------- | --------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------- |
| F-01       | reading-domain-schema         | Schemat Supabase: poziom, fiszki, postęp  | [#5](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/5)   | done                  | Zakończone 2026-05-27 — odblokowało Stream A (S-01 → ready) |
| F-02       | llm-flashcard-provider        | Integracja LLM do generacji fiszek        | [#6](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/6)   | done                  | Zakończone 2026-06-01 — odblokowało S-02 (→ ready)          |
| F-03       | srs-adapter                   | Adapter gotowego SRS                      | [#7](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/7)   | done                  | Zakończone 2026-06-02 — `ts-fsrs`; odblokowało S-04 (→ ready) |
| S-01       | parent-auth-and-reading-level | Poziom dziecka po zalogowaniu             | [#8](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/8)   | done                  | Zakończone 2026-05-28 — odblokowało S-02 (czeka na F-02)    |
| S-02       | ai-flashcard-generation       | Generacja partii fiszek AI                | [#9](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/9)   | done                  | Zakończone 2026-06-01 — odblokowało S-03                    |
| S-03       | batch-flashcard-acceptance    | Akceptacja partiami i lista fiszek        | [#10](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/10) | done                  | Zakończone 2026-06-01 — odblokowało S-04 (czeka na F-03)     |
| S-04       | srs-practice-session          | Sesja ćwiczeń na zaakceptowanych fiszkach | [#11](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/11) | done                  | Zakończone 2026-06-02 — odblokowało S-05 (→ ready)            |
| S-05       | mastery-indicator             | Prosty wskaźnik opanowania                | [#12](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/12) | done                  | Zakończone 2026-06-02 — domknięcie US-01 / FR-007; gwiazda przewodnia osiągnięta |

## GitHub Issues

Migrated from this roadmap on 2026-05-25. Filter: [`label:roadmap`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues?q=label%3Aroadmap).

| Roadmap ID      | Issue | URL                                                            |
| --------------- | ----- | -------------------------------------------------------------- |
| Q-SRS           | #3    | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/3  |
| Q-LLM           | #4    | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/4  |
| F-01            | #5    | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/5  |
| F-02            | #6    | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/6  |
| F-03            | #7    | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/7  |
| S-01            | #8    | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/8  |
| S-02            | #9    | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/9  |
| S-03            | #10   | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/10 |
| S-04            | #11   | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/11 |
| S-05            | #12   | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/12 |
| P-voice         | #13   | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/13 |
| P-editor        | #14   | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/14 |
| P-custom-srs    | #15   | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/15 |
| P-worksheets    | #16   | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/16 |
| P-observability | #17   | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/17 |

## Open Roadmap Questions

_(Brak otwartych pytań — Q-SRS domknięte 2026-06-02: biblioteka **`ts-fsrs`** w F-03.)_

## Active Tasks

_(Brak aktywnych slice’ów roadmapy — łańcuch F-01 → S-05 zakończony 2026-06-02. Następny krok: wybrać post-MVP z PRD §Forward lub sekcji Parked poniżej.)_

## Parked

- **Sprawdzanie wymowy głosem** — Why parked: PRD §Non-Goals (ocena odczytu poza MVP).
- **Pełny edytor treści fiszek** — Why parked: PRD §Non-Goals; shape-notes §Forward: product-roadmap.
- **Własny algorytm powtórek** — Why parked: PRD §Non-Goals; zaakceptowane fiszki → gotowy SRS.
- **Automatyczne karty pracy** — Why parked: shape-notes §Forward: product-roadmap (poza MVP).
- **Głęboka observability (Sentry, metryki aplikacji)** — Why parked: `speed` + baseline partial wystarczy na start; NFR nie wymaga APM w MVP.

## Done

| ID   | Change ID                     | Completed  | GitHub                                                              | Notes                                                                                                                                                                                                        |
| ---- | ----------------------------- | ---------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F-01 | reading-domain-schema         | 2026-05-27 | [#5](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/5) | Migracja + RLS + typy + impl-review (F1/F2/F3 fixed). Odblokowało S-01. Folder zmiany: `context/changes/reading-domain-schema/` (jeszcze nie zarchiwizowany).                                                |
| S-01 | parent-auth-and-reading-level | 2026-05-28 | [#8](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/8) | Profil dziecka na `/dashboard`, API + formularz poziomu, impl-review (6 fixed / 2 skipped). Odblokowało S-02 (czeka na F-02). Folder: `context/changes/parent-auth-and-reading-level/`.                      |
| F-02 | llm-flashcard-provider        | 2026-06-01 | [#6](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/6) | `generateFlashcards()` w `src/lib/services/flashcard-generation.ts` — gpt-4o-mini, 8 kart, Zod structured output, AbortSignal.timeout(9500), RLS-safe. Smoke test na workerd potwierdzony. Odblokowało S-02. |
| S-02 | ai-flashcard-generation       | 2026-06-01 | [#9](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/9) | `POST /api/flashcards/generate` + DTO layer, `FlashcardGenerationCard` + `DraftFlashcardList` islands na `/dashboard`. Odblokowało S-03.                                                                     |
| S-03 | batch-flashcard-acceptance    | 2026-06-01 | [#10](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/10) | Accept/reject API, `FlashcardDashboardCard` tabbed review, SSR hydration, impl-review (4 fixed / 5 skipped). Odblokowało S-04 (czeka na F-03). Folder: `context/changes/batch-flashcard-acceptance/`. |
| F-03 | srs-adapter                   | 2026-06-02 | [#7](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/7) | `ts-fsrs` adapter, migracja SRS columns, per-card init on accept + backfill. Impl-review (F1 fixed). Odblokowało S-04. Folder: `context/changes/srs-adapter/`. |
| S-04 | srs-practice-session          | 2026-06-02 | [#11](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/11) | Practice API + `PracticeSessionCard` (due queue, 10-card cap, FSRS ratings). Impl-review (1 fixed / 3 accepted MVP / 3 skipped). Odblokowało S-05. Folder: `context/changes/srs-practice-session/`. |
| S-05 | mastery-indicator             | 2026-06-02 | [#12](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/12) | `GET /api/mastery/summary` + `MasteryIndicatorCard` (live FSRS ≥90%, cross-island refetch). Impl-review NEEDS ATTENTION (3 skipped). Gwiazda przewodnia US-01. Folder: `context/changes/mastery-indicator/`. |
