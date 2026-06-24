#!/usr/bin/env bash
# implementer-gate.sh — the implement-phase PreToolUse gate. Forwards the hook JSON
# to `engine hook-gate` (the full governs / PLAN-scope / override logic).
#
# NOTE: a frontmatter PreToolUse hook on a PLUGIN-provided agent is IGNORED by Claude
# Code (only project/user .claude/agents hooks fire). So for the shipped plugin the
# real enforcement is the MAIN-THREAD hook (hooks/pre-edit-protect.sh, same engine
# logic) while the implementer works on the main thread. This script exists for
# project-level installs that DO want a subagent gate. See spike/SPIKE.md.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${DIR}/lib/common.sh"

sd_guard '{}'
exec node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs" hook-gate --project-dir "$(sd_project_dir)"
