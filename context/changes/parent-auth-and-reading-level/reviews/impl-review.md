<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Parent Auth & Reading Level (S-01)

- **Plan**: context/changes/parent-auth-and-reading-level/plan.md
- **Scope**: Phases 1+2 (full plan)
- **Date**: 2026-05-28
- **Verdict**: NEEDS ATTENTION → triaged; fixes applied
- **Findings**: 0 critical · 3 warnings · 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — AppSupabase drops the `<Database>` generic

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architecture
- **Location**: src/lib/services/children.ts:14 (root cause: src/lib/supabase.ts:9)
- **Detail**: Plan specified `type AppSupabase = SupabaseClient<Database>`. Actual shipped `SupabaseClient` without generic because createClient did not pass `<Database>` to createServerClient.
- **Fix A ⭐ Recommended**: Pass `<Database>` at the source in supabase.ts; restore `AppSupabase = SupabaseClient<Database>`.
  - Strength: Establishes correct Supabase typing for the whole codebase before S-02.
  - Tradeoff: One-line touch outside S-01 stated scope.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Fix B**: Document deviation in plan; accept untyped client.
- **Decision**: FIXED via Fix A — `createServerClient<Database>` in supabase.ts; `AppSupabase = SupabaseClient<Database>` restored.

### F2 — dashboard.astro silently substitutes "" for missing user.id

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:8
- **Detail**: Plan called for type-narrow with early return. Actual used `Astro.locals.user?.id ?? ""`, which could send an empty uuid to Postgres if middleware regressed.
- **Fix**: Early `return Astro.redirect("/auth/signin")` when user is null; destructure id and email from narrowed user.
- **Decision**: FIXED

### F3 — toCurrentLevel lost its explicit return type

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/schemas/child.ts:20
- **Detail**: Plan specified return typed against `ReadingLevel | null`. Implementation inferred return type to avoid ESLint Database-derived error types.
- **Fix**: Restore explicit return type using `StoredReadingLevel | null` (zod-free alias in reading-level-form.ts, structurally identical to ReadingLevel).
- **Decision**: FIXED (via StoredReadingLevel alias added during lint verification)

### F4 — services/children.ts imports type from schemas/child.ts

- **Severity**: ◽ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Architecture
- **Location**: src/lib/services/children.ts:12
- **Detail**: Service used `ReturnType<typeof toCurrentLevel>` from schemas module, crossing the service ↔ schema layer.
- **Fix**: Type `currentLevel` as `StoredReadingLevel | null`; drop schema type import.
- **Decision**: FIXED

### F5 — Dead defensive level membership check

- **Severity**: ◽ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/components/child/ChildProfileForm.tsx:29-31
- **Detail**: `READING_LEVEL_FORM_VALUES.includes(level)` is unreachable given `ReadingLevelFormValue` typing and radio enforcement.
- **Fix**: Remove the branch.
- **Decision**: SKIPPED

### F6 — ChildProfileForm prop shape diverges from plan; lesson captured but plan not amended

- **Severity**: ◽ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/components/child/ChildProfileForm.tsx, src/pages/dashboard.astro
- **Detail**: Plan specified `initialChild: Child | null`. Shipped primitive props per L-001. Plan not updated.
- **Fix**: Append addendum to plan.md under Phase 2 #2.
- **Decision**: FIXED — addendum written to plan.md

### F7 — Raw Supabase error message can leak to user (English)

- **Severity**: ◽ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dashboard.astro:30
- **Detail**: catch block uses `err.message` (English Postgres/Supabase text) in Polish UI.
- **Fix**: Always render localized message; console.error the raw err.
- **Decision**: SKIPPED

### F8 — BookOpen icon used for both field and submit button

- **Severity**: ◽ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/components/child/ChildProfileForm.tsx:62, 76
- **Detail**: Auth forms use data icons on fields and action icons on submit. ChildProfileForm used BookOpen for both.
- **Fix**: Keep BookOpen on field; use Save on submit button.
- **Decision**: FIXED

## Post-triage verification fixes

Applied while re-running automated checks after triage:

- **eslint.config.js**: Disable `@typescript-eslint/no-misused-promises` for `*.astro` — `return Astro.redirect()` in frontmatter crashes astro-eslint-parser.
- **src/lib/reading-level-form.ts**: Add `StoredReadingLevel` alias to avoid importing Database-derived `ReadingLevel` in schema/service while keeping explicit return types.
- **src/lib/services/children.ts**: Remove unnecessary `as Child | null` cast; trim file-wide eslint-disable to active rules only.
- **src/pages/dashboard.astro**: Restore L-001 inline eslint-disable on getMyChild extraction block.

## Automated verification (post-fix)

- `npm run lint` — pass
- `npx astro sync` — pass
- `npm run build` — pass

## Triage summary

| Outcome | Findings |
|---------|----------|
| Fixed | F1, F2, F3, F4, F6, F8 |
| Skipped | F5, F7 |
