---
description: Show the system-design workflow status — open requests, current phase, pending gates, and the next step.
argument-hint: "[req-id]"
---

Show the **system-design** workflow status. Follow the `sd-status` skill: run
`engine status` (or `engine context --id $ARGUMENTS` for one request) and report the
current phase, tier, any pending gate, and the recommended next command.
