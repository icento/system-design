---
description: Onboard an existing repository — survey it, draft an ARCHITECTURE and seed ADRs over the most-load-bearing code, and hand them to you to ratify (G2). Never auto-accepts.
argument-hint: "[focus area]"
---

Adopt the **system-design** workflow into this existing repository, focusing on
`$ARGUMENTS` if given. Survey the codebase (git history +
file tree), draft **proposed** ADRs that document the architecture already in place
(each `governs` the relevant files), stage them on an adoption request, and hand them to
`/sd:decide`. It never accepts an ADR on its own — you ratify them.

`ENGINE` = `node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs"` with
`--project-dir "${CLAUDE_PROJECT_DIR}" --json`.

Goal: capture the architecture **already** in the codebase as ratifiable ADRs, so the
workflow can govern future changes. You document decisions; you never decide them.

## Protocol
1. **Initialize** if needed: `$ENGINE init`, then `$ENGINE principles index`.
2. **Survey** (read-only, via Bash/Glob/Grep):
   - hot files (if it is a git repo): `git log --pretty=format: --name-only | sort | uniq -c | sort -rn | head -40`.
     If `git` fails (not a repo / shallow), fall back to the file tree + sizes
     (`find . -type f -name '*.<ext>' | head`) to find the load-bearing modules.
   - structure: the top-level dirs, entry points, build/test config, dependency manifest.
   - identify the **load-bearing decisions** already made: module boundaries, the error
     model, data-access pattern, concurrency model, public API surface, performance
     posture. Focus on `$ARGUMENTS` if given.
3. **Register an adoption request**: `$ENGINE register --title "Adopt existing architecture" --slug adopt --tier DEEP`.
   Write a short `requests/<id>/SPEC.md` (kind:spec) whose requirements are
   "document and govern decision X" items, then `$ENGINE validate-doc --kind spec ...`
   and `$ENGINE advance --id <id> --to SPECCED`.
4. **Draft seed ADRs** (3–7). Reserve ids: `$ENGINE adr next --count <N>`. For each,
   write `docs/adrs/<adr-id>.md` with `status: proposed`, a `governs` glob over the
   files that embody the decision (use the hot-file survey), the `principles` it
   reflects, the `decisionQuestion` it answers, the current `choice`, and real
   Context/Decision/Consequences prose describing what the code does today.
5. **Stage them**: build `requests/<id>/decisions.json` (a DecisionQuestionSet referencing
   each staged ADR), then `$ENGINE decisions write --req <id> --from requests/<id>/decisions.json`
   and `$ENGINE adr stage --request <id>` (→ ADR_PROPOSED). `$ENGINE await --id <id> --gate G2`.
6. **Hand off**: tell the user to run `/sd:decide` to ratify (or amend) the seed ADRs.
   After they accept (status reaches DECIDED), run `$ENGINE arch-sync` to generate
   `ARCHITECTURE.md` from the now-accepted set.

## Terminal state
The adoption request rests at **DECIDED** — it is a documentation/ratification request,
not a code change, so it does not proceed to a PLAN or DONE. `/sd:status` will show it
as the baseline-architecture record (e.g. `req-0001 [DECIDED] — Adopt existing
architecture`). Future changes start fresh with `/sd:new` and are governed by the
accepted seed ADRs. The repo is now an sd project.

## RULES
Never hand-edit `docs/.state.json`. **Never accept an ADR** — adoption proposes; the
human ratifies at G2. Keep seed ADRs honest: describe what *is*, not what you wish were.
Persist every artifact before handing off.
