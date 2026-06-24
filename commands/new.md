---
description: Start a new change request — capture it, clarify, push back where needed, and triage it into a tier (TRIVIAL/STANDARD/DEEP).
argument-hint: "<what you want to change>"
---

The user is starting a new change request:

$ARGUMENTS

`ENGINE` = `node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs"` with
`--project-dir "${CLAUDE_PROJECT_DIR}" --json`. Run `$ENGINE init` first if the repo
is not yet initialized (`engine status --hook` exits 0 silently when it isn't).

## Protocol

1. **Understand.** Restate the request in your own words. Identify what is genuinely
   being asked vs assumed. If something is ambiguous or risky, **push back** — propose
   a sharper scope. Do not pad with busywork.
2. **Register.** `$ENGINE register --title "<concise imperative title>"` → returns the
   `req-NNNN` id (idempotent on an open slug). Capture the id.
3. **Record intake.** Write `requests/<id>/intake.md`:
   - the raw request (verbatim),
   - your understanding and any push-backs / scope proposals,
   - a `## Open questions` section, one question per line (these become the G1 list).
4. **Triage a tier.** Estimate signals and run
   `$ENGINE classify --id <id> [--touches-adr] [--adds-dep] [--files N] [--hint TIER]`.
   Apply it: `$ENGINE triage --id <id> --tier <TIER>`. Then set the open-question
   count: `$ENGINE set-open-questions --id <id> --n <count>`.
   - **TRIVIAL** — a CHANGELOG-line change; no SPEC/ADR/PLAN. (`/sd:spec` will finish it.)
   - **STANDARD** — SPEC + PLAN; ADRs optional.
   - **DEEP** — full machine: SPEC, principle-derived ADRs, reviewed PLAN, traceability.
   - **Picked the wrong tier?** Correct it any time with
     `$ENGINE retier --id <id> --to <TIER>` (not just at intake). Editing an
     accepted-ADR-governed file auto-escalates a request to DEEP; undo that with
     `$ENGINE retier --id <id> --restore`, which returns it to the prior tier. Note you
     can only drop to **TRIVIAL** while still at INTAKE/TRIAGED — once SPEC/PLAN gates are
     in play, the lowest safe downgrade is STANDARD (TRIVIAL would skip those gates).
5. **Report** the id, tier, and open-question count, and tell the user the next step is
   `/sd:spec`.

## RULES
Never hand-edit `docs/.state.json`. Honor gates. Persist before asking — `intake.md`
must be written before you hand off.
