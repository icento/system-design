---
description: Recommend principle-derived architecture decisions for a request as questions, and stage a proposed ADR for each.
argument-hint: "[req-id]"
---

Run the **DESIGN** phase for request `$ARGUMENTS` (or the active request). Follow the
`sd-design` skill: delegate to the `principle-architect` subagent (it runs the
deterministic principle retrieval and stages proposed ADRs under `docs/adrs/`),
persist the returned DecisionQuestionSet via `engine decisions write`, register the
staged ADRs via `engine adr stage`, and advance to ADR_PROPOSED. Then tell the user
to run `/sd:decide`.
