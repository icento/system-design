---
name: sd-design
description: Turn a SPEC into principle-derived architecture decision questions and stage a proposed ADR for each, advancing to ADR_PROPOSED. Delegates the judgment to the principle-architect subagent. Use for /sd:design.
---

# sd-design — recommend architecture decisions

`ENGINE` = `node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs"` with
`--project-dir "${CLAUDE_PROJECT_DIR}" --json`.

## Entry guard
`$ENGINE context --id <id>` — proceed only if status is `SPECCED` or `REVISING_ADR`.

## Protocol
1. **Delegate to the architect.** Launch the `principle-architect` subagent (Task tool)
   with the request id and the SPEC path. It will: run `engine principles retrieve`,
   cluster the candidates into ≤7 decision questions, **write proposed ADR files under
   `docs/adrs/`**, and return a **DecisionQuestionSet JSON** as its entire output.
   - If it returns an empty question set (`questions: []`), there are no architecture
     decisions to make: skip to `/sd:plan` (advance SPECCED → PLANNED for STANDARD).
2. **Persist the handoff.** Write the architect's JSON to
   `requests/<id>/decisions.json`, then validate + normalize it:
   `$ENGINE decisions write --req <id> --from requests/<id>/decisions.json`.
3. **Stage the ADRs.** `$ENGINE adr stage --request <id>` — this validates each staged
   ADR file, registers it in state as `proposed`, and advances `SPECCED → ADR_PROPOSED`.
4. **Persist a gate cursor** before handing to the human gate:
   `$ENGINE await --id <id> --gate G2`.
5. Report the staged ADRs and tell the user to run `/sd:decide`.

## RULES
Never hand-edit `docs/.state.json`. The architect writes ONLY under `docs/adrs/`;
you own `decisions.json` via the engine. Never accept an ADR here — acceptance is G2.
Persist before asking.
