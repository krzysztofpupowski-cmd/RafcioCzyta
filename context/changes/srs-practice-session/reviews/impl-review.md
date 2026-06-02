<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: SRS Practice Session (S-04)

- **Plan**: context/changes/srs-practice-session/plan.md
- **Scope**: Phases 1–2 (full plan, all Progress complete)
- **Date**: 2026-06-02
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 6 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Automated verification (re-run 2026-06-02)

| Command           | Result |
| ----------------- | ------ |
| `npx astro sync`  | PASS   |
| `npm run lint`    | PASS   |
| `npm run build`   | PASS   |

## Findings

### F1 — No server-side session queue enforcement

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/practice-session.ts
- **Detail**: Optional queue guard not implemented; crafted review can update any accepted child card while session open. Plan L111 marks guard optional.
- **Fix A ⭐**: Accept at MVP; document in plan addendum.
- **Decision**: ACCEPTED-MVP (Fix A) — plan addendum added

### F2 — Non-atomic SRS update and practice_attempts insert

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/practice-session.ts:150–174
- **Detail**: Update and insert are separate calls; insert failure after update desyncs audit trail.
- **Fix**: Defer for MVP.
- **Decision**: ACCEPTED-MVP (Fix A)

### F3 — Duplicate review race

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/practice-session.ts:108–121
- **Detail**: Read-then-write duplicate check; no unique DB constraint on (session_id, flashcard_id).
- **Fix**: Defer for MVP; UI disables during pendingAction.
- **Decision**: ACCEPTED-MVP (Fix A)

### F4 — Practice due-count errors silent; wrong initialError

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dashboard.astro:58–64, 119
- **Detail**: countDueCards failure only logged; island gets flashcardFetchError not practice-specific error.
- **Fix**: Add practiceFetchError and pass to PracticeSessionCard.
- **Decision**: SKIPPED

### F5 — endSession failure after final review stuck UI

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Reliability
- **Location**: src/components/practice/PracticeSessionCard.tsx:141–155
- **Detail**: Last-card path awaited end before complete; end failure left active phase despite saved reviews.
- **Fix**: Transition to complete on review success; non-blocking warning if end fails.
- **Decision**: FIXED

### F6 — Unplanned SSR/hydration files in commit range

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: astro.config.mjs, auth signin/signup pages
- **Detail**: Infrastructure changes not in original phase list; support PracticeSessionCard SSR.
- **Fix A ⭐**: Document in plan addendum.
- **Decision**: DOCUMENTED (Fix A) — plan addendum added

### F7 — Dead export PRACTICE_ERROR_CARD_NOT_IN_SESSION

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/practice-session.ts:20
- **Detail**: Constant exported but never thrown.
- **Fix**: Remove unused export or wire with queue guard.
- **Decision**: SKIPPED

### F8 — Missing flashcard maps to session-not-found message

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Reliability
- **Location**: src/lib/services/practice-session.ts:135–136
- **Detail**: Missing flashcard throws SESSION_NOT_FOUND; misleading Polish copy in API.
- **Fix**: Distinct error constant + API mapping.
- **Decision**: SKIPPED
