# System-Design Plugin — Implementation Plan

> A Claude Code plugin (`/sd:` namespace) that orchestrates `request → SPEC → principle-derived ADRs → reviewed PLAN → implement → verify`, persisting every artifact as git-tracked markdown that is the context bus between phases, with a deterministic Node engine as the **sole** state writer and a **layered enforcement net** that makes plan/ADR adherence mechanical rather than aspirational.

**Status:** design-complete, plan-reviewed (one adversarial REVISE pass applied — see [Revision log](#revision-log)). Ready to build from M0.

---

## 1. Overview

### What is being built
A solo / small-team workflow plugin for non-trivial, evolving repos. It turns a vague change request into a governed lifecycle with human gates, carrying two differentiators:

1. **A machine-queryable principle rubric** (APoSD + TigerBeetle TIGER_STYLE). A **deterministic engine command (`principles retrieve`)** does trigger-matching, domain-gating and signal-scoring; the `principle-architect` subagent adds judgment (entity extraction, question phrasing, ADR staging). Output is a set of ADR *decision questions* with principle-cited recommended defaults.
2. **Real enforcement** of plan/ADR adherence through hooks + engine gates — most load-bearingly the `implementer` subagent's **own frontmatter** PreToolUse hook (the only hook that can block a subagent's edits), backed by main-thread hooks and engine preconditions.

### Architecture in one paragraph
A single zero-dependency Node ESM executable, **`bin/engine.mjs`**, is the *only* writer of workflow state (`docs/.state.json`) and the sole gatekeeper that refuses illegal lifecycle transitions via a frozen exit-code contract. Each phase is a **model-invoked SKILL** with a thin **`/sd:` slash-command alias**; skills never mutate state directly — they shell out to the engine and read/write git-tracked markdown artifacts that form the context bus into fresh **adversarial subagents** (`principle-architect`, `plan-reviewer`, `implementer`, `qa-verifier`). Human gates (G1 clarify, G2 decide, G3 plan-review) run on the **main thread** via `AskUserQuestion` (subagent-filtered, so subagents *author* questions and the main thread *asks* them). A **layered enforcement net** — main-session hooks plus the implementer subagent's own PreToolUse gate plus engine preconditions — backstops adherence; no single layer is claimed as a guarantee because plan-conformance is undecidable, so gates fall on *decidable proxies* (file scope, ADR governs-globs, REQ→STEP→TEST holes, stale ARCHITECTURE, tiger numeric limits).

```
 user ── /sd:<cmd> (commands/*.md) ──▶ sd-<phase> SKILL ──┬──▶ engine.mjs (ONLY state writer + gatekeeper)
                                                          │        └─ docs/.state.json (atomic temp+rename, schema-validated)
                                                          ├──▶ git-tracked markdown artifacts (the context bus)
                                                          └──▶ Task → fresh SUBAGENT (principle-architect | plan-reviewer | implementer | qa-verifier)
 enforcement (M3): hooks.json main-session ─ SessionStart rehydrate · PreToolUse pre-edit-protect (DEEP-edit gate) · PostToolUse adr-stale/tiger-lint
 enforcement (M5): agents/implementer.md FRONTMATTER PreToolUse hook ─ the only real blocker of a subagent's edits
```

### Verified platform facts (the design rests on these — confirmed against current Claude Code docs)
- **(a)** A `PreToolUse` hook declared in a **subagent's own frontmatter** fires and can **deny** that subagent's Edit/Write. Main-session hooks cannot reach into a subagent. → the implement-phase gate lives in `agents/implementer.md`.
- **(b)** `AskUserQuestion` is **main-thread-only** (filtered from subagent tool scope, with `EnterPlanMode`/`ScheduleWakeup`). → subagents *author* decision questions; main-thread skills *ask* them.
- **(c)** A denied tool call feeds its reason back to the model and the model **re-routes** (does not silently idle). → warn-first then hard-deny, with an audited `/sd:override`.
- **(d)** `hooks.json` matchers filter by **tool name only**; an optional `if` field (v2.1.85+) supports permission-rule path globs like `Edit(docs/adrs/**)` as a *best-effort* prefilter — authoritative path logic lives in the hook script.

### Guiding constraints (locked)
- **Engine is the only state writer.** Every other component treats `docs/.state.json` as read-only. Skills/hooks shell out; the engine refuses illegal moves.
- **Markdown artifacts are the entire shared memory.** Subagents and resumed sessions see no prior conversation — any fact a later phase needs must be persisted to an artifact.
- **Zero npm dependencies.** Node ≥18.3 (`parseArgs`/`structuredClone`); CI pins Node 22. Hand-rolled JSON-Schema *subset* validator and a narrow *flat*-YAML frontmatter parser.
- **Hooks degrade gracefully** — exit 0 / allow when not a workflow repo or node absent; decision hooks **fail open** on engine error so a bug never bricks editing (failures logged loudly).
- **Tiers gate cost:** TRIVIAL (CHANGELOG line only), STANDARD (SPEC+PLAN, optional ADRs), DEEP (full machine + traceability). Auto-escalate to DEEP on an **accepted**-ADR-governed-file edit or a new dependency (active from M5).
- **Append-only canonical ADRs; generated `ARCHITECTURE.md` / `PRINCIPLES.md`** ("do not edit by hand"), staleness-gated at DONE.

### v1 cut list (do NOT build)
Auto-drive `/sd:run`; a separate `INDEX.json` state index; **bidirectional** supersession + referential-integrity lint (v1 ADRs carry only `supersedes`); a working **house principle pack** + precedence-override example + deprecation lifecycle; vendored YAML + `jq` fallback; hash-chained per-artifact staleness beyond the single ARCHITECTURE hash; concurrent-branch locking.

### Resolved cross-spec conflicts (decisions, not options)
| Conflict | Resolution |
|---|---|
| State path / sidecars | **`docs/.state.json`** (`version: 1`). Sidecars: `docs/.arch-hash`, `docs/.architecture-stale`, `docs/.governs-index.json`, `docs/.state.bak`, `docs/.state.lock`. |
| Schema dir | **`schemas/`** (plural), draft-2020-12 subset, `additionalProperties:false`. One bundled validator `bin/lib/jsonschema.mjs`. |
| Requirement / step ids | **`REQ-NNNN-NN`** (NNNN = owning request), **`STEP-NNN`** (per-request). |
| ADR id | **`adr-NNNN`** (repo-global, gap-aware). `request:` frontmatter records origin. v1 carries `supersedes` only (no `supersededBy`). |
| Principle id | **`^(aposd\|tiger\|house)-[a-z0-9-]+$`** (slug form). `house-` reserved in grammar; no house pack ships in v1. |
| Override audit | **`requests/<id>/qa/overrides.log`** canonical file + durable `history[].override`. No top-level `.override.log`. |
| ADR acceptance verb | Dedicated **`engine accept-adr`** (called only by `/sd:decide`). `advance --to DECIDED --override` is refused (G2 is human-only). |
| Implementer gate channel | Hook emits **JSON `permissionDecision`** (carries reason); `exit 2`+stderr is the documented fallback. |
| Hook script language | **bash wrappers** (`hooks/*.sh`) sourcing `hooks/lib/common.sh`, delegating all logic to engine `hook-*` subcommands. |
| PLAN scope source | **Union of `steps[].files`** (no separate `allowedScope[]` field). |

---

## 2. Complete file tree

`★ = MVP spine (M0–M3)` · `▲ = downstream (M4–M6)` · `■ = packaging/richer (M7–M8)`

```
system-design/
├── .claude-plugin/
│   ├── plugin.json                         ■ manifest
│   └── marketplace.json                    ■ marketplace catalog entry (Claude Code requires it here)
├── README.md                               ■ tour, install, lifecycle diagram, enforcement table
├── LICENSE                                 ■ MIT
├── CHANGELOG.md                            ■ keep-a-changelog; top version == manifest version
├── settings.json                           ★ plugin settings (default config)
├── package.json                            ★ name/version, "test":"node test/run.mjs", type:module
│
├── bin/
│   ├── engine.mjs                          ★ executable entry + CLI dispatcher (only shebang module)
│   └── lib/
│       ├── cli.mjs                         ★ parseArgs SPECS, dispatch table, usage text
│       ├── output.mjs                      ★ stdout/stderr/--json contract (emit/emitError)
│       ├── state.mjs                       ★ load/save/validate/lock/recover/migrate (.state.json only)
│       ├── jsonschema.mjs                  ★ ~200-LOC draft-2020-12 subset validator (zero-dep)
│       ├── frontmatter.mjs                 ★ narrow FLAT-YAML read/stringify (deterministic, LF)
│       ├── ids.mjs                         ★ req/adr/REQ/STEP/principle id grammars + xref
│       ├── gate.mjs                        ★ GRAPH + isLegalEdge + gateReason
│       ├── preconditions.mjs               ★ one predicate per target; traceability/archStale INJECTED
│       ├── retrieve.mjs                    ★ deterministic principle retrieval (trigger/domain/signal)
│       ├── tier.mjs                        ★ classify + globToRegExp (governs-index read = M5)
│       ├── arch.mjs                        ▲ selectAcceptedAdrs / archHash / staleness / arch-sync
│       └── traceability.mjs                ▲ REQ→STEP→code→TEST matrix + holes
│
├── schemas/
│   ├── state.schema.json                   ★ docs/.state.json (version:1)
│   ├── spec.frontmatter.schema.json        ★ requests/<id>/SPEC.md
│   ├── adr.frontmatter.schema.json         ★ docs/adrs/<id>.md (governs[] durable)
│   ├── principle.frontmatter.schema.json   ★ docs/principles/<source>/<id>.md
│   ├── principles-index.frontmatter.schema.json ★ generated PRINCIPLES.md
│   ├── decision-question-set.schema.json   ★ principle-architect → /sd:decide handoff
│   ├── plan.frontmatter.schema.json        ▲ requests/<id>/PLAN.md (steps + traceability)
│   └── architecture.frontmatter.schema.json▲ generated ARCHITECTURE.md (staleness)
│
├── commands/                               (thin /sd: forwarders; no logic)
│   ├── init.md ★   new.md ★   spec.md ★   design.md ★   decide.md ★   status.md ★
│   ├── plan.md ▲   review.md ▲   implement.md ▲   verify.md ▲   trace.md ▲   override.md ▲   config.md ▲
│   └── adopt.md ■
│
├── skills/
│   ├── sd-init/SKILL.md ★     sd-intake/SKILL.md ★   sd-spec/SKILL.md ★
│   ├── sd-design/SKILL.md ★   sd-decide/SKILL.md ★   sd-status/SKILL.md ★
│   ├── sd-plan/SKILL.md ▲     sd-review/SKILL.md ▲   sd-implement/SKILL.md ▲
│   ├── sd-verify/SKILL.md ▲   sd-trace/SKILL.md ▲    sd-override/SKILL.md ▲
│   └── sd-adopt/SKILL.md ■
│
├── agents/
│   ├── principle-architect.md  ★ wraps `engine principles retrieve` → DecisionQuestionSet + staged ADRs
│   ├── plan-reviewer.md         ▲ adversarial G3 (Read/Grep/Glob only)
│   ├── implementer.md           ▲ Edit/Write/Bash + OWN frontmatter PreToolUse hook
│   └── qa-verifier.md           ▲ Read/Grep/Glob/Bash, NO Edit/Write
│
├── hooks/
│   ├── hooks.json               ★(SessionStart + pre-edit-protect)/▲(rest)
│   ├── README.md                ▲ advisory-vs-blocking table + honest gap statement
│   ├── lib/common.sh            ★ sd_guard / sd_engine / sd_stdin preamble
│   ├── session-start.sh         ★ rehydrate banner (status --hook)
│   ├── pre-edit-protect.sh      ★ MAIN-THREAD DEEP-edit gate + generated-file protection
│   ├── post-adr-edit.sh         ▲ rebuild governs-index + arch-stale flag
│   ├── tiger-lint.sh            ▲ advisory tiger-lint on every code edit
│   ├── user-prompt-active-req.sh▲ inject active req id each turn
│   └── implementer-gate.sh      ▲ THE implement-phase blocker (engine hook-gate)
│
├── docs/                        (corpus + generated; ships in plugin, copied into user repos by init)
│   ├── principles/
│   │   ├── principles.config.json          ★ precedence + domain-gates + min_signal
│   │   ├── aposd/ (8 records)              ★
│   │   ├── tiger-style/ (10 records)       ★
│   │   └── house/.gitkeep                  ★ reserved extension point (no pack in v1)
│   ├── adrs/_template/proposed-adr.md.tmpl ★ staged ADR shape
│   ├── spec/
│   │   ├── INFORMATION-MODEL.md            ▲ canonical schema/ID prose reference
│   │   └── POLISH-CHECKLIST.md             ■ human polish items
│   ├── PRINCIPLES.md                       ★ GENERATED index (do-not-edit)
│   └── ARCHITECTURE.md                     ▲ GENERATED (do-not-edit)
│
└── test/
    ├── run.mjs                             ★ runner (node --test) + --coverage-map
    ├── fixtures/                           ★/▲ docs valid+invalid, repo-seed, repo-golden, repo-nonworkflow
    ├── engine/ state.test.mjs ★ gates.test.mjs ★ retrieve.test.mjs ★ selfcheck.test.mjs ■
    ├── schemas/validate.test.mjs           ★
    ├── golden/arch-sync.test.mjs           ▲
    ├── hooks/ degradation.test.mjs ▲ hook-gate-decisions.test.mjs ▲ subagent-gate.integration.test ▲
    │         reverse-index.test.mjs ▲ override.test.mjs ▲ architecture-stale.test.mjs ▲ tiger-lint.test.mjs ▲
    └── e2e/lifecycle.test.mjs              ▲
.github/workflows/ci.yml                    ■
```

*The user-repo tree (`docs/`, `requests/<id>/{SPEC.md,PLAN.md,plan-review.md,decisions.json,qa/}`) is scaffolded by `engine init`; the `docs/principles/**` corpus ships in the plugin and is copied in at init.*

---

## 3. Milestone plan

Each milestone is independently shippable and dogfoodable. Dependencies are hard.

### M0 — Spike (de-risk the load-bearing platform facts)
- **Goal:** Prove the verified facts on the *installed* Claude Code version before building the spine — above all **fact (a)**: a subagent's own frontmatter `PreToolUse` hook fires and can deny.
- **Setup/creates:** `git init` the plugin repo; throwaway `agents/_spike-implementer.md` with a frontmatter `PreToolUse` hook → a one-line deny script; minimal `commands/_spike.md`; a fixture edit attempt.
- **Dependencies:** none.
- **DoD:** (1) An Edit issued **by the spike subagent** to a target file is **denied with the script's reason string**; removing the hook lets it through. (2) `${CLAUDE_PLUGIN_ROOT}` resolves identically inside the subagent hook command. (3) `node` ≥18.3 on PATH for `${CLAUDE_PLUGIN_ROOT}/bin`. (4) Confirm (documented, no runtime assertion needed) that `AskUserQuestion` is **absent from the spike subagent's tool list**. **If (1) fails → adopt the fallback design (run `implementer` on the main thread under the plugin `PreToolUse` gate) before M5.**

### M1 — Engine core
- **Goal:** The deterministic state engine + transition gatekeeper: frozen exit codes, atomic state I/O, id minting.
- **Creates:** `bin/engine.mjs`, `bin/lib/{cli,output,state,jsonschema,frontmatter,ids,gate,preconditions}.mjs`, `schemas/state.schema.json`, `test/run.mjs`, `test/engine/{state,gates}.test.mjs`, `test/schemas/validate.test.mjs`, `package.json`, `settings.json`.
- **Dependencies:** M0 (node confirmed).
- **Forward-dependency break:** `preconditions.mjs` takes **injected predicate functions** `traceabilityComplete(req)` and `archStale()`; in M1 they default to `() => ({ok:true, note:'deferred'})`. Real implementations wire in at M5 (traceability) and M6 (arch).
- **DoD:** `engine help/version` work; unknown sub/flag → exit 2; full transition matrix tested (non-edge → 6, edge-unmet → 5 with non-empty `missing[]`, `from===to` → 0 noop, no write); atomic temp+rename verified; `.bak` recovery + lock contention (exit 8) + mid-write `.tmp` recovery tested; schema-invalid state rejected leaving prior file intact; `register`/`init` idempotent; gap-aware ids. **Precondition tests cover M1-available targets only** (TRIAGED, SPECCED, ADR_PROPOSED, DECIDED, PLANNED); the DONE precondition is exercised against the injected default and re-tested for real in M5/M6. `npm test` green.

### M2 — Principles corpus + deterministic retrieval + principle-architect
- **Goal:** The machine-queryable rubric (differentiator #1), with the **scoring logic in the engine** so it is unit-testable, and the subagent that turns a SPEC into a DecisionQuestionSet.
- **Creates:** `schemas/{principle,principles-index,decision-question-set}.frontmatter.schema.json`; `docs/principles/principles.config.json`; 8 APoSD + 10 TIGER records; `docs/principles/house/.gitkeep`; `docs/adrs/_template/proposed-adr.md.tmpl`; `bin/lib/retrieve.mjs`; engine `principles {validate,index,lint,retrieve}`, `adr stage`, `accept-adr`, `decisions write`, `schema get`; `agents/principle-architect.md`; `test/engine/retrieve.test.mjs`.
- **Dependencies:** M1.
- **DoD:** `engine principles validate` reports all 18 valid; numeric limits machine-readable (assert-floor avg≥2; size 100col/70line; strategic 10–20%); `principles index` **byte-idempotent**, lists 18 + precedence line; **`principles retrieve --spec <file> --domain <d>` is fully unit-tested deterministically** — trigger word-boundary matching, domain-gate suppression of `tiger-static-allocation`/`tiger-no-recursion` on io-bound, `min_signal≥2` drops low-signal *recommended* records while `enforced` survive a single hit, precedence ordering. The `principle-architect` subagent is exercised by a **non-gating integration smoke** (model-invoked, not a deterministic unit test): given a fixture SPEC it must write only under `docs/adrs/` and emit schema-valid DecisionQuestionSet JSON. (No house pack, no deprecation lifecycle in v1.)

### M3 — Spec / Design / Decide + the main-thread gate + SessionStart  =  **THE MVP SPINE**
- **Goal:** First end-to-end usable slice: `init → new (intake) → spec` (with TRIVIAL early-exit) `→ design` (architect) `→ decide` (human G2), with the one **main-thread** DEEP-edit gate and session rehydrate. **Ship and dogfood ~2 weeks.**
- **Creates:** `commands/{init,new,spec,design,decide,status}.md`; `skills/{sd-init,sd-intake,sd-spec,sd-design,sd-decide,sd-status}/SKILL.md`; `schemas/{spec,adr}.frontmatter.schema.json`; `hooks/lib/common.sh`, `hooks/session-start.sh`, `hooks/pre-edit-protect.sh`, `hooks/hooks.json` (SessionStart + the main-thread DEEP-edit deny); engine `status --hook`, `context`, `await`, `decide`, `set-open-questions`, `validate-doc`, `triage`, `classify --apply`, `hook-gate` (SPEC-missing / ADR-proposed branch), `hook-pre-protect`.
- **Dependencies:** M1, M2.
- **Enforcement channel (explicit):** the M3 gate is a **MAIN-THREAD `PreToolUse` hook** (`pre-edit-protect.sh` → `engine hook-gate`). It denies a DEEP-tier edit while the active request has no `SPEC.md` or has any ADR still `proposed`, and protects generated/append-only files. The **implementer subagent frontmatter gate and all PLAN-scope/governs logic are M5** (no implementer stub ships in M3). Auto-escalation via the governs reverse-index is **not active until M5** (no accepted-ADR governs globs exist yet); M3 `classify` sets tier from heuristics/hints only.
- **DoD:** from a fresh repo, `/sd:init` scaffolds and is idempotent; `/sd:new` runs `sd-intake` → `intake.md` + `engine triage` reaching TRIAGED; `/sd:spec` writes `SPEC.md`, drives G1 via `engine set-open-questions` to zero, advances to SPECCED; a TRIVIAL request reaches DONE with only a CHANGELOG line; `/sd:design` invokes the architect, persists the returned set via `engine decisions write` → `requests/<id>/decisions.json`, stages proposed ADRs, advances to ADR_PROPOSED; `/sd:decide` asks via `AskUserQuestion` and `accept-adr` flips status, advancing to DECIDED; killing the session mid-G2 and resuming shows the `req-NNNN awaiting decisions` rehydrate line and resumes from `decisions.json`; **a main-thread Edit on a DEEP request with SPEC missing / ADR proposed is denied with a reason**; `status --hook` in a non-workflow dir exits 0 silently.

### M4 — Plan / Review (G3)
- **Goal:** PLAN authoring with REQ→STEP→TEST links and the adversarial plan-review gate, **engine-enforced**.
- **Creates:** `commands/{plan,review}.md`; `skills/{sd-plan,sd-review}/SKILL.md`; `agents/plan-reviewer.md`; `schemas/plan.frontmatter.schema.json`; engine `plan-check`, `validate-doc` (verdict-JSON validation).
- **Dependencies:** M3.
- **DoD:** `/sd:plan` from DECIDED writes `PLAN.md`; `engine plan-check` refuses advance on REQ-without-step or step-without-test; `/sd:review` delegates to `plan-reviewer` (Read/Grep/Glob only), writes `plan-review.md` + verdict JSON. **The PLAN_OK precondition is engine-enforced as `verdict==PASS` AND `blockerCount==0`** (computed by `engine validate-doc` over the verdict JSON), so a PASS-with-blockers review cannot advance even if a skill mis-reads it; the fixture PASS-with-blocker stays PLANNED.

### M5 — Implement / Verify + traceability + the real subagent gate
- **Goal:** Code gets written under the implementer's **own frontmatter** hook; QA verifies and routes loop-backs; traceability gates DONE; auto-escalation goes live.
- **Creates:** `skills/{sd-implement,sd-verify,sd-trace,sd-override}/SKILL.md`; `commands/{implement,verify,trace,override,config}.md`; `agents/{implementer,qa-verifier}.md`; `hooks/{implementer-gate,post-adr-edit,user-prompt-active-req}.sh`; `bin/lib/traceability.mjs`; engine `verify`, `trace`, `step-done`, `hook-gate` (full 7-step), `sync-index`, `governs`, `override add`, `config set`, `gate-done`; wire real `traceabilityComplete` into `preconditions.mjs`.
- **Dependencies:** M4; **M0 fact (a) confirmed** (else the main-thread fallback).
- **DoD:** `/sd:implement` delegates to `implementer` whose **frontmatter PreToolUse hook** denies an edit to an accepted-ADR-governed file that violates the ADR or falls outside PLAN scope (= union of `steps[].files`), and allows it after acceptance / in scope (the M0 canary, now wired and asserted in CI); **warn-first→hard-deny via `runtime.firstDenialSeen` in state** (no `session_id` dependency); `/sd:override` grants exactly one matching edit (`scope=once`) and audits to `qa/overrides.log`; `qa-verifier` has no Edit tool; `/sd:verify` routes `code_local→IMPLEMENTING`, `bad_adr→REVISING_ADR`, `missing_requirement→REVISING_SPEC`, mixed → highest priority (`missing_requirement`); `engine verify` exits 5 listing holes; DONE refused while traceability incomplete; auto-escalation to DEEP fires on an accepted-ADR-governed edit; hooks degrade + a **non-fatal** latency benchmark plus a structural assertion (the gate reads only state + the cached `docs/.governs-index.json`, never re-walks `docs/adrs/`).

### M6 — Tiger-lint + arch-sync
- **Goal:** Mechanized numeric-limit lint and generated-ARCHITECTURE staleness gating DONE.
- **Creates:** `bin/lib/arch.mjs`; `schemas/architecture.frontmatter.schema.json`; `docs/ARCHITECTURE.md` generation; `hooks/tiger-lint.sh`; engine `arch-sync [--check] [--frozen-clock]`, `hook-adr-edit`, `hook-tiger-lint`; wire real `archStale` into `preconditions.mjs`; `test/golden/arch-sync.test.mjs`, `test/hooks/{architecture-stale,tiger-lint}.test.mjs`.
- **Dependencies:** M5.
- **DoD:** `arch-sync` byte-deterministic (golden, frozen clock); `--check` exits 6 after an accepted-ADR Decision edit and 0 after re-sync; whitespace-only ADR edit does **not** change the hash; editing an accepted ADR flips `docs/.architecture-stale`; `gate-done`/DONE blocked while stale; tiger-lint analyzers flag 95-line fn / unbounded `while(true)` / assert-floor, ignore negatives, respect domain-gating; blocking mode (opt-in) routes findings to `qa/tiger-lint.json`.

### M7 — Packaging / docs / marketplace
- **Goal:** Installable, validated, documented v1.
- **Creates:** `.claude-plugin/plugin.json`; `marketplace.json`; `README.md`; `LICENSE`; `CHANGELOG.md`; `hooks/README.md`; `docs/spec/INFORMATION-MODEL.md`; `.github/workflows/ci.yml`; engine `selfcheck`; `test/engine/selfcheck.test.mjs`, `test/e2e/lifecycle.test.mjs`.
- **Dependencies:** M1–M6 (plugin repo already `git init`-ed in M0).
- **DoD:** `claude plugin validate .` passes; `engine selfcheck` asserts all schemas parse + only-supported-keywords + manifest well-formed + CHANGELOG-top == manifest version; plugin installs from a local `/plugin marketplace add ./`; e2e drives INTAKE→DONE and proves DONE blocked when a test ref is removed; CI green on Node 22 (zero npm deps).

### M8 — Richer: adopt (post-MVP)
- **Goal:** Onboard an existing repo.
- **Creates:** `commands/adopt.md`; `skills/sd-adopt/SKILL.md`.
- **Dependencies:** M7.
- **DoD:** `/sd:adopt` surveys via git log + file tree, drafts `ARCHITECTURE.md` + seed ADRs (`status: proposed`, `governs[]` over most-changed files), hands to `/sd:decide`; never auto-accepts; `validate` still passes.

---

## 4. Per-component build detail

### 4.1 Engine CLI surface

**Invocation:** always `node ${CLAUDE_PLUGIN_ROOT}/bin/engine.mjs <sub> ...`. Project root resolves `--project-dir` → `$CLAUDE_PROJECT_DIR` → cwd. Schemas resolve `--plugin-root` → `$CLAUDE_PLUGIN_ROOT` → relative to `bin/`. Global flags: `--json`, `--quiet`, `--project-dir`, `--plugin-root`.

**Frozen exit-code contract (public API):**

| Code | Name | Meaning |
|---|---|---|
| 0 | OK | success |
| 2 | EUSAGE | bad args / unknown subcommand or flag |
| 3 | ENOTREPO | not initialized (no workflow root) |
| 4 | ENOREQUEST | `--id` not found |
| 5 | EGATE | precondition unmet (also traceability holes, arch-stale) — *the branchable code* |
| 6 | EILLEGAL | transition edge not in graph |
| 7 | ESTATE | state corrupt/invalid/newer-version; or `selfcheck` failed |
| 8 | EWRITE | atomic write / fs / lock failure |
| 9 | ESCHEMA | referenced artifact frontmatter invalid |
| 70 | EINTERNAL | unexpected |

> Engine `hook-*` subcommands emit `permissionDecision`/`additionalContext` JSON and **exit 0** (the deny is in the payload). `--json` always co-emits `{ok, code}` so callers branch on structured data, never stderr text.

**Subcommands (▲ = first needed in M4+, otherwise M1–M3):**

| Subcommand | Purpose / contract | Exit |
|---|---|---|
| `init [--force]` | scaffold `docs/{adrs,principles,spec}`, `requests/`, copy corpus, write validated empty `.state.json`, generated stubs. Idempotent. | 0;8 |
| `register / new --title [--slug] [--tier] [--statement-file]` | mint `req-NNNN` (max+1), status INTAKE. Idempotent on open `--slug`. | 0;2;8 |
| `triage --id --tier --questions-file` | set tier + open questions; advance toward TRIAGED. | 0;4;5 |
| `set-open-questions --id --n <int>` | **(M3, drives G1)** set the residual open-question count the SPECCED gate checks. | 0;4;8 |
| `classify / tier --id [--touches-adr][--adds-dep][--files n][--hint][--apply]` | recommend tier; `--apply` writes (legal only INTAKE/TRIAGED). | 0;4;5;8 |
| `context --id [--json]` | resume bundle: status, tier, gate, awaiting, artifact paths, steps, openQuestions, overrideAvailable. **Every forward skill calls first.** | 0;3;4 |
| `advance / set --id --to <STATE> [--override "why"] [--gate] [--json]` | only status writer; `gateReason` evaluated; `from===to`→noop no-write; EILLEGAL→6; unmet+no-override→5; override allowed except `→DECIDED` (refused 5). | 0;2;4;5;6;8 |
| `gate --id --to [--json]` | dry-run of `advance` (never writes). | 0;5;6 |
| `await --id --gate <G1\|G2\|G3>` | persist "awaiting" cursor before a human gate (crash-safe). | 0;4;8 |
| `decisions write --req --from <dqs.json>` | **(M2/M3)** persist the architect's DecisionQuestionSet to `requests/<id>/decisions.json` (the architect is write-scoped to `docs/adrs/`, so the engine owns this handoff file). Validates against the DQS schema. | 0;4;9;8 |
| `decide --id --adr --verdict accept\|reject\|modify [--note]` | record per-ADR verdict (calls `accept-adr` on accept). | 0;4;8 |
| `accept-adr --req --adr` | the **G2 verb**: flip `proposed→accepted`, record history. Only `/sd:decide`. | 0;4;5;8 |
| `validate-doc --kind <k> --path <p>` | **(M3/M4)** referential checks a schema can't express: REQ-prefix == owner; plan-review/qa **verdict JSON** valid incl. `blockerCount`. | 0;9 |
| `plan-check --id` ▲ | every REQ ≥1 STEP, every STEP ≥1 TEST. | 0;5 |
| `step-done --id --step N` ▲ | mark plan step done. | 0;4;8 |
| `verify --id [--json]` ▲ | traceability + staleness; DONE pre-gate. | 0;4;5 |
| `trace --id [--json]` ▲ | render REQ→STEP→TEST matrix + holes. | 0;4 |
| `arch-sync [--check] [--frozen-clock]` ▲ | recompute hash, (re)write `.arch-hash`, clear `.architecture-stale`, emit `{action:'regenerate-architecture',adrs,hash}`; `--check` never writes (0 fresh / 6 stale). | 0;6;8 |
| `sync-index` ▲ | rebuild `docs/.governs-index.json` from accepted-ADR `governs[]`. | 0;8 |
| `governs --path <p> [--json]` ▲ | `{governed, adrs:[{id,glob,status}]}` for the gate. | 0;3 |
| `principles validate\|index\|lint\|retrieve` | corpus validity / generate index / dup-id+dangling-ref lint / **deterministic retrieval** (`retrieve --spec --domain` → scored candidate set). | 0;3;5 |
| `adr stage --request --from <dqs.json>` | validate DQS, register staged ADRs, SPECCED→ADR_PROPOSED. | 0;6;9 |
| `schema get <name>` | print a bundled schema. | 0 |
| `override add --req --path\|--glob --reason --scope once\|session\|request` ▲ | append override + audit. | 0;8 |
| `config set <key> <value>` ▲ | `enforcement=warn\|deny`, `tigerLintBlocking`. Atomic + validate. | 0;8 |
| `status [--id] [--hook] [--json]` | dashboard; `--hook` = SessionStart rehydrate, **always exit 0** outside a workflow repo. | 0;3 |
| `validate [--json]` | schema-validate state + referential cross-checks. | 0;7;9 |
| `selfcheck [--json]` ■ | schemas parse, only-supported-keywords, manifest well-formed, CHANGELOG==manifest version. | 0;7 |
| `hook-gate / hook-adr-edit / hook-tiger-lint / hook-active-req / hook-pre-protect / gate-done` | engine logic behind hook scripts; emit JSON; exit 0. | 0 |

### 4.2 State + lifecycle + frontmatter schemas

**`docs/.state.json` (`version:1`, keyed by `req-NNNN`, `additionalProperties:false`):**

```jsonc
{ "version": 1, "updatedAt": "<iso>", "meta": {…},
  "requests": { "req-0007": {
    "id":"req-0007", "slug":"rate-limit", "title":"…",
    "tier":"DEEP"|null, "status":"ADR_PROPOSED",        // status = resume cursor
    "openQuestions":0, "blockedReason":null, "escalatedFrom":"STANDARD"?,
    "createdAt":"<iso>", "updatedAt":"<iso>",
    "adrs":[{"id":"adr-0003","status":"proposed","governs":["src/db/**"]}],
    "overrides":[{"id":"ovr-1","glob":"src/db/**","adr":"adr-0003","reason":"…",
                  "by":"<email>","ts":"<iso>","scope":"once","consumedAt":null}],
    "config":{"enforcement":"warn","tigerLintBlocking":false},
    "runtime":{"firstDenialSeen":false},
    "history":[{"from":null,"to":"INTAKE","at":"<iso>","by":"engine",
                "gate":null,"override":null,"note":null}]
  }}}
```

**Lifecycle GRAPH (`gate.mjs`):**
```
INTAKE→{TRIAGED,BLOCKED}   TRIAGED→{SPECCED,BLOCKED}
SPECCED→{ADR_PROPOSED,PLANNED,BLOCKED}   ADR_PROPOSED→{DECIDED,REVISING_ADR,BLOCKED}
DECIDED→{PLANNED,BLOCKED}  PLANNED→{PLAN_OK,REVISING_SPEC,REVISING_ADR,BLOCKED}
PLAN_OK→{IMPLEMENTING,BLOCKED}  IMPLEMENTING→{VERIFYING,BLOCKED}
VERIFYING→{DONE,IMPLEMENTING,REVISING_ADR,REVISING_SPEC,BLOCKED}
REVISING_ADR→{ADR_PROPOSED,BLOCKED}  REVISING_SPEC→{SPECCED,BLOCKED}
DONE→{}  BLOCKED→{all non-terminal}
```

**Preconditions (`preconditions.mjs`, one predicate per target → `missing[]`) — single authoritative source, no duplication in prose:**

| Target | Predicate |
|---|---|
| TRIAGED | `tier` set |
| SPECCED | `SPEC.md` exists AND `openQuestions == 0` (**G1**) |
| ADR_PROPOSED | ≥1 ADR in `proposed` |
| DECIDED | zero ADRs still `proposed` (**G2**, override-refused) |
| **PLANNED** | `PLAN.md` exists **AND (`tier != DEEP` OR no required-but-unaccepted ADR)** — the SPECCED→PLANNED DEEP bypass-guard lives **here only** |
| PLAN_OK | `plan-review.md` verdict JSON has `verdict==PASS` **AND `blockerCount==0`** (**G3**, via `validate-doc`) |
| VERIFYING | `PLAN.md` exists |
| DONE | `traceabilityComplete(req).ok` **AND** `!archStale()` — both predicates **injected** (defaults pass-with-note until M5/M6) |

**Frontmatter schemas (draft-2020-12 subset, `additionalProperties:false`):**
- **SPEC** — `id`(=dir), `kind:spec`, `title`, `status:draft|clarifying|ready`, `requirements[]` of `{id:^REQ-NNNN-NN$, statement≤200, kind:functional|nonfunctional|constraint, priority:must|should|may, acceptance}`, `nonGoals[]`, `supersedes?`. REQ-prefix==owner enforced in `validate-doc`.
- **ADR** — `id:^adr-NNNN$`, `kind:adr`, `title`, `status:proposed|accepted|superseded|rejected`, `date`, `governs[glob]` (**durable**), `principles[id]`, `request?`, `decisionQuestion`, `choice`, `constraints?{forbids[],requires[]}`, `supersedes?`. Body = Context/Decision/Consequences prose. `proposed→accepted` only via `engine accept-adr`. *(No `supersededBy` in v1.)*
- **PRINCIPLE** — `id:^(aposd\|tiger\|house)-[a-z0-9-]+$`, `source`, `title`, `domain[]≥1`, `severity:advisory|recommended|enforced`, `statement`, `triggers[]≥1`, `recommended_default`, `decision_question_template`, `anti_patterns[]?`, `limits{}?`, `lint_rule?`. *(No deprecation fields in v1; all records ship active.)*
- **PLAN** ▲ — `id`, `kind:plan`, `status:draft|in_review|approved`, `reviewedBy?{gate:G3,verdict,blockerCount,at,subagent}`, `steps[]` of `{id:^STEP-NNN$, intent≤200, satisfies[REQ-id]≥1, files[], tests[path::name], adrs[]?, status:todo|doing|done}`. **PLAN scope = union of `steps[].files`.**
- **ARCHITECTURE** ▲ (generated) — `kind:architecture`, `generated:true`, `generator`, `generatedAt`, `sourceHash`, `doNotEdit:true`.
- **PRINCIPLES-INDEX** (generated) — `kind:principles-index`, `generated:true`, `count`, `sources{}`, `doNotEdit:true`.
- **decision-question-set** — `{request_id, generated_at, questions[≤7]}`; each `{id:^Q\d+$, staged_adr_id, entity, question≤280, options[2-4]{label≤40,summary≤200}, recommended_option_index, principle_ids[]≥1}`. *(Trimmed: no `superseded_recommendation_of`, no per-option `consequences`, no `signal{}` audit blob.)*

### 4.3 Principles corpus (the actual 18 records)

**`principles.config.json`:** `sources_precedence:["tiger-style","aposd"]` (house reserved, not shipped), `domain_gates:{io-bound:{suppress:[tiger-static-allocation,tiger-no-recursion]}, web:{suppress:[tiger-static-allocation]}}`, `min_signal:2`, `max_questions_per_run:7`.

| source | id | severity | domain | machine-usable hook |
|---|---|---|---|---|
| APoSD | `aposd-deep-modules` | recommended | general | module-boundary ADRs |
| APoSD | `aposd-information-hiding` | recommended | general | leakage/decomposition ADRs |
| APoSD | `aposd-complexity` | advisory | general | "is an ADR warranted" filter |
| APoSD | `aposd-define-errors-out` | recommended | general | error-model ADRs |
| APoSD | `aposd-comments-intent` | advisory | general | interface-comment convention |
| APoSD | `aposd-strategic` | advisory | general | `limits{investment_pct_min:10,max:20}` |
| APoSD | `aposd-general-purpose` | advisory | general | abstraction-generality ADRs |
| APoSD | `aposd-pull-complexity-down` | recommended | general | config-knob vs absorb ADRs |
| TIGER | `tiger-assert-floor` | enforced | general | `limits{assertions_per_function_avg_min:2}`, `lint_rule:assert-density` |
| TIGER | `tiger-bound-everything` | enforced | general,systems,concurrency | `lint_rule:unbounded-loop` |
| TIGER | `tiger-static-allocation` | recommended | systems | gated off io-bound/web |
| TIGER | `tiger-no-recursion` | recommended | systems | gated off io-bound |
| TIGER | `tiger-limits-size` | enforced | general | `limits{line_columns_max:100,function_lines_max:70}`, `lint_rule:size` |
| TIGER | `tiger-bottleneck` | recommended | general,systems,io-bound,data | network>disk>memory>cpu perf ADRs |
| TIGER | `tiger-batch` | recommended | general,io-bound,data,systems | N+1/amortization ADRs |
| TIGER | `tiger-name-units` | advisory | general | `lint_rule:name-units` |
| TIGER | `tiger-zero-tech-debt` | recommended | general | debt-paydown ADRs |
| TIGER | `tiger-handle-errors` | recommended | general | `lint_rule:error-handling` |

**Retrieval split (the testability fix):**
- **Deterministic, in `bin/lib/retrieve.mjs` (engine `principles retrieve`, unit-tested):** load config + corpus; `signal = count of triggers matched (case-insensitive, word-boundary) in the SPEC text`; domain-gate (drop suppressed ids + non-intersecting domains); drop `signal < min_signal` **unless `severity==enforced`**; resolve same-trigger conflicts by precedence; return the scored candidate set.
- **Judgment, in `agents/principle-architect.md` (model, integration-smoke only):** read SPEC → extract entities + domain + scale → call `engine principles retrieve` → cluster candidates by (entity, topic) into ≤7 questions → fill `decision_question_template` with concrete values + 2–4 options + `recommended_option_index` → write staged ADRs (`status:proposed`, `governs[]`, `principles[]`) under `docs/adrs/` → return **only** the DecisionQuestionSet JSON. Empty → `{questions:[],note:"no architecture decisions warranted at this tier"}`. `sd-design` then calls `engine decisions write` to persist the set.

### 4.4 Enforcement (two distinct channels)

**Channel 1 — main-session hooks (`hooks/hooks.json`): cannot reach into subagents.**

| event | matcher / `if` | script | blocking? | M |
|---|---|---|---|---|
| SessionStart | `startup\|resume\|clear\|compact` | `session-start.sh` | advisory | M3 |
| PreToolUse | `Edit\|Write\|MultiEdit` | `pre-edit-protect.sh` → `hook-gate` | **deny (main thread)**: DEEP-edit while SPEC-missing/ADR-proposed; generated/append-only protection | M3 |
| PostToolUse | `Edit\|Write\|MultiEdit` + `if:"Edit(docs/adrs/**)"` | `post-adr-edit.sh` | advisory: rebuild governs-index + stale flag | M5/M6 |
| PostToolUse | `Edit\|Write\|MultiEdit` | `tiger-lint.sh` | advisory (PostToolUse can't block) | M6 |
| UserPromptSubmit | — | `user-prompt-active-req.sh` | advisory: inject cursor | M5 |

`hooks/lib/common.sh`: `set -euo pipefail`; `sd_guard` → exit 0 if no node OR no `docs/.state.json`; advisory scripts `trap 'exit 0' ERR`. The `if` glob is a best-effort prefilter only — the script re-checks `file_path` authoritatively (fact d).

**Channel 2 — the real implement-phase blocker, `agents/implementer.md` frontmatter (M5):**
```yaml
hooks:
  PreToolUse:
    - matcher: "Edit|Write|MultiEdit"
      hooks: [{ type: command, command: "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/implementer-gate.sh\"", timeout: 8 }]
```
`implementer-gate.sh` → `engine hook-gate` decision order: (1) non-code / `docs/**` → allow; (2) resolve active request (non-terminal, most-recent `updatedAt`; **if ambiguous with no req-id, defer to a human via the main-thread skill** rather than guess); (3) DEEP & (SPEC missing OR active ADR still proposed) → **deny**; (4) reverse-index `file_path → adr`; accepted-ADR `forbids` match OR file governed but **outside PLAN scope (union of `steps[].files`)** → deny/ask; (5) matching unexpired override → allow + `additionalContext`; (6) **warn-first**: `config.enforcement=='warn'` OR `!runtime.firstDenialSeen` → `permissionDecision:"ask"` (then set the guarded flag), else `"deny"`. **Fail-open** (`echo '{}'; exit 0`) on engine error, logging to `${CLAUDE_PLUGIN_DATA}/gate-errors.log`. Reads only `.state.json` + the mtime-cached `docs/.governs-index.json` (never re-walks `docs/adrs/`); latency tracked by a **non-fatal** benchmark.

**`docs/.governs-index.json`** (engine-owned, survives request archival because keyed off canonical accepted-ADR `governs[]`): `{version, builtAt, acceptedSetHash, entries:[{adr,status,governs[],constraints{forbids,requires}}], globIndex:[{glob,adr}]}`. Rebuilt on any `docs/adrs/**` write, ADR acceptance, or mtime mismatch. **`docs/.architecture-stale`** sentinel present ⇒ `gate-done` refuses DONE until `arch-sync` regenerates ARCHITECTURE.

### 4.5 Skills / subagents contracts

**Skill protocol (every forward skill):** `engine context --id` first → entry-state guard (refuse if status ∉ allowed set, no `advance`) → Read named artifacts → do work → write artifact → `engine advance`. **Before any human gate:** persist the artifact AND `engine await --gate` so session loss is recoverable. Verbatim RULES block: *"Never hand-edit docs/.state.json. Honor gates. Persist before asking."* A lint test greps skill/command bodies for direct state writes (must be absent).

**`/sd:new` → `sd-intake`:** there is no separate `/sd:intake` command. `sd-intake` writes `requests/<id>/intake.md`, calls `engine triage` (TRIAGED), and proposes a tier via `engine classify`.

**`/sd:design` handoff:** invoke `principle-architect` → it stages ADRs + returns DQS JSON → `sd-design` calls `engine decisions write --req --from <dqs>` → `engine adr stage` → advance ADR_PROPOSED. `/sd:decide` reads `decisions.json`, asks via `AskUserQuestion`, calls `engine decide`/`accept-adr`.

| Subagent | tools | returns |
|---|---|---|
| `principle-architect` | Read, Grep, Glob, **Write (only `docs/adrs/`)**, Bash (engine) | DecisionQuestionSet JSON |
| `plan-reviewer` | Read, Grep, Glob | `{verdict:PASS\|REVISE, summary, blockerCount, findings[{severity,category,req,step,adr,detail,fix}], coverage}` |
| `implementer` | Read, Edit, Write, MultiEdit, Bash, Grep, Glob + **own PreToolUse hook** | `{steps[{step,status,files_touched,notes,hook_denials[]}], summary}` |
| `qa-verifier` | Read, Grep, Glob, Bash (**NO Edit/Write**) | `{overall, results[{req,test,status,evidence{command,output_excerpt}}], failures[{req,root_cause,adr,justification}]}` |

**Loop-back router (`sd-verify`):** overall PASS → DONE; else highest priority among failures, `missing_requirement > bad_adr > code_local` → `REVISING_SPEC / REVISING_ADR / IMPLEMENTING`.

### 4.6 Traceability scheme

**ID grammar (frozen):** `req-NNNN` · `adr-NNNN` · `REQ-NNNN-NN` (NNNN = owner) · `STEP-NNN` (per-request) · `(aposd\|tiger\|house)-<slug>` · test ref `<relative-test-path>::<test name>`.

`computeMatrix({spec, plan, testIndex})` →
```
{ rows:[{req, steps:[stepId], tests:[testRef], covered}],
  holes:{reqWithoutStep[], stepWithoutTest[], danglingSatisfies[{step,req}], danglingTestRef[{step,testRef}]},
  complete }   // complete ⟺ all four hole arrays empty
```
`covered` = REQ has ≥1 STEP AND each satisfying STEP has ≥1 resolvable test. `testIndex` = `path::name` refs the discovery probe found (**v1 honest scope:** file existence + best-effort name grep — "the test actually exercises the REQ" is `qa-verifier`'s job, not the engine's). A dangling test ref is allowed mid-IMPLEMENTING (`step.status=todo|doing`); it becomes a hole only at the DONE gate. `engine verify` exits 5 listing every hole; DONE refused.

**Generated-file staleness:** FRESH ⟺ `frontmatter.sourceHash == sha256(canonical concat of accepted-ADR Decision/Consequences frontmatter + principles index)`. **sourceHash is the authority; mtime only a tie-breaker** (immune to git-checkout mtime resets). `arch-sync --check` exits 6 stale / 0 fresh.

---

## 5. Test & CI strategy

Zero-dep: `node:test` + `node:assert/strict` only. `npm test` → `node test/run.mjs` → `node --test test/**/*.test.mjs`. Each test makes its own `os.tmpdir()` fixture and cleans up. `.gitattributes` pins LF on `*.md`/`*.json` fixtures.

| Layer | Asserts |
|---|---|
| Engine units (`state`,`gates`) | full transition matrix (edge/non-edge/noop); atomic write (no `.tmp`); `.bak` recovery; lock → 8; mid-write recovery; schema-invalid rejected leaving prior file; idempotent register/init; gap-aware ids; each available precondition's `missing[]`. |
| **Retrieval (`retrieve.test.mjs`)** | trigger word-boundary matching; domain-gate suppression; `min_signal` drop vs `enforced` bypass; precedence ordering. *(The deterministic core of differentiator #1 — fully unit-tested.)* |
| Schema (`validate`) | each schema accepts its golden-valid fixture, rejects each invalid fixture at the exact pointer; `stringify(read(x))===x` round-trip; **any unsupported schema keyword throws** (guards zero-dep). |
| Golden arch-sync ▲ | two runs byte-identical (`--frozen-clock`); `--check` 6 after Decision edit, 0 after re-sync; whitespace-only ADR edit → same hash. |
| Hook scripts ▲ | non-workflow/no-node → exit 0 / `{}`; decision branches (allow/deny/ask with exact reason); warn-first→deny via `firstDenialSeen`; override scope + audit line; index survives request archival; stale flag blocks `gate-done`; analyzers flag/ignore + domain-gating; **latency = non-fatal benchmark + structural assert (no `docs/adrs` re-walk).** |
| **Subagent canary** ▲ (`subagent-gate.integration.test`) | the implementer's **own frontmatter PreToolUse hook fires**: edit to a governed file with a violated ADR denied with the engine's reason; allowed after `accept-adr`. (M0 fact, locked into CI.) |
| Skills ▲ | 13 commands validate + forward; out-of-state refusal (no advance); TRIVIAL→DONE CHANGELOG-only; **PASS-with-blocker stays PLANNED (engine-enforced)**; loop-back priority; G2 crash-safe (`await` + `decisions.json` before AskUserQuestion); golden Task prompt has all required inputs. |
| Architect | **non-gating integration smoke** (model-invoked): writes only `docs/adrs/`, emits schema-valid DQS. Not a deterministic unit gate. |
| E2E ▲ | git-init `repo-seed`, run real engine `new→…→verify`; DONE only after traceability complete + arch fresh; DONE blocked when a test ref is removed. |
| Selfcheck ■ | exit 0 on good repo; exit 7 on broken copies (schema regression / version divergence / unsupported keyword). |

**CI (`.github/workflows/ci.yml`):** `on:[push,pull_request]`, `ubuntu-latest`, `setup-node@v4` node 22, steps: `node test/run.mjs`; `node bin/engine.mjs selfcheck`; `node test/run.mjs --coverage-map` (every subcommand exercised); `claude plugin validate . || true` (non-fatal-guarded — `selfcheck` is the independent backstop). **No `npm install`** (zero-dep promise).

---

## 6. Definition of highly polished

### MVP done (after M3, held through M7)
- [ ] Engine: precise subcommands/flags, frozen exit-code contract, idempotent, `--json` co-emits `{ok,code}`.
- [ ] `docs/.state.json` atomic (temp+rename, same-dir), schema-validated on every save, `.bak` recovery, never persists invalid state.
- [ ] All 18 principle records valid; `principles index` byte-idempotent; **`principles retrieve` deterministic + unit-tested** (domain-gating, min_signal, precedence).
- [ ] `principle-architect` writes only `docs/adrs/`; `engine decisions write` persists the handoff; G2 crash-safe; SessionStart rehydrates.
- [ ] The **main-thread** DEEP-edit gate denies with a reason; hooks degrade (exit 0 / fail-open) outside a workflow repo.
- [ ] `npm test` green on Node 22, zero deps.

### v2 done (after M7)
- [ ] All 13 `/sd:` commands + skills + 4 subagents shipped; full layered net (implementer PreToolUse gate + `gate-done`) proven by the **subagent canary in CI**.
- [ ] Traceability gate, arch-staleness, tiger-lint numeric limits all gating DONE; engine-enforced PLAN_OK blocker gate.
- [ ] Override escape hatch audited; warn→deny toggle.
- [ ] `hooks/README.md` advisory-vs-blocking table + honest undecidability statement; `INFORMATION-MODEL.md`; README quickstart→DONE; CHANGELOG.
- [ ] `engine selfcheck` is the single machine-checkable polish gate. *(File-purpose/acceptance-criteria coverage is a human review-checklist item in `POLISH-CHECKLIST.md`, not a machine gate.)*

### `claude plugin validate` + marketplace
- Manifest minimal fields: `name, version, description, author, license, homepage, keywords, commands:"./commands", skills:"./skills", agents:[<file paths>], hooks:"./hooks/hooks.json"`. The `agents` field requires an array of individual agent file paths (a directory string fails `claude plugin validate`). No `mcpServers`.
- `.claude-plugin/` holds both `plugin.json` and `marketplace.json` (Claude Code resolves `/plugin marketplace add` against `.claude-plugin/marketplace.json`). The catalog entry's `source:"./"` resolves to the repo root (parent of `.claude-plugin/`), where the plugin content dirs live. Plugin repo is a git repo (init'd in M0).
- CI runs `claude plugin validate` (non-fatal-guarded) **and** `engine selfcheck` as an independent backstop. Install: `/plugin marketplace add ./` → `/plugin install system-design`.

---

## 7. Risk register

| # | Risk | Mitigation | De-risking fact |
|---|---|---|---|
| R1 | Subagent frontmatter PreToolUse hook stops firing → the only real implement blocker silently lost. | **M0 spike + CI canary**; SessionStart reports "gate verified/UNVERIFIED"; fallback = run implementer on the main thread under the plugin PreToolUse gate. | (a) |
| R2 | Hand-rolled JSON-Schema validator diverges → silently accepts invalid state. | Restrict schemas to the implemented subset; **any unsupported keyword throws at load** (fail-closed); validator + schemas co-evolve in one PR. | sole writer; small schemas |
| R3 | Flat-YAML parser mis-reads nested maps → wrong gate. | Contract is **flat**; parser rejects nested maps with ESCHEMA; skills constrained to flat frontmatter. | node always present |
| R4 | Fail-open on engine error = zero enforcement, unnoticed. | Gate errors → `${CLAUDE_PLUGIN_DATA}/gate-errors.log`; SessionStart surfaces "enforcement degraded". Deliberate: never brick editing, make degradation loud. | (c) |
| R5 | Gate latency on every Edit. | Read only state + cached index; **non-fatal** benchmark + structural "no `docs/adrs` re-walk" assert; 8s timeout is far above target. | — |
| R6 | Over-blocking frustrates the solo dev → uninstall. | warn-first→hard-deny (first denial is `ask`); audited `/sd:override`; `enforcement=warn` config; TRIVIAL/STANDARD largely ungated. | (c) |
| R7 | Atomicity breaks on exotic FS. | `.tmp` in target dir (same-fs rename); keep `.bak`; mtime/sourceHash staleness avoids exotic features; README: `docs/` on local FS. | — |
| R8 | Crude trigger matching → false ADR recommendations erode trust. | `min_signal≥2`, domain-gating, clustering; **human G2 is the authoritative backstop**; deterministic + unit-tested retrieval. | (b) |
| R9 | `AskUserQuestion` accidentally invoked from a subagent. | All AskUserQuestion only in main-thread skills; test asserts no `agents/*.md` references it; subagents author `decisions.json`. | (b) |
| R10 | Golden tests flaky (timestamps, key order, newlines). | `--frozen-clock`; deterministic key-ordered serializer; forced LF; `.gitattributes`. | — |
| R11 | Traceability false-DONE: test refs are strings, not executed tests. | v1 verifies existence + name match (stated narrowly); execution-evidence is `qa-verifier`'s job. | — |
| R12 | `if:"Edit(docs/adrs/**)"` glob semantics vary across versions. | `if` is best-effort prefilter only; the script re-checks `file_path` authoritatively. | (d) |

**The M0 spike that MUST pass before M5:** the subagent-frontmatter PreToolUse deny canary (R1). If it fails, switch to the main-thread-implementer fallback before building M5.

---

## 8. Open decisions (with recommended defaults)

| # | Decision | Recommended default |
|---|---|---|
| O1 | `openQuestions` source. | **Engine stays prose-ignorant**: skills call `engine set-open-questions --id --n`. |
| O2 | Override audit location. | **`requests/<id>/qa/overrides.log`** + durable `history[].override`. |
| O3 | REQ/STEP/TEST tagging syntax. | **Frontmatter** (`steps[].satisfies`, `steps[].tests:["path::name"]`), not inline prose tags. |
| O4 | ADR acceptance verb. | **`engine accept-adr`** (G2 = one explicit verb); `advance --to DECIDED --override` refused. |
| O5 | Min Node + preflight. | **Node ≥18.3**; engine prints version preflight, exits 2 if below; CI pins 22. |
| O6 | Do *proposed* ADR `governs[]` participate in auto-escalation? | **Only accepted ADRs govern**; the DEEP-edit gate still blocks on proposed ADRs via the SPEC/ADR-incomplete precondition. |
| O7 | `severity:enforced` vs `lint_rule`. | **Keep both, distinct roles**: `severity` gates retrieval; `lint_rule` names the mechanized check. |
| O8 | Deprecated principles. | **Deferred to v2** (all 18 ship active; no lifecycle fields in v1). |
| O9 | House packs introduce new domains? | **Fixed domain enum in v1**; house pack deferred. |
| O10 | `decisions.json` vs `.md`. | **JSON canonical** (drives AskUserQuestion); human-readable `.md` deferred. |
| O11 | `sd-implement`: one Task per STEP vs per PLAN. | **One Task per PLAN** in v1; revisit if hook granularity proves too coarse. |
| O12 | Verdict-schema validation owner. | **Engine `validate-doc`** (enforcement stays engine-owned, not skill-trust). |
| O13 | Ambiguous active request, no req-id. | **Ask the human** (main-thread AskUserQuestion); never auto-pick. |
| O14 | `selfcheck` + `[Unreleased]` CHANGELOG. | **Tolerate `[Unreleased]`** during dev; enforce exact match only on release tags. |
| O15 | `warn-first` scope. | **`runtime.firstDenialSeen` in state** (no `session_id` dependency). |
| O16 | Reverse-index live-scan vs cached. | **Cached `docs/.governs-index.json`** (mtime-checked) — a derived sidecar, not a state index (honors the cut). |

---

## Revision log

This plan incorporates one adversarial plan-review pass (verdict: REVISE). Applied fixes:

1. **M3 enforcement-channel contradiction resolved** — the M3 DEEP-edit gate is now explicitly a **main-thread `PreToolUse` hook** (`pre-edit-protect.sh`); the implementer subagent frontmatter gate and all PLAN-scope/governs logic moved entirely to M5. No implementer stub in M3.
2. **PLAN scope defined** — `union of steps[].files` (no phantom `allowedScope[]` field), referenced consistently in §4.2/§4.4/§4.5.
3. **`decisions.json` writer defined** — new `engine decisions write` (the architect is write-scoped to `docs/adrs/`, so the engine owns the handoff file).
4. **Missing commands added** — `set-open-questions` (drives G1) and `validate-doc` (REQ-owner + verdict validation) now appear in §4.1 and their milestones.
5. **M1 forward-dependency broken** — `preconditions.mjs` takes injected `traceabilityComplete`/`archStale` predicates (safe defaults until M5/M6); M1 DoD tests only M1-available preconditions.
6. **SPECCED→PLANNED rule stated once** — the DEEP bypass-guard lives in the PLANNED precondition only.
7. **Untestable criteria fixed** — principle retrieval moved into the deterministic, unit-tested `engine principles retrieve` (architect smoke is non-gating); CI latency is a non-fatal benchmark + structural assert; warn-first scoped to `runtime.firstDenialSeen` (no `session_id` dependency); PLAN_OK blocker gate is engine-enforced; M0 AskUserQuestion check softened to a documented tool-list confirmation.
8. **Scope creep cut from MVP** — no house pack / precedence-override example, no deprecation lifecycle, no bidirectional `supersededBy`, trimmed DQS schema.
