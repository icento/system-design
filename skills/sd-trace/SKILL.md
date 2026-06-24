---
name: sd-trace
description: Show the REQ→STEP→TEST traceability matrix for a request and any holes (read-only). Use for /sd:trace.
---

# sd-trace — the traceability matrix

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
