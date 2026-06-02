<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: SRS Adapter (F-03)

- **Plan**: context/changes/srs-adapter/plan.md
- **Scope**: All phases (1–3 of 3)
- **Date**: 2026-06-02
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Roadmap not closed out after F-03 completion

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md
- **Detail**: Plan Migration Notes require locking Open Roadmap Q #1 to `ts-fsrs` when marking F-03 done. Implementation commits (`1fd6c10` → `a00a2df`) land and plan Progress is fully checked, but `roadmap.md` still shows F-03 as `blocked`, Q-SRS question open, F-03 in Active Tasks (not Done), and S-04 still blocked. Stream C notes still say "czeka na F-03".
- **Fix A ⭐ Recommended**: Update `roadmap.md` — mark F-03 done, resolve Q-SRS to `ts-fsrs`, move F-03 to Done table, promote S-04 to ready/active, update Stream C note.
  - Strength: Matches plan epilogue contract and unblocks S-04 planning.
  - Tradeoff: Roadmap becomes source-of-truth delta outside code commits.
  - Confidence: HIGH — pattern used for F-02/S-03 epilogues in same file.
  - Blind spot: GitHub issue #7 status not verified in this review.
- **Fix B**: Defer roadmap update until `/10x-archive srs-adapter`
  - Strength: Keeps review focused on code only.
  - Tradeoff: Violates explicit plan Migration Notes; S-04 remains falsely blocked in navigation doc.
  - Confidence: MEDIUM — archive skill may not cover Q-SRS closure.
  - Blind spot: Archive workflow expectations unknown.
- **Decision**: FIXED via Fix A

### F2 — Missing L-001 ESLint block on srs-adapter.ts

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/srs-adapter.ts:1
- **Detail**: Phase 2 contract requires file-wide L-001 disable block (same as `flashcards.ts`). File has only a line-level disable for `elapsed_days`. Lint passes because this module imports no Database-derived types — drift is convention-only.
- **Fix**: Add L-001 comment + disable block at top for parity with other service modules, or document in plan addendum that pure adapter modules are exempt.
- **Decision**: SKIPPED

### F3 — storedSrsStateSchema unused at persistence boundary

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/lib/services/flashcards.ts:112
- **Detail**: Schema intent says "validate srs_state JSON at service boundaries." `acceptBatch` and `backfillAcceptedCardsWithoutSrs` write `stored` from `initSrsState()` directly without `storedSrsStateSchema.parse()`. Safe today (trusted producer), but S-04 read/apply paths will need parse before `fromStored()`.
- **Fix**: Parse with `storedSrsStateSchema` in S-04 when reading from DB; optional defensive parse on write in flashcards service.
- **Decision**: SKIPPED

## Automated Verification (re-run 2026-06-02)

| Command | Result |
| ------- | ------ |
| `npm run lint` | PASS (exit 0) |
| `npx astro sync` | PASS (exit 0) |
| `npm run build` | PASS (exit 0) |
| Migration file exists | PASS |
| `ts-fsrs` in package.json | PASS (`^5.4.1`) |
| `acceptBatch` + `backfillAcceptedCardsWithoutSrs` | PASS (code verified) |

## Plan Drift Summary (Agent 1)

| File | Verdict |
| ---- | ------- |
| supabase/migrations/20260602120000_flashcard_srs_state.sql | MATCH |
| src/db/database.types.ts | MATCH |
| package.json | MATCH |
| src/lib/schemas/srs.ts | MATCH |
| src/lib/services/srs-adapter.ts | DRIFT (ESLint block only) |
| src/lib/services/flashcards.ts | MATCH |
| src/pages/api/flashcards/accept.ts | MATCH |

Out-of-scope guardrails respected (no S-04 routes, no UI, no vitest, no RLS changes).
