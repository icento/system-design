---
name: sd-plan
description: Write a detailed implementation PLAN for a request, with steps linked to requirements (REQ→STEP→TEST), files, and tests, then advance to PLANNED. Use for /sd:plan.
---

# sd-plan — author the implementation plan

`ENGINE` = `node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs"` with
`--project-dir "${CLAUDE_PROJECT_DIR}" --json`.

## Entry guard
`$ENGINE context --id <id>` — proceed only if status is `DECIDED`, `SPECCED`
(any tier whose retrieval produced no ADRs to decide — STANDARD or DEEP), or
`REVISING_SPEC`. (For `SPECCED → PLANNED` on a DEEP request the engine refuses while any
ADR is still proposed; you reach PLANNED here only once there are none to decide.)
This skill **owns** the `SPECCED → PLANNED` advance (step 4): it authors `PLAN.md` first,
which the engine requires before that transition will succeed.

## Protocol
1. Read `requests/<id>/SPEC.md` (requirements) and every **accepted** ADR the request
   touches (`docs/adrs/*.md`). The plan must satisfy every requirement and obey every
   accepted ADR's `constraints`.
2. Write `requests/<id>/PLAN.md` with frontmatter:
   - `id: <req-id>`, `kind: plan`, `status: draft`,
   - `steps:` — ordered, each:
     - `id: STEP-NNN`,
     - `intent:` (<=200 chars),
     - `satisfies:` — the REQ ids it implements (>=1; every requirement must be covered
       by some step),
     - `files:` — the files it will create/change (this set is the PLAN scope the
       implement gate enforces),
     - `tests:` — `path::name` references that will prove it (>=1 per step),
     - `adrs:` — the accepted ADR ids it must honor (optional),
     - `status: todo`.
   Body: ordering/sequence notes and any risks.
3. **Check coverage.** `$ENGINE plan-check --id <id>` — fix every reported hole
   (REQ-without-step, step-without-test, dangling satisfies).
4. `$ENGINE advance --id <id> --to PLANNED`. Next step: `/sd:review`.

## RULES
Never hand-edit `docs/.state.json`. The PLAN scope = union of `steps[].files`; keep it
honest, since the implement gate enforces it. Persist `PLAN.md` before advancing.

Note: marking a step done later (`$ENGINE step-done`) re-serializes `PLAN.md` through the
engine's YAML writer, which canonicalizes formatting (e.g. flow sequences `[a, b]` become
block `- a`/`- b`). That is the engine, not a linter, and it changes layout only — never
your content. No hook reformats `PLAN.md`; only `step-done` rewrites it.
