# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the top released version must
match the plugin manifest version (`engine selfcheck` enforces this on release).

## [Unreleased]

### Added
- Four `house` decision principles distilled from the ponytail lazy-senior-dev
  discipline: `house-comprehend-first` (trace the real flow before choosing a solution
  shape), `house-simplicity-ladder` (prefer the cheapest viable rung — reuse, stdlib,
  native, installed dep — and stop at the first that holds), `house-root-cause` (fix at
  the shared site after enumerating callers, not the symptom), and
  `house-falsifiable-decision` (state the observable a decision must move and validate
  to disprove it; a null result blocks the change). Corpus grows 18 → 22 records;
  `docs/PRINCIPLES.md` regenerated. All four are advisory/recommended, so they add ADR
  decision questions without introducing a new hard gate.

### Fixed
- `/plugin marketplace add icento/system-design` failed with "Marketplace file not
  found": moved the catalog from the repo root to `.claude-plugin/marketplace.json`,
  the path Claude Code resolves (the `source:"./"` entry still points at the repo root).
- `plugin.json` `agents` field rejected by `claude plugin validate` ("Invalid input"):
  it requires an array of individual agent file paths, not a directory string. Now
  `claude plugin validate` passes clean, and the marketplace manifest has a description.

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
