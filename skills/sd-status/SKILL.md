---
name: sd-status
description: Report the system-design workflow status — open requests, their phase/tier, pending human gates, and the next command to run. Use for /sd:status or when the user asks where a request stands.
---

# sd-status — where things stand

`ENGINE` = `node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs"` with
`--project-dir "${CLAUDE_PROJECT_DIR}" --json`.

## Steps

1. If the user named a request id, run `$ENGINE context --id <id> ... --json` and
   report: status, tier, `awaiting` gate, open-question count, blocked reason,
   staged ADRs, and `legalTargets`.
2. Otherwise run `$ENGINE status ... --json` and list each request with its phase.
3. Map the current status to the next command and tell the user:
   - INTAKE → `/sd:new` is done; run `/sd:spec`
   - TRIAGED → `/sd:spec`
   - SPECCED → `/sd:design` (or `/sd:plan` for STANDARD with no ADRs)
   - ADR_PROPOSED → `/sd:decide`
   - DECIDED → `/sd:plan`
   - PLANNED → `/sd:review`
   - PLAN_OK → `/sd:implement`
   - IMPLEMENTING → `/sd:verify`
   - VERIFYING → `/sd:verify` again or it is DONE
   - BLOCKED → resolve `blockedReason`, then resume

Read-only: this skill never advances state.

## RULES
Never hand-edit `docs/.state.json`. Honor gates. Persist before asking.
