---
description: Run the adversarial plan review (gate G3) and record the verdict; the plan can only advance on PASS with zero blockers.
argument-hint: "[req-id]"
---

Run the **REVIEW** phase (gate G3) for request `$ARGUMENTS` (or the active request).
Follow the `sd-review` skill: delegate to the `plan-reviewer` subagent, write
`requests/<id>/plan-review.md` and the verdict JSON, then advance to PLAN_OK (the
engine permits it only when the verdict is PASS with zero blockers). On REVISE, route
back to fix the plan.
