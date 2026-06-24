---
description: Present the staged architecture decisions and record the user's choices (gate G2 — human-only).
argument-hint: "[req-id]"
---

Run the **DECIDE** phase (gate G2) for request `$ARGUMENTS` (or the active request).

`ENGINE` = `node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs"` with
`--project-dir "${CLAUDE_PROJECT_DIR}" --json`. **This gate is human-only** — it must
run on the main thread (where `AskUserQuestion` is available) and is never overridden.

## Entry guard
`$ENGINE context --id <id>` — proceed only if status is `ADR_PROPOSED`.
- **No decisions to make.** If status is anything else — e.g. `SPECCED` with no staged
  ADRs (retrieval returned nothing) — there is nothing for this gate to decide: do **not**
  author or `decisions write` an empty `decisions.json`, and do **not** advance to
  `DECIDED`. Skip this gate entirely and go to `/sd:plan` (the `SPECCED → PLANNED` edge
  bypasses `DECIDED` by design). Stop and report any other unexpected state.

## Protocol
1. Read `requests/<id>/decisions.json`. For each question, read the staged ADR at
   `docs/adrs/<staged_adr_id>.md` for full context (Context/Decision/Consequences).
2. **Ask.** Present the questions with `AskUserQuestion` — one question per decision,
   its 2–4 options, and clearly mark the architect's `recommended_option_index` as
   "(Recommended)". Cite the backing principle ids so the user sees the rationale.
3. **Record each verdict** with the engine:
   - chose the recommended / an option as-is → `$ENGINE decide --id <id> --adr <adr> --verdict accept`
   - rejected outright → `$ENGINE decide --id <id> --adr <adr> --verdict reject`
   - wants changes → `$ENGINE decide --id <id> --adr <adr> --verdict modify --note "<what to change>"`
     (and, if accepting a non-recommended option, edit the ADR's `choice`/`constraints`
     to match before accepting).
4. **Route.**
   - If every ADR is `accepted`/`rejected` (none left `proposed`):
     `$ENGINE advance --id <id> --to DECIDED`. Next step: `/sd:plan`.
   - If any verdict was `modify`: `$ENGINE advance --id <id> --to REVISING_ADR`, then
     re-run `/sd:design` so the architect revises the staged ADRs.

## RULES
Never hand-edit `docs/.state.json`. G2 is human-only: never use `--override` to reach
DECIDED, and never call `AskUserQuestion` from a subagent. Persist verdicts as you go.
