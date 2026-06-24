# Hooks — what blocks, what only advises, and the honest gap

The plugin ships a layered enforcement net. No single layer is claimed as a guarantee:
**plan-conformance is undecidable**, so the gates fall on *decidable proxies* (file
scope, accepted-ADR governs globs, REQ→STEP→TEST holes, stale `ARCHITECTURE.md`,
numeric limits). The human gates (G1/G2/G3) and the adversarial subagents are the real
judgment; the hooks make the *mechanical* parts mechanical.

## Events

| Event | Script | Engine command | Blocking? |
|---|---|---|---|
| `SessionStart` | `session-start.sh` | `status --hook` | advisory — re-surfaces pending gates |
| `UserPromptSubmit` | `user-prompt-active-req.sh` | `hook-active-req` | advisory — injects the active request |
| `PreToolUse` (Edit/Write) | `pre-edit-protect.sh` | `hook-gate` | **blocking** — the real gate |
| `PostToolUse` (`docs/adrs/**`) | `post-adr-edit.sh` | `hook-adr-edit` | advisory — rebuilds the governs index + flags arch stale |
| `PostToolUse` (Edit/Write) | `tiger-lint.sh` | `hook-tiger-lint` | advisory — `PostToolUse` cannot block |

## The blocking gate (`hook-gate`)

Decision order, fail-open on error:

1. **Generated/engine-owned** file (`PRINCIPLES.md`, `ARCHITECTURE.md`, `.state.json`,
   the sidecars) → **deny** (use the engine, don't hand-edit).
2. Not a workflow repo, or the file is a workflow artifact (`docs/**`, `requests/**`)
   → allow.
3. An accepted-ADR-governed edit **auto-escalates** the request to DEEP.
4. **DEEP-incomplete**: a DEEP request with no SPEC, or with ADRs still `proposed`,
   blocks source edits.
5. **IMPLEMENTING scope**: an edit outside the PLAN scope (the union of every step's
   `files`) — strongest when the file is also accepted-ADR-governed — is gated.
6. A live, unconsumed **override** allows the edit (a `once` override is consumed).
7. **Warn-first**: the first denial is an `ask` (a warning); with `enforcement=deny`,
   subsequent denials are hard `deny`. With `enforcement=warn` (default), the gate only
   ever asks.

## Why fail-open

A bug in the gate must never brick editing. On any engine error the hook **allows** the
edit and logs to `${CLAUDE_PLUGIN_DATA}/gate-errors.log`; SessionStart can surface that
enforcement is degraded. This is deliberate: we trade a rare missed block for never
trapping the user.

## The honest gap

The gate cannot read intent. It does **not** prove an edit honors an ADR's prose
`constraints`, only that the file is in scope; it does **not** prove a test actually
exercises a requirement, only that the referenced test exists. Those judgments belong to
the `plan-reviewer` (G3) and `qa-verifier` subagents and to you. The hooks keep the
floor; the gates and the humans keep the ceiling.

## Platform caveat

A `PreToolUse` hook declared in a **plugin** subagent's frontmatter is ignored by Claude
Code (only project/user `.claude/agents` hooks fire). So the implement-phase gate is the
**main-thread** `pre-edit-protect.sh`, and `/sd:implement` works on the main thread.
`hooks/implementer-gate.sh` exists for project-level installs that want a subagent gate.
The `if:` field on the `PostToolUse(docs/adrs/**)` hook is a best-effort prefilter only —
the script re-checks the path authoritatively.
