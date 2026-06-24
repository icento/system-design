---
name: sd-implement
description: Implement a request exactly per its approved PLAN and accepted ADRs, staying within the PLAN scope, then advance to VERIFYING. Use for /sd:implement.
---

# sd-implement — build to the plan

`ENGINE` = `node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs"` with
`--project-dir "${CLAUDE_PROJECT_DIR}" --json`.

## Entry guard
`$ENGINE context --id <id>` — proceed only if status is `PLAN_OK` (or `IMPLEMENTING`
to resume). Advance `PLAN_OK → IMPLEMENTING` to begin.

## How enforcement works here
Edits go through the **main-thread** `PreToolUse` gate (`pre-edit-protect.sh`). It will
**deny** an edit that is outside the PLAN scope (the union of every step's `files`) or
that touches an accepted-ADR-governed file out of scope. So **implement on the main
thread** (do the edits yourself) rather than delegating to a subagent — a subagent's
edits are not reachable by the gate when this ships as a plugin. If you must edit
outside the PLAN scope, stop and either widen the PLAN or get an audited
`/sd:override`; never work around the gate.

## Protocol
1. Read `requests/<id>/PLAN.md` and every accepted ADR it references.
2. For each step in order:
   - implement strictly within the step's `files`,
   - write the step's declared tests so the `path::name` references resolve,
   - run the tests and confirm they pass,
   - `$ENGINE step-done --id <id> --step <N>`.
3. When all steps are done, `$ENGINE advance --id <id> --to VERIFYING`.
4. Report what was built. Next step: `/sd:verify`.

## RULES
Never hand-edit `docs/.state.json`. Stay within the PLAN scope. Honor every accepted
ADR's `constraints`. Persist progress (`step-done`) as you go.
