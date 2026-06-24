---
description: THROWAWAY M0 spike command. Delegates to the _spike-implementer subagent to prove the subagent-frontmatter PreToolUse deny canary. Delete after M0.
---

Launch the `_spike-implementer` subagent (via the Task tool) and ask it to attempt
the edit described in its instructions. Then report back to the user:

1. Did the subagent's Edit on `spike/fixture.txt` get **denied**? (Expected: yes.)
2. What was the **exact reason string**? (Expected: contains `SPIKE-DENY-OK`.)
3. Did `${CLAUDE_PLUGIN_ROOT}` resolve to a real path inside the hook (see stderr `SPIKE:` lines)?
4. Is `node --version` >= v18.3 on PATH inside the subagent?
5. Is `AskUserQuestion` **absent** from the subagent's available tools? (Expected: yes.)

If (1) is "no" (the edit went through), the load-bearing platform fact (a) is FALSE
on this Claude Code version -> adopt the main-thread-implementer fallback before M5.
