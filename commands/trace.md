---
description: Show the REQ→STEP→TEST traceability matrix for a request and any coverage holes (read-only).
argument-hint: "[req-id]"
---

Show the traceability matrix for request `$ARGUMENTS` (or the active request): run
`engine trace` and summarize each requirement's coverage and any holes.

`ENGINE` = `node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs"` with
`--project-dir "${CLAUDE_PROJECT_DIR}" --json`.

## Steps
1. `$ENGINE trace --id <id>` — renders each requirement, the steps that satisfy it,
   and whether it is covered.
2. Summarize the holes (REQ-without-step, step-without-test, dangling satisfies,
   missing test refs) and which phase resolves each.

Read-only: never advances state.

## RULES
Never hand-edit `docs/.state.json`. Honor gates. Persist before asking.
