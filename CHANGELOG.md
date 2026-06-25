# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the top released version must
match the plugin manifest version (`engine selfcheck` enforces this on release).

## [Unreleased]

## [0.4.0] - 2026-06-25

### Fixed
- **Multi-request edit gate no longer bypassable.** The PreToolUse gate chose a single
  "active" request by most-recently-updated, so registering (or merely touching) a second
  request silently disabled the in-flight request's PLAN-scope / DEEP-incomplete
  protection. The gate now resolves the governing request **from the file being edited**
  (an IMPLEMENTING request whose PLAN scope covers it, else any IMPLEMENTING request, else
  a DEEP undecided request, else a governing request), and the tie-break comparator is
  transitive.
- **The engine now enforces the final QA gate.** Reaching `DONE` (and `gate-done`/`verify`
  for non-TRIVIAL requests) requires `qa/qa.verdict.json` with `overall: PASS`, mirroring
  how `PLAN_OK` requires a `PASS` plan-review. Previously a `FAIL` verdict only blocked
  DONE if the `/sd:verify` skill chose to route a loop-back.
- **Global flags work in any position.** `engine --project-dir D --json status` (the form
  the `ENGINE` command macro teaches) now resolves the subcommand just like
  `engine status --project-dir D --json`; a flags-only invocation gives a position-aware
  EUSAGE instead of `unknown command "--project-dir"`.
- **`gate --json` reports a code matching the exit code.** It previously emitted
  `{ ok:false, code:0 }` while the process exited 5/6, violating the `--json` contract.
- **`engine await --gate` validates reachability** — it refuses to record a cursor for a
  gate the request has already passed, or on a terminal request.

### Changed
- `classify` now reports the hint-free `signalTier` alongside the recommendation and flags
  a `hintDisagrees` case (with a `signals suggest X; hint says Y — confirm` reason), so a
  `--hint` is a prior, not a rubber stamp.
- `accept-adr` / `decide` now report `architectureStale` and tell you to run `arch-sync`
  **at decision time**, instead of letting the staleness ambush the final `verify`.
- `context`/`status` now include a deterministic `nextCommand` computed by the engine, so
  the next `/sd:` step can't drift from the lifecycle graph.
- The `principle-architect` agent prompt now states the ADR frontmatter length caps
  (`choice` ≤400, `decisionQuestion` ≤280, `title`/glob/constraint items ≤200) and
  self-validates each staged ADR with `validate-doc --kind adr` before returning.
- The DEEP-incomplete edit-gate denial no longer points at `/sd:override` (which does not
  apply to that gate); it directs you to write the SPEC / decide the ADRs.

### Removed
- The orphaned `session` override scope (no session boundary existed, so it never expired
  and behaved like a permanent `request` scope). `--scope` is now `once|request`.

## [0.3.0] - 2026-06-24

### Changed
- Consolidated the user-facing surface to **`/sd:` commands only**. Each phase used to
  ship as both a model-invoked SKILL (`skills/sd-*/SKILL.md`) and a thin `/sd:` command
  that delegated to it, so the slash menu listed every phase twice (e.g. `/sd:init` *and*
  `/sd-init`). Every skill's full procedure (engine preamble, entry guard, protocol,
  RULES) is now inlined into its command, the `skills/` directory and the manifest's
  `skills: "./skills"` entry are removed, and `config.md` (which never had a skill) is
  unchanged. The lint test now asserts commands are self-contained (no dangling
  `` `sd-*` skill `` delegation). **Behavior note:** phases are now invoked only via their
  explicit `/sd:` command — they can no longer be auto-triggered from natural-language
  intent the way a skill description could.

## [0.2.0] - 2026-06-24

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
- `engine retier --id <id> [--to TIER | --restore]` — correct an over-classified tier
  after triage (the lifecycle previously had no way to lower a tier once a request left
  INTAKE/TRIAGED), or undo a governed-file auto-escalation to DEEP via `--restore`, which
  consumes the previously-dead `escalatedFrom` marker. Refuses a downgrade to TRIVIAL once
  past TRIAGED, because TRIVIAL short-circuits the SPEC/PLAN/review gates. Documented in
  the `sd-intake` skill.

### Fixed
- VERIFY phase taught the `arch-sync` remedy where the gate actually fires. The DONE /
  `engine verify` gate could fail with "ARCHITECTURE.md is stale" while `sd-verify` never
  mentioned `arch-sync` and the natural guess `arch-sync --check` only *reports* (it does
  not clear) staleness. `sd-verify` and `commands/verify.md` now document the fix-in-place
  (regenerate with bare `arch-sync`, then re-verify — not a loop-back), and the engine's
  gate strings name the exact invocation and the `--check` caveat.
- `principles retrieve` now surfaces the `dropped[]` set and `min_signal` it already
  computes, and distinguishes "no principles triggered (genuinely trivial)" from
  "triggered but filtered below the signal floor". The `principle-architect` reads
  `dropped[]` and grounds its empty-question-set `note` in *why* it was empty instead of a
  fixed boilerplate string — so an empty ADR set no longer hides whether retrieval matched.
- `sd-design`: the empty-ADR branch's parenthetical "(advance SPECCED → PLANNED for
  STANDARD)" invited a premature bare advance the engine refuses (PLAN.md is authored in
  the plan phase). It now states the advance belongs to `/sd:plan`, applies on any tier,
  and points at the retrieval `dropped[]` for the below-floor case. `sd-plan`'s entry guard
  and `SPECCED → PLANNED` ownership were clarified to match.
- `sd-decide` gained an explicit "no decisions to make" branch: on the empty path it skips
  the gate and routes to `/sd:plan` instead of authoring/`decisions write`-ing an empty
  `decisions.json`.
- The G3 precondition message named `plan-review.md` though the gate actually reads
  `qa/plan-review.verdict.json`; corrected to name the file it inspects.
- `sd-plan` documents that `engine step-done` re-serializes `PLAN.md` through the YAML
  writer (canonicalizing layout, never content) — it is the engine, not a silent linter,
  and no hook reformats `PLAN.md`.
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
