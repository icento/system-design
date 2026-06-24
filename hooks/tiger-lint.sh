#!/usr/bin/env bash
# tiger-lint.sh — PostToolUse (advisory). Runs the TIGER_STYLE numeric-limit lint on
# a freshly edited code file and surfaces findings. PostToolUse cannot block, so this
# is advisory; in blocking mode the engine records findings to qa/tiger-lint.json.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${DIR}/lib/common.sh"

trap 'echo "{}"; exit 0' ERR
command -v node >/dev/null 2>&1 || { echo '{}'; exit 0; }

exec node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs" hook-tiger-lint --project-dir "$(sd_project_dir)"
