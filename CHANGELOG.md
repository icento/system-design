# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the top released version must
match the plugin manifest version (`engine selfcheck` enforces this on release).

## [0.1.0] - 2026-06-24

### Added
- Deterministic zero-dependency engine (`bin/engine.mjs`) — the sole writer of
  `docs/.state.json` and the gatekeeper of all lifecycle transitions, with a frozen
  exit-code contract (0/2/3/4/5/6/7/8/9/70), atomic writes, `.bak` recovery, and
  locking.
- The lifecycle state machine (INTAKE → DONE) with human gates G1 (clarify), G2
  (decide), G3 (plan-review), loop-backs, and a TRIVIAL fast-path.
- The machine-queryable principle rubric: 8 APoSD + 10 TIGER_STYLE records, a
  deterministic `principles retrieve` (trigger/domain/min-signal/precedence), and the
  `principle-architect` subagent that turns a SPEC into ADR decision questions.
- `/sd:` commands and skills for init, new, spec, design, decide, plan, review,
  implement, verify, trace, override, config, status.
- The layered enforcement net: a main-thread `PreToolUse` gate (generated-file
  protection, DEEP-incomplete gate, governs/PLAN-scope enforcement, warn-first →
  deny, audited overrides, auto-escalation), the accepted-ADR governs reverse-index,
  REQ→STEP→TEST traceability gating DONE, deterministic ARCHITECTURE generation with
  staleness gating, and advisory TIGER_STYLE numeric-limit lint.
- Adversarial subagents: `plan-reviewer` (G3) and `qa-verifier` (read-only QA).
- Packaging: plugin manifest, marketplace entry, `engine selfcheck`, and CI.

### Notes
- A plugin-provided subagent's frontmatter `PreToolUse` hook is ignored by Claude
  Code, so the implement-phase gate runs on the **main thread** (see `spike/SPIKE.md`).
