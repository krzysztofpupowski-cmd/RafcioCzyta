---
change_id: testing-ci-quality-gates
title: CI quality gates
status: impl_reviewed
created: 2026-06-05
updated: 2026-06-05
archived_at: null
---

## Notes

Test-plan Phase 4 (`context/foundation/test-plan.md` §3 row 4). Wire `npm test` into local workflow and CI on PR — cross-cutting gate protecting regressions across risks #1–#7 shipped in Phases 1–3. Ground CI secrets, `.env.test` contract, and workflow structure before `/10x-plan`.
