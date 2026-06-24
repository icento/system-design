---
description: Present the staged architecture decisions and record the user's choices (gate G2 — human-only).
argument-hint: "[req-id]"
---

Run the **DECIDE** phase (gate G2) for request `$ARGUMENTS` (or the active request).
Follow the `sd-decide` skill: read `requests/<id>/decisions.json`, ask each decision
question with `AskUserQuestion` (main thread only), and record each verdict with
`engine decide` / `engine accept-adr`. When every ADR is accepted, advance to DECIDED;
if the user asks for changes, route back to REVISING_ADR.
