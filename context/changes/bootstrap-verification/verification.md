---
bootstrapped_at: 2026-05-20T11:05:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: rafcio-czyta
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: rafcio-czyta
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

Solo, after-hours MVP in three weeks for a parent-facing reading app needs a battle-tested, agent-friendly web stack with parent login and persisted progress out of the box. The recommended default for web apps in JavaScript/TypeScript is 10x Astro Starter (Astro + React + TypeScript + Supabase + Cloudflare): it clears all four agent-friendly gates and ships auth and a database without custom scaffolding. AI flashcard generation is in scope per the PRD but is not bundled in the starter—you will wire an LLM provider after bootstrap. Deployment on Cloudflare Pages with GitHub Actions auto-deploy on merge matches the starter defaults and keeps the path to first deploy short.

## Pre-scaffold verification

| Signal      | Value                                                | Severity | Notes                                         |
| ----------- | ---------------------------------------------------- | -------- | --------------------------------------------- |
| npm package | not run                                              | —        | cmd_template uses git clone; npm step skipped |
| GitHub repo | przeprogramowani/10x-astro-starter pushed 2026-05-17 | fresh    | from card.docs_url via GitHub API             |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 20
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently
**.bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 0 CRITICAL, 1 HIGH, 10 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/3/0 direct of total 0/1/10/0 (npm audit isDirect flag)

#### CRITICAL findings

None.

#### HIGH findings

- **devalue** (transitive) — severity HIGH; introduced via dependency chain; not a direct dependency.

#### MODERATE findings

10 moderate advisories across the dependency tree (including direct dependencies `@astrojs/check`, `@astrojs/cloudflare`, and related transitive packages). See `npm audit` in the project root for the full advisory list and fix suggestions.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | cloudflare-pages     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | true                 |
| has_background_jobs     | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
