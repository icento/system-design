---
description: Onboard an existing repository — survey it, draft an ARCHITECTURE and seed ADRs over the most-load-bearing code, and hand them to you to ratify (G2). Never auto-accepts.
argument-hint: "[focus area]"
---

Adopt the **system-design** workflow into this existing repository, focusing on
`$ARGUMENTS` if given. Follow the `sd-adopt` skill: survey the codebase (git history +
file tree), draft **proposed** ADRs that document the architecture already in place
(each `governs` the relevant files), stage them on an adoption request, and hand them to
`/sd:decide`. It never accepts an ADR on its own — you ratify them.
