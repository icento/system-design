---
description: Grant an audited, scoped exception to the edit gate when it is blocking legitimate work.
argument-hint: "[req-id] <reason>"
---

Grant an audited override for request `$ARGUMENTS`:
confirm the file/glob and reason with the user, run `engine override add` (prefer
`--scope once`), and report the override id. Prefer fixing the PLAN or an ADR over
overriding — keep overrides rare and well-justified.

`ENGINE` = `node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs"` with
`--project-dir "${CLAUDE_PROJECT_DIR}" --json`.

Use this ONLY when the gate is blocking legitimate work and the right fix is not to
widen the PLAN or revise an ADR. Every override is recorded in state and appended to
`requests/<id>/qa/overrides.log`.

## Steps
1. Confirm the situation with the user — what file/glob, and why the gate is wrong here.
2. `$ENGINE override add --req <id> --path <file>` (or `--glob <pattern>`)
   `--reason "<why>" --scope once`.
   - `once` — permits exactly the next matching edit (consumed on use). Prefer this.
   - `request` — permits matching edits until the request is done. Use sparingly.
3. Tell the user the override id and that the next matching edit is now allowed.

Prefer fixing the PLAN/ADR over overriding. An override is an admission the machine was
wrong here — keep them rare and well-justified.

## RULES
Never hand-edit `docs/.state.json`. Always record a real reason. Persist before asking.
