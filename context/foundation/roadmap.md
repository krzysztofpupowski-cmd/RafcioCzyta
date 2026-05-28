---
project: "RafcioCzyta"
version: 1
status: draft
created: 2026-05-25
updated: 2026-05-28
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

**S-05: Prosty wskaźnik opanowania po ćwiczeniach** — domyka US-01 end-to-end: poziom → generacja → akceptacja partiami → ćwiczenie w gotowym SRS → widoczny postęp. To jest moment, w którym główne kryterium sukcesu PRD (*„rodzic akceptuje co najmniej 75% fiszek, dziecko ćwiczy zaakceptowany materiał”*) ma sens produktowy, nie tylko techniczny.

> **Gwiazda przewodnia** — najmniejszy pełny przepływ widoczny dla rodzica, który udowadnia, że hipoteza produktu działa: materiał na właściwym poziomie, pod kontrolą rodzica, trafia do realnych ćwiczeń. Umieszczona tak wcześnie, jak pozwalają zależności; reszta roadmapy jest ważna tylko wtedy, gdy ta ścieżka dojdzie do końca.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| F-01 | reading-domain-schema | (foundation) schemat domeny: poziom, fiszki, status akceptacji, postęp ćwiczeń | — | Access Control, Business Logic | done |
| F-02 | llm-flashcard-provider | (foundation) generacja fiszek przez skonfigurowanego dostawcę AI | F-01 | NFR (generacja <10 s) | blocked |
| F-03 | srs-adapter | (foundation) zaakceptowane fiszki synchronizują się z gotowym algorytmem powtórek | F-01 | Non-Goals (bez własnego SRS) | blocked |
| S-01 | parent-auth-and-reading-level | zalogować się i ustawić poziom dziecka (w tym „nie wiem / najprostszy start”) | F-01 | US-01, FR-001, FR-002 | ready |
| S-02 | ai-flashcard-generation | wygenerować partię fiszek dopasowanych do wybranego poziomu | F-01, F-02, S-01 | US-01, FR-003 | blocked |
| S-03 | batch-flashcard-acceptance | zaakceptować lub odrzucić partię propozycji AI i przeglądać przygotowane oraz zaakceptowane fiszki | S-02 | US-01, FR-004, FR-005 | proposed |
| S-04 | srs-practice-session | uruchomić prostą sesję ćwiczeń na zaakceptowanych fiszkach w gotowym SRS | S-03, F-03 | US-01, FR-006, NFR (sesja <10 min) | blocked |
| S-05 | mastery-indicator | zobaczyć prosty wskaźnik opanowania materiału wynikający z powtórek | S-04 | US-01, FR-007 | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
|---|---|---|---|
| A | Konto i dane | `F-01` → `S-01` | `speed`: najpierw trwały poziom i konto, bez tego reszta nie ma sensu. |
| B | Materiał AI | `F-02` → `S-02` → `S-03` | Dołącza do A po `S-01` (poziom jako wejście generacji). |
| C | Ćwiczenia i postęp | `F-03` → `S-04` → `S-05` | Dołącza do B po `S-03` (zaakceptowane fiszki); `S-05` to gwiazda przewodnia. |

## Baseline

What's already in place in the codebase as of `2026-05-25` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — per tech-stack.md: Astro 6 SSR + React 19 + Tailwind 4
- **Backend / API:** present — per tech-stack.md: Astro API routes (`src/pages/api/`)
- **Data:** partial — Supabase client (`src/lib/supabase.ts`); brak migracji i tabel domenowych (fiszki, poziom, postęp)
- **Auth:** present — per tech-stack.md: Supabase cookie auth (`src/middleware.ts`, `src/pages/api/auth/`)
- **Deploy / infra:** present — per tech-stack.md: Cloudflare Workers + `.github/workflows/ci.yml`
- **Observability:** partial — `wrangler.jsonc` observability; brak Sentry/otel w aplikacji

## Foundations

### F-01: Schemat domeny nauki czytania

- **Outcome:** (foundation) tabele i polityki RLS na poziom czytania, fiszki (szkic / zaakceptowane / odrzucone), sesje ćwiczeń i zapis postępu między sesjami.
- **Change ID:** reading-domain-schema
- **PRD refs:** Access Control, Business Logic, FR-002, FR-004, FR-006, FR-007
- **Unlocks:** S-01, S-02, S-03, S-04, S-05; reguła „tylko zaakceptowany materiał na poziomie dziecka trafia do ćwiczeń”
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
- **Unknowns:**
  - Który dostawca LLM (klucz API, polityka prywatności danych dziecka w promptach)? — Owner: user. Block: yes.
- **Risk:** Jakość fiszek decyduje o 75% akceptacji — opóźnienie wyboru dostawcy blokuje cały Stream B.
- **Status:** blocked

### F-03: Adapter gotowego algorytmu powtórek

- **Outcome:** (foundation) zaakceptowane fiszki trafiają do zewnętrznego SRS; aplikacja odczytuje stan powtórek na potrzeby sesji i wskaźnika.
- **Change ID:** srs-adapter
- **PRD refs:** Non-Goals (bez własnego SRS), FR-006, FR-007
- **Unlocks:** S-04, S-05
- **Prerequisites:** F-01
- **Parallel with:** F-02 (po F-01)
- **Blockers:** —
- **Unknowns:**
  - Który gotowy algorytm / biblioteka SRS (np. gotowa biblioteka FSRS vs zewnętrzne API)? — Owner: user. Block: yes.
- **Risk:** PRD wyklucza własny SRS — zła decyzja integracji poświęca tydzień po godzinach; trzeba domknąć przed `S-04`.
- **Status:** blocked

## Slices

### S-01: Logowanie i poziom dziecka

- **Outcome:** user can zalogować się na konto rodzica i ustawić poziom czytania dziecka, w tym opcję „nie wiem / najprostszy start”.
- **Change ID:** parent-auth-and-reading-level
- **PRD refs:** US-01, FR-001, FR-002
- **Prerequisites:** F-01
- **Parallel with:** F-02 (po F-01)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Auth jest w baseline — ryzyko to duplikacja scaffoldu zamiast podpięcia poziomu pod nowy schemat.
- **Status:** ready

### S-02: Generacja fiszek przez AI

- **Outcome:** user can wygenerować partię fiszek dopasowanych do wybranego poziomu czytania dziecka.
- **Change ID:** ai-flashcard-generation
- **PRD refs:** US-01, FR-003
- **Prerequisites:** F-01, F-02, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Przy `speed` pokusa skrócenia promptów pod NFR <10 s kosztem trafności — guardrail PRD (materiał nie powyżej poziomu) musi zostać w logice, nie tylko w prompcie.
- **Status:** blocked

### S-03: Akceptacja partiami i przegląd fiszek

- **Outcome:** user can zaakceptować lub odrzucić partię fiszek AI i przeglądać przygotowane oraz zaakceptowane fiszki bez pełnej edycji treści.
- **Change ID:** batch-flashcard-acceptance
- **PRD refs:** US-01, FR-004, FR-005, Business Logic
- **Prerequisites:** S-02
- **Parallel with:** F-03 (gdy F-01 gotowe — wybór SRS nie blokuje UI akceptacji)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** To jest bramka zaufania rodzica — bez partii akceptacji produkt łamie regułę biznesową z PRD.
- **Status:** proposed

### S-04: Sesja ćwiczeń w gotowym SRS

- **Outcome:** user can uruchomić prostą sesję ćwiczeń na zaakceptowanych fiszkach w gotowym algorytmie powtórek (sesja <10 min).
- **Change ID:** srs-practice-session
- **PRD refs:** US-01, FR-006, NFR (sesja <10 min, mobile)
- **Prerequisites:** S-03, F-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Główne ryzyko techniczne MVP (sukces FR-006) — przy `time` nie rozszerzać sesji poza prosty tryb.
- **Status:** blocked

### S-05: Wskaźnik opanowania materiału

- **Outcome:** user can zobaczyć prosty wskaźnik opanowania materiału wynikający z powtórek (nie precyzyjna diagnoza czytania).
- **Change ID:** mastery-indicator
- **PRD refs:** US-01, FR-007
- **Prerequisites:** S-04
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Przy `speed` trzymać metrykę prostą (np. odsetek „opanowanych” fiszek w SRS), bez rozbudowy analityki.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | GitHub | Ready for `/10x-plan` | Notes |
|---|---|---|---|---|---|
| F-01 | reading-domain-schema | Schemat Supabase: poziom, fiszki, postęp | [#5](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/5) | done | Zakończone 2026-05-27 — odblokowało Stream A (S-01 → ready) |
| F-02 | llm-flashcard-provider | Integracja LLM do generacji fiszek | [#6](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/6) | no | Wymaga wyboru dostawcy AI (Open Roadmap Q #2) |
| F-03 | srs-adapter | Adapter gotowego SRS | [#7](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/7) | no | Wymaga wyboru SRS (Open Roadmap Q #1) |
| S-01 | parent-auth-and-reading-level | Poziom dziecka po zalogowaniu | [#8](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/8) | yes | F-01 gotowe — następny w kolejce (Stream A) |
| S-02 | ai-flashcard-generation | Generacja partii fiszek AI | [#9](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/9) | no | Po F-02 + S-01 |
| S-03 | batch-flashcard-acceptance | Akceptacja partiami i lista fiszek | [#10](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/10) | no | Po S-02 |
| S-04 | srs-practice-session | Sesja ćwiczeń na zaakceptowanych fiszkach | [#11](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/11) | no | Po F-03 + S-03 |
| S-05 | mastery-indicator | Prosty wskaźnik opanowania | [#12](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/12) | no | Po S-04; gwiazda przewodnia US-01 |

## GitHub Issues

Migrated from this roadmap on 2026-05-25. Filter: [`label:roadmap`](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues?q=label%3Aroadmap).

| Roadmap ID | Issue | URL |
|---|---|---|
| Q-SRS | #3 | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/3 |
| Q-LLM | #4 | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/4 |
| F-01 | #5 | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/5 |
| F-02 | #6 | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/6 |
| F-03 | #7 | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/7 |
| S-01 | #8 | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/8 |
| S-02 | #9 | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/9 |
| S-03 | #10 | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/10 |
| S-04 | #11 | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/11 |
| S-05 | #12 | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/12 |
| P-voice | #13 | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/13 |
| P-editor | #14 | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/14 |
| P-custom-srs | #15 | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/15 |
| P-worksheets | #16 | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/16 |
| P-observability | #17 | https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/17 |

## Open Roadmap Questions

1. **Który gotowy algorytm / biblioteka powtórek (SRS) integrujemy w MVP?** — Owner: user. Block: F-03, S-04 (`roadmap-wide` dla ćwiczeń).
2. **Który dostawca LLM generuje fiszki i jak traktujemy dane dziecka w promptach?** — Owner: user. Block: F-02, S-02.

## Parked

- **Sprawdzanie wymowy głosem** — Why parked: PRD §Non-Goals (ocena odczytu poza MVP).
- **Pełny edytor treści fiszek** — Why parked: PRD §Non-Goals; shape-notes §Forward: product-roadmap.
- **Własny algorytm powtórek** — Why parked: PRD §Non-Goals; zaakceptowane fiszki → gotowy SRS.
- **Automatyczne karty pracy** — Why parked: shape-notes §Forward: product-roadmap (poza MVP).
- **Głęboka observability (Sentry, metryki aplikacji)** — Why parked: `speed` + baseline partial wystarczy na start; NFR nie wymaga APM w MVP.

## Done

| ID | Change ID | Completed | GitHub | Notes |
|---|---|---|---|---|
| F-01 | reading-domain-schema | 2026-05-27 | [#5](https://github.com/krzysztofpupowski-cmd/RafcioCzyta/issues/5) | Migracja + RLS + typy + impl-review (F1/F2/F3 fixed). Odblokowało S-01. Folder zmiany: `context/changes/reading-domain-schema/` (jeszcze nie zarchiwizowany). |
