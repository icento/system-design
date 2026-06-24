---
description: View or set per-request system-design config — enforcement (warn|deny) and tiger-lint blocking.
argument-hint: "[req-id] <key> <value>"
---

View or set system-design config for request `$ARGUMENTS`. Use `engine config set --id
<req> <key> <value>` where key is `enforcement` (warn|deny) or `tigerLintBlocking`
(true|false). `warn` keeps the gate advisory (ask, never hard-deny); `deny` hard-denies
after the first warning. Report the new value.
