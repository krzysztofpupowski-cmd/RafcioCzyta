# Review Follow-ups

## F1 - Lint gate re-baseline

- `npm run lint` currently fails at HEAD (impl review run on 2026-06-04).
- Track and resolve ownership for:
  - `.cursor/hooks/*` parser/project-service lint errors.
  - `@typescript-eslint/no-unnecessary-type-assertion` errors in DTO/service files reported by lint.
- Re-run `npm run lint` and only then re-check plan items `3.2` and `4.2`.

## F4 - Scope split

- Keep supporting adjustments in this change:
  - `astro.config.mjs`
  - `src/lib/supabase.ts`
  - `tests/helpers/api-context.ts`
  - `context/changes/deck-generation-acceptance-gates/plan-brief.md`
- Move unrelated files to a separate follow-up change:
  - `.cursor/hooks.json`
  - `.cursor/hooks/lint-after-edit.mjs`
  - `.cursor/hooks/typecheck-after-edit.mjs`
  - `src/lib/services/srs-adapter.ts`
  - `src/db/database.types.ts`
