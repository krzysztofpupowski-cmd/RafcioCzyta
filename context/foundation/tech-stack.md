---
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
---

## Why this stack

Solo, after-hours MVP in three weeks for a parent-facing reading app needs a battle-tested, agent-friendly web stack with parent login and persisted progress out of the box. The recommended default for web apps in JavaScript/TypeScript is 10x Astro Starter (Astro + React + TypeScript + Supabase + Cloudflare): it clears all four agent-friendly gates and ships auth and a database without custom scaffolding. AI flashcard generation is in scope per the PRD but is not bundled in the starter—you will wire an LLM provider after bootstrap. Deployment on Cloudflare Pages with GitHub Actions auto-deploy on merge matches the starter defaults and keeps the path to first deploy short.
