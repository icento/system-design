---
name: sd-review
description: Run the adversarial plan review (gate G3) via the plan-reviewer subagent, record the verdict, and advance to PLAN_OK only on PASS with zero blockers. Use for /sd:review.
---

# sd-review — adversarial plan review (gate G3)

`ENGINE` = `node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs"` with
`--project-dir "${CLAUDE_PROJECT_DIR}" --json`.

## Entry guard
`$ENGINE context --id <id>` — proceed only if status is `PLANNED`.

## Protocol
1. **Delegate.** Launch the `plan-reviewer` subagent (Task tool) with the request id.
   It reads SPEC/ADRs/PLAN (read-only), tries to find blockers, and returns a **verdict
   JSON** (`{verdict, summary, blockerCount, findings[], coverage}`).
2. **Persist the verdict** so the engine gate can read it:
   - write the human report to `requests/<id>/plan-review.md` (summary + findings),
   - write the machine verdict to `requests/<id>/qa/plan-review.verdict.json` (the exact
     JSON the subagent returned).
3. **Validate** it: `$ENGINE validate-doc --kind plan-review --path requests/<id>/qa/plan-review.verdict.json`.
4. **Route.**
   - PASS with `blockerCount == 0` → `$ENGINE advance --id <id> --to PLAN_OK`. The engine
     independently re-checks the verdict, so a PASS-with-blockers cannot slip through.
     Next step: `/sd:implement`.
   - REVISE (or any blocker) → present the blockers, fix the PLAN (or route via
     `$ENGINE advance --id <id> --to REVISING_SPEC` / `REVISING_ADR` if the gap is in the
     SPEC/ADRs), then re-run `/sd:review`.

## RULES
Never hand-edit `docs/.state.json`. The reviewer is read-only and adversarial; do not
soften its verdict. PLAN_OK requires PASS **and** zero blockers — the engine enforces it.
Persist the verdict file before advancing.
