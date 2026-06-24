# Polish checklist (human review)

`engine selfcheck` is the single *machine-checkable* polish gate. The items below are
the *human* review checklist — things a machine cannot confidently judge.

## MVP (engine + spine)
- [x] Engine: precise subcommands/flags, frozen exit-code contract, idempotent, `--json` co-emits `{ok,code}`.
- [x] `docs/.state.json` atomic (temp+rename, same dir), schema-validated on every save, `.bak` recovery, never persists invalid state.
- [x] All 18 principle records valid; `principles index` byte-idempotent; `principles retrieve` deterministic + unit-tested.
- [x] `principle-architect` writes only `docs/adrs/`; `engine decisions write` persists the handoff; G2 crash-safe; SessionStart rehydrates.
- [x] The main-thread edit gate denies with a reason; hooks degrade (exit 0 / fail-open) outside a workflow repo.
- [x] `npm test` green on Node 22, zero deps.

## Full
- [x] All `/sd:` commands + skills + 4 subagents shipped; layered net proven by the implement-gate canary in CI.
- [x] Traceability gate, arch-staleness, tiger-lint numeric limits all gating DONE; engine-enforced PLAN_OK blocker gate.
- [x] Override escape hatch audited; warn→deny toggle.
- [x] `hooks/README.md` advisory-vs-blocking table + honest undecidability statement; `INFORMATION-MODEL.md`; README quickstart→DONE; CHANGELOG.
- [x] `engine selfcheck` passes; `claude plugin validate` runs in CI (non-fatal, backstopped by selfcheck).

## Human-judgment items (re-check before each release)
- [ ] Every skill's protocol still matches the engine's actual subcommand surface.
- [ ] Each subagent prompt returns *only* its JSON contract (no prose leakage).
- [ ] The M0 spike (`spike/SPIKE.md`) re-run on the current Claude Code version; enforcement channel confirmed.
- [ ] Principle records read as genuinely useful guidance, not filler.
- [ ] Error messages are actionable (they name the file/gate and the fix).
