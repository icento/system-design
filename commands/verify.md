---
description: QA/QC a finished implementation, check traceability, and finish (DONE) or route a loop-back to the right phase.
argument-hint: "[req-id]"
---

Run the **VERIFY** phase for request `$ARGUMENTS` (or the active request): delegate to the `qa-verifier` subagent (read-only), run `engine
verify` for traceability + architecture freshness, then advance to DONE on a clean PASS
or route a loop-back (missing_requirement → REVISING_SPEC, bad_adr → REVISING_ADR,
code_local → IMPLEMENTING).

If `engine verify` blocks only on a stale `ARCHITECTURE.md`, regenerate it with `engine
arch-sync` (no flags — `--check` only reports) and re-run verify; this is a fix-in-place,
not a loop-back.

`ENGINE` = `node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs"` with
`--project-dir "${CLAUDE_PROJECT_DIR}" --json`.

## Entry guard
`$ENGINE context --id <id>` — proceed only if status is `VERIFYING` (or `IMPLEMENTING`,
in which case finish/advance to VERIFYING first).

## Protocol
1. **Delegate.** Launch the `qa-verifier` subagent (Task tool, read-only) with the
   request id. It runs the tests, judges each requirement against observed evidence,
   checks accepted ADRs, and returns a verdict JSON (`{overall, results[], failures[]}`).
2. **Persist** the report to `requests/<id>/qa/qa.verdict.json` (and a human summary to
   `requests/<id>/qa/qa-report.md`).
3. **Engine pre-gate.** Run `$ENGINE verify --id <id>` — it independently checks
   REQ→STEP→TEST traceability (every requirement covered, every step's tests resolve)
   and ARCHITECTURE freshness. It exits non-zero with the holes if not ready.
   - **Stale architecture (not a loop-back).** If `verify` fails *only* on
     `ARCHITECTURE.md is stale` (traceability is otherwise complete), the accepted ADRs
     changed and the generated doc is behind. Regenerate it in place:
     `$ENGINE arch-sync` — **no flags** (`arch-sync --check` only *reports* staleness, it
     does not clear it). Then re-run `$ENGINE verify --id <id>` and continue to step 4.
4. **Route.**
   - `overall == PASS` **and** `engine verify` is clean → `$ENGINE advance --id <id> --to DONE`. 🎉
   - otherwise pick the **highest-priority** failure root cause and loop back:
     - any `missing_requirement` → `$ENGINE advance --id <id> --to REVISING_SPEC` (then `/sd:spec`)
     - else any `bad_adr` → `$ENGINE advance --id <id> --to REVISING_ADR` (then `/sd:design`)
     - else (`code_local`) → `$ENGINE advance --id <id> --to IMPLEMENTING` (then `/sd:implement`)
   Priority order is fixed: `missing_requirement > bad_adr > code_local`.
   (A stale-architecture failure is fixed in place per step 3 — it is not one of these
   loop-backs.)

## RULES
Never hand-edit `docs/.state.json`. The qa-verifier is read-only and adversarial — do
not soften its verdict. DONE requires both a PASS verdict and a clean `engine verify`.
