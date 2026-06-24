---
description: Grant an audited, scoped exception to the edit gate when it is blocking legitimate work.
argument-hint: "[req-id] <reason>"
---

Grant an audited override for request `$ARGUMENTS`. Follow the `sd-override` skill:
confirm the file/glob and reason with the user, run `engine override add` (prefer
`--scope once`), and report the override id. Prefer fixing the PLAN or an ADR over
overriding — keep overrides rare and well-justified.
