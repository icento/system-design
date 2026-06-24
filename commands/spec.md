---
description: Write or refine the SPEC for a request and burn down its open questions (gate G1). A TRIVIAL request is taken straight to done.
argument-hint: "[req-id]"
---

Run the **SPEC** phase for request `$ARGUMENTS` (or the active request if no id is
given). Read the intake, draft `requests/<id>/SPEC.md`
with structured requirements, resolve every open question (gate G1), validate the
SPEC with the engine, and advance to SPECCED. If the request is TRIVIAL, make the
CHANGELOG change and take it to DONE.

`ENGINE` = `node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs"` with
`--project-dir "${CLAUDE_PROJECT_DIR}" --json`.

## Entry guard
Run `$ENGINE context --id <id>` first. Proceed only if status is `TRIAGED`,
`SPECCED` (refinement), or `REVISING_SPEC`. Otherwise stop and report the state —
do not force a transition.

## TRIVIAL fast-path
If `tier == TRIVIAL`: make the actual change + a `CHANGELOG.md` line, then advance the
request straight through with the engine (it skips the SPEC/PLAN/review gates for
TRIVIAL): `TRIAGED → SPECCED → PLANNED → PLAN_OK → IMPLEMENTING → VERIFYING → DONE`,
one `$ENGINE advance --id <id> --to <STATE>` per step. Report DONE.

## STANDARD / DEEP protocol
1. Read `requests/<id>/intake.md`.
2. **Resolve open questions (G1).** For each open question, get an answer — ask the
   user with `AskUserQuestion` where a real decision is needed; otherwise resolve from
   the repo. As questions close, lower the count:
   `$ENGINE set-open-questions --id <id> --n <remaining>`.
3. Write `requests/<id>/SPEC.md` with frontmatter:
   - `id: <req-id>`, `kind: spec`, `title`, `status: ready`,
   - `requirements:` — each `{ id: REQ-<NNNN>-NN, statement (<=200), kind:
     functional|nonfunctional|constraint, priority: must|should|may, acceptance }`.
     The `NNNN` MUST equal this request's number (the engine enforces ownership).
   - `nonGoals:` — explicit out-of-scope items.
   Body: prose context, scope, and any superseded prior spec.
4. **Validate.** `$ENGINE validate-doc --kind spec --path requests/<id>/SPEC.md`.
   Fix any reported error before continuing.
5. Ensure open questions are zero, then `$ENGINE advance --id <id> --to SPECCED`.
6. Report. Next step: `/sd:design` (DEEP, or STANDARD with architecture choices) or
   `/sd:plan` (STANDARD with no decisions to make).

## RULES
Never hand-edit `docs/.state.json`. Honor gates — G1 means open questions must be 0
before SPECCED. Persist `SPEC.md` before advancing.
