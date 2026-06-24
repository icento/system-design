#!/usr/bin/env bash
# session-start.sh — SessionStart rehydrate. Prints a short banner of open requests
# and pending gates so a resumed/compacted session knows where it left off. Advisory:
# always exits 0, prints nothing outside a workflow repo.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${DIR}/lib/common.sh"

trap 'exit 0' ERR
command -v node >/dev/null 2>&1 || exit 0
[ -f "$(sd_project_dir)/docs/.state.json" ] || exit 0

node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs" status --hook --project-dir "$(sd_project_dir)" 2>/dev/null || true
exit 0
