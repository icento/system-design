---
description: Initialize the system-design workflow in this repository (scaffold docs/ and requests/, copy the principles corpus, write initial state). Idempotent.
---

Initialize the **system-design** workflow for this repository: run `engine init`, then generate the principles index. Report what was
scaffolded (and say so plainly if it was already initialized — init is idempotent).

`ENGINE` = `node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs"`. Always pass
`--project-dir "${CLAUDE_PROJECT_DIR}" --json`.

## Steps

1. Run `$ENGINE init --project-dir "${CLAUDE_PROJECT_DIR}" --json`. It scaffolds
   `docs/{adrs,principles,spec}`, `requests/`, copies the principles corpus, and
   writes a validated empty `docs/.state.json`. It is **idempotent** — re-running
   never clobbers existing state.
2. Run `$ENGINE principles index --project-dir "${CLAUDE_PROJECT_DIR}" --json` to
   generate `docs/PRINCIPLES.md`.
3. Report: created vs already-initialized, and that the next step is `/sd:new`.

## RULES
Never hand-edit `docs/.state.json` (the engine owns it). Honor gates. Persist before asking.
