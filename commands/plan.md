---
description: Write a detailed implementation PLAN for a request — steps linked to requirements (REQ→STEP→TEST), files, and tests.
argument-hint: "[req-id]"
---

Run the **PLAN** phase for request `$ARGUMENTS` (or the active request). Follow the
`sd-plan` skill: write `requests/<id>/PLAN.md` with ordered steps, each linked to the
requirements it satisfies and the tests that will prove it, run `engine plan-check`,
and advance to PLANNED. Next step is `/sd:review`.
