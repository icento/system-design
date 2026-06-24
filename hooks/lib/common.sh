#!/usr/bin/env bash
# common.sh — shared preamble for system-design hook scripts. Hooks degrade
# gracefully: if node is missing or this is not a workflow repo, they emit an
# allow ('{}') / no-op and exit 0 so they never interfere with non-workflow work.

set -euo pipefail

# Resolve the project dir (Claude Code sets CLAUDE_PROJECT_DIR; fall back to cwd).
sd_project_dir() {
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
    printf '%s' "${CLAUDE_PROJECT_DIR}"
  else
    pwd
  fi
}

# sd_guard <allow-payload>: emit the payload and exit 0 unless node is present AND
# this is an initialized workflow repo. Used by blocking hooks (allow on guard).
sd_guard() {
  local allow="${1:-}"
  [ -n "$allow" ] || allow='{}'
  command -v node >/dev/null 2>&1 || { printf '%s\n' "$allow"; exit 0; }
  [ -f "$(sd_project_dir)/docs/.state.json" ] || { printf '%s\n' "$allow"; exit 0; }
}

# sd_engine <args...>: invoke the engine against the project dir.
sd_engine() {
  node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs" "$@" --project-dir "$(sd_project_dir)"
}
