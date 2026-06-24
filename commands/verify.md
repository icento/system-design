---
description: QA/QC a finished implementation, check traceability, and finish (DONE) or route a loop-back to the right phase.
argument-hint: "[req-id]"
---

Run the **VERIFY** phase for request `$ARGUMENTS` (or the active request). Follow the
`sd-verify` skill: delegate to the `qa-verifier` subagent (read-only), run `engine
verify` for traceability + architecture freshness, then advance to DONE on a clean PASS
or route a loop-back (missing_requirement → REVISING_SPEC, bad_adr → REVISING_ADR,
code_local → IMPLEMENTING).
