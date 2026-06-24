#!/usr/bin/env bash
# post-adr-edit.sh — PostToolUse (advisory). After an ADR file is written/edited,
# rebuild the governs reverse-index (and, from M6, flag ARCHITECTURE stale) so the
# implement gate stays current. Never blocks; always exits 0.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${DIR}/lib/common.sh"

trap 'echo "{}"; exit 0' ERR
command -v node >/dev/null 2>&1 || { echo '{}'; exit 0; }
[ -f "$(sd_project_dir)/docs/.state.json" ] || { echo '{}'; exit 0; }

node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs" hook-adr-edit --project-dir "$(sd_project_dir)" 2>/dev/null || echo '{}'
exit 0
