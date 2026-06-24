---
name: sd-intake
description: Capture, clarify, push back on, and triage a new change request into the system-design workflow. Registers the request, writes requests/<id>/intake.md, and assigns a tier (TRIVIAL/STANDARD/DEEP). Use for /sd:new or when the user proposes a change to build.
---

# sd-intake — capture & triage a request

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
5. **Report** the id, tier, and open-question count, and tell the user the next step is
   `/sd:spec`.

## RULES
Never hand-edit `docs/.state.json`. Honor gates. Persist before asking — `intake.md`
must be written before you hand off.
