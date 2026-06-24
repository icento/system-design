# system-design (`/sd:`) — a governed Claude development workflow

A Claude Code plugin that turns a vague change request into a governed lifecycle:

```
request → SPEC → principle-derived ADRs → reviewed PLAN → implement → verify → DONE
```

Every artifact is a git-tracked markdown file — the **context bus** between phases. A
single **zero-dependency Node engine** is the *only* writer of workflow state and the
gatekeeper of every transition, and a **layered enforcement net** makes "follow the
plan and the ADRs" mechanical rather than aspirational.

Two things make it more than a checklist:

1. **A machine-queryable principle rubric.** APoSD (*A Philosophy of Software Design*)
   and TigerBeetle's TIGER_STYLE are encoded as 18 records with triggers, domains, and
   numeric limits. A deterministic engine command scores them against your SPEC; a
   subagent turns the top candidates into architecture **decision questions** with
   principle-cited recommendations.
2. **Real enforcement.** A `PreToolUse` gate blocks edits that fall outside the approved
   PLAN scope or violate an accepted ADR, traceability gates `DONE`, and a generated
   `ARCHITECTURE.md` must be fresh — backed by an audited override escape hatch.

## Install

From GitHub (recommended) — in Claude Code:

```text
/plugin marketplace add icento/system-design
/plugin install sd
```

Or from a local clone (for development):

```text
git clone https://github.com/icento/system-design
/plugin marketplace add ./system-design
/plugin install sd
```

`/plugin marketplace add` accepts an `owner/repo` shorthand or a full URL; the
marketplace catalog lives in [`marketplace.json`](marketplace.json). Requires Node
≥ 18.3 on your PATH (the engine is zero-dependency).

Then, in a repo you want to work in:

```text
/sd:init            # scaffold docs/ and requests/, copy the principle corpus
/sd:new  Add rate limiting to the public API
/sd:spec            # write the SPEC, resolve open questions (gate G1)
/sd:design          # principle-derived ADR questions (stages proposed ADRs)
/sd:decide          # you choose (gate G2)
/sd:plan            # an implementation plan with REQ→STEP→TEST links
/sd:review          # adversarial plan review (gate G3)
/sd:implement       # build it, within the plan scope (the gate enforces this)
/sd:verify          # QA/QC, traceability, then DONE
```

**Already have a codebase?** Run `/sd:adopt` instead of `/sd:init` + `/sd:new`: it
surveys the repo (git history + file tree), drafts **proposed** seed ADRs over your
most load-bearing files, and hands them to `/sd:decide` so the architecture you already
have becomes governed. It never accepts an ADR on its own — you ratify the baseline.

`/sd:status` shows where everything stands; the SessionStart hook re-surfaces pending
gates after a resume or compaction.

## The lifecycle

```
INTAKE ─▶ TRIAGED ─▶ SPECCED ─┬─▶ ADR_PROPOSED ─▶ DECIDED ─▶ PLANNED ─▶ PLAN_OK
                              └────────────────────────────▶ PLANNED      │
   (G1 clarify)        (G2 decide)            (G3 review) ◀───────────────┘
                                                              │
   DONE ◀─ VERIFYING ◀─ IMPLEMENTING ◀───────────────────────┘
            │  └─▶ REVISING_SPEC / REVISING_ADR / IMPLEMENTING  (loop-backs)
```

Three **tiers** gate cost: `TRIVIAL` (a CHANGELOG line — straight to DONE), `STANDARD`
(SPEC + PLAN, ADRs optional), `DEEP` (the full machine + traceability). Editing an
accepted-ADR-governed file auto-escalates a request to DEEP.

## Commands

| Command | Phase | Gate |
|---|---|---|
| `/sd:init` | scaffold the workflow | — |
| `/sd:adopt` | onboard an **existing** repo (seed ADRs + ARCHITECTURE) | **G2** ratify |
| `/sd:new` | intake + triage | — |
| `/sd:spec` | write the SPEC | **G1** clarify |
| `/sd:design` | principle-derived ADR questions | — |
| `/sd:decide` | record decisions | **G2** decide (human-only) |
| `/sd:plan` | implementation plan (REQ→STEP→TEST) | — |
| `/sd:review` | adversarial plan review | **G3** review |
| `/sd:implement` | build to the plan | scope gate |
| `/sd:verify` | QA/QC + traceability | DONE gate |
| `/sd:trace` | the traceability matrix | — |
| `/sd:override` | audited gate exception | — |
| `/sd:config` | per-request enforcement | — |
| `/sd:status` | where things stand | — |

## Enforcement (honest about what each layer can do)

| Layer | Mechanism | Blocks? |
|---|---|---|
| Engine preconditions | illegal transitions / unmet gates | yes (the engine refuses) |
| Generated-file protection | `PreToolUse` deny on `PRINCIPLES.md` / `ARCHITECTURE.md` / state | yes |
| Implement gate | `PreToolUse` deny outside PLAN scope / accepted-ADR-governed | yes (warn-first → deny) |
| Traceability | `DONE` refused until REQ→STEP→TEST is complete | yes |
| ARCHITECTURE staleness | `DONE` refused until `arch-sync` regenerates | yes |
| tiger-lint | numeric-limit findings on each code edit | advisory |
| Override | audited, scoped exception | escape hatch |

Plan-conformance is undecidable, so gates fall on **decidable proxies** (file scope,
governs globs, REQ→STEP→TEST holes, stale ARCHITECTURE, numeric limits) — see
[`hooks/README.md`](hooks/README.md) for the honest gap statement.

> **Platform note.** A frontmatter `PreToolUse` hook on a *plugin* subagent is ignored
> by Claude Code, so the implement-phase gate runs on the **main thread** (the
> implementer works inline). See [`spike/SPIKE.md`](spike/SPIKE.md).

## The engine

`bin/engine.mjs` is a zero-dependency Node ≥18.3 ESM executable: the sole writer of
`docs/.state.json` (atomic temp+rename, `.bak` recovery, schema-validated) and the
gatekeeper with a frozen exit-code contract. Skills and hooks shell out to it; they
never touch state directly. Run `node bin/engine.mjs help` for the full surface.

## Development

```text
npm test                      # node test/run.mjs — zero deps, node:test
node bin/engine.mjs selfcheck # schemas + corpus + manifest + CHANGELOG integrity
```

CI runs the suite, `selfcheck`, a subcommand coverage map, and `claude plugin validate`
on Node 22 with **no `npm install`** (the zero-dependency promise). See
[`docs/spec/INFORMATION-MODEL.md`](docs/spec/INFORMATION-MODEL.md) for the canonical
schema and ID reference.

## License

MIT — see [LICENSE](LICENSE).
