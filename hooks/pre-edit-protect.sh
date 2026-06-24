#!/usr/bin/env bash
# pre-edit-protect.sh — MAIN-THREAD PreToolUse edit gate (M3). Forwards the hook
# JSON (on stdin) to `engine hook-gate`, which protects generated/engine-owned
# files and gates premature source edits while a DEEP request is incomplete.
# Always allows when not a workflow repo or node is absent.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${DIR}/lib/common.sh"

sd_guard '{}'
exec node "${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs" hook-gate --project-dir "$(sd_project_dir)"
