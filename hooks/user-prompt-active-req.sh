#!/usr/bin/env bash
# user-prompt-active-req.sh — UserPromptSubmit (advisory). Injects the active request
# id/phase as context each turn so a long session stays oriented. Never blocks.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${DIR}/lib/common.sh"

trap 'echo "{}"; exit 0' ERR
command -v node >/dev/null 2>&1 || { echo '{}'; exit 0; }
[ -f "$(sd_project_dir)/docs/.state.json" ] || { echo '{}'; exit 0; }

node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs" hook-active-req --project-dir "$(sd_project_dir)" 2>/dev/null || echo '{}'
exit 0
