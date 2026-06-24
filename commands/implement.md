---
description: Implement a request exactly per its approved PLAN and accepted ADRs, staying within the PLAN scope (the edit gate enforces it).
argument-hint: "[req-id]"
---

Run the **IMPLEMENT** phase for request `$ARGUMENTS` (or the active request). Follow the
`sd-implement` skill: advance to IMPLEMENTING, build each PLAN step within its declared
files, write the declared tests, mark each step done, then advance to VERIFYING. Edits
go through the main-thread gate — stay in scope or get an audited `/sd:override`.
