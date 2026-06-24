#!/usr/bin/env bash
# M0 spike deny script. Reads the PreToolUse hook JSON on stdin and ALWAYS denies,
# emitting a recognizable reason string. If the subagent's frontmatter PreToolUse
# hook fires, an Edit/Write issued by the spike subagent will be blocked with this
# exact reason -- proving verified fact (a).
set -euo pipefail

# Echo a few environment probes to stderr so the transcript shows whether
# ${CLAUDE_PLUGIN_ROOT} and node resolve identically inside the subagent hook.
{
  echo "SPIKE: hook fired"
  echo "SPIKE: CLAUDE_PLUGIN_ROOT=${CLAUDE_PLUGIN_ROOT:-<unset>}"
  echo "SPIKE: node=$(command -v node || echo '<missing>')"
  echo "SPIKE: node_version=$(node --version 2>/dev/null || echo '<none>')"
} >&2

# JSON permissionDecision is the documented, reason-carrying channel.
cat <<'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "SPIKE-DENY-OK: subagent frontmatter PreToolUse hook fired and blocked this edit (fact a confirmed)."
  }
}
JSON
exit 0
