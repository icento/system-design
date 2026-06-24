# Information model (canonical reference)

The authoritative schemas live in [`schemas/`](../../schemas/); this is the prose map.

## Storage layout (a user repo, after `engine init`)

```
docs/
├── .state.json            engine-owned workflow state (the ONLY mutable source of truth)
├── .state.bak             recovery snapshot
├── .governs-index.json    accepted-ADR reverse index (derived; gate reads this)
├── .arch-hash             ARCHITECTURE source hash
├── .architecture-stale    sentinel: present ⇒ DONE blocked until arch-sync
├── adrs/<adr-id>.md       canonical ADRs (append-only; status flips via the engine)
├── principles/            the rubric corpus (copied from the plugin at init)
├── PRINCIPLES.md          GENERATED index (do not edit)
└── ARCHITECTURE.md        GENERATED from accepted ADRs (do not edit)
requests/<req-id>/
├── intake.md   SPEC.md   PLAN.md   plan-review.md   decisions.json
└── qa/         overrides.log   plan-review.verdict.json   qa.verdict.json   tiger-lint.json
```

## ID grammar (frozen)

| Entity | Grammar | Scope |
|---|---|---|
| Request | `req-NNNN` | repo-global, gap-aware (max+1) |
| ADR | `adr-NNNN` | repo-global, gap-aware |
| Requirement | `REQ-NNNN-NN` | `NNNN` = owning request |
| Plan step | `STEP-NNN` | per request |
| Principle | `(aposd\|tiger\|house)-<slug>` | corpus |
| Test reference | `<relative-path>::<test name>` | — |
| Override | `ovr-N` | per request |

## Lifecycle states

`INTAKE · TRIAGED · SPECCED · ADR_PROPOSED · DECIDED · PLANNED · PLAN_OK ·
IMPLEMENTING · VERIFYING · DONE · REVISING_ADR · REVISING_SPEC · BLOCKED`.

The transition graph and per-target preconditions are defined once, in
`bin/lib/gate.mjs` and `bin/lib/preconditions.mjs`. `DONE` requires complete
REQ→STEP→TEST traceability **and** a fresh `ARCHITECTURE.md`.

## Engine exit-code contract (public API)

| 0 OK | 2 EUSAGE | 3 ENOTREPO | 4 ENOREQUEST | 5 EGATE | 6 EILLEGAL | 7 ESTATE | 8 EWRITE | 9 ESCHEMA | 70 EINTERNAL |
|---|---|---|---|---|---|---|---|---|---|

`5 EGATE` is the branchable "precondition unmet" code (also traceability holes and
stale architecture). `hook-*` subcommands always exit 0 and carry their decision in the
JSON payload.

## Artifacts (frontmatter, draft-2020-12 subset, `additionalProperties:false`)

- **SPEC** (`spec.frontmatter.schema.json`) — `id`(=request), `kind:spec`, `title`,
  `status`, `requirements[]{id, statement, kind, priority, acceptance?}`, `nonGoals[]`.
  Requirement ids must be owned by the request (`validate-doc` enforces it).
- **ADR** (`adr.frontmatter.schema.json`) — `id`, `kind:adr`, `title`, `status`,
  `date`, `governs[glob]`, `principles[id]`, `decisionQuestion`, `choice`,
  `constraints{forbids[],requires[]}`, `request?`, `supersedes?`. `proposed→accepted`
  only via `engine accept-adr` / `engine decide`.
- **PLAN** (`plan.frontmatter.schema.json`) — `id`, `kind:plan`, `status`,
  `reviewedBy?{gate,verdict,blockerCount,at,subagent}`, `steps[]{id, intent, satisfies[REQ],
  files[], tests[ref], adrs[]?, status}`. **PLAN scope = union of `steps[].files`.**
- **PRINCIPLE** (`principle.frontmatter.schema.json`) — `id`, `source`, `title`,
  `domain[]`, `severity`, `statement`, `triggers[]`, `recommended_default`,
  `decision_question_template`, `anti_patterns[]?`, `limits{}?`, `lint_rule?`.
- **DecisionQuestionSet** (`decision-question-set.schema.json`) — the architect→decide
  handoff: `{request_id, generated_at, questions[≤7]{id, staged_adr_id, entity, question,
  options[2-4], recommended_option_index, principle_ids[]}}`.
- **Generated** — `PRINCIPLES.md` (`principles-index`) and `ARCHITECTURE.md`
  (`architecture`) carry `generated:true, doNotEdit:true`; never hand-edit them.

## Verdict JSON (machine-checked by the engine)

- `plan-review.verdict.json`: `{verdict: PASS|REVISE, blockerCount: int, ...}`. `PLAN_OK`
  requires `verdict==PASS` **and** `blockerCount==0`.
- `qa.verdict.json`: `{overall: PASS|FAIL, results[], failures[{root_cause}]}`. The
  loop-back router prioritizes `missing_requirement > bad_adr > code_local`.
