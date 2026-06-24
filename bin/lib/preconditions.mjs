// preconditions.mjs — one predicate per transition *target*. A predicate answers
// "may this legal edge be taken right now?" and returns { ok, missing[] } where
// missing[] is the human list of unmet conditions (surfaced as EGATE extra).
//
// Forward-dependency break (the M1 fix): the predicates that need machinery built
// later — traceabilityComplete (M5) and archStale (M6) — are INJECTED. Until then
// they default to pass-with-note, so M1 can ship and test the available targets,
// and M5/M6 wire in the real implementations without editing this file's logic.
//
// This is the single authoritative source of precondition rules — they are not
// duplicated in prose anywhere that can drift.

const present = (v) => v !== null && v !== undefined;

export function makePreconditions(deps = {}) {
  const {
    // fs-backed (wired by the engine; faked in unit tests)
    specExists = () => false,
    planExists = () => false,
    planReviewVerdict = () => null, // -> { verdict:'PASS'|'REVISE', blockerCount:int } | null
    // injected later (default pass-with-note until M5/M6)
    traceabilityComplete = () => ({ ok: true, note: 'deferred' }),
    archStale = () => false,
  } = deps;

  const anyProposedAdr = (req) => (req.adrs ?? []).some((a) => a.status === 'proposed');

  // target -> (req) => { ok, missing[] }
  return {
    TRIAGED(req) {
      const missing = [];
      if (!present(req.tier)) missing.push('tier not set');
      return { ok: missing.length === 0, missing };
    },

    // G1: a SPEC exists and all open questions are resolved. TRIVIAL changes skip
    // the artifact machinery entirely (CHANGELOG-line-only fast path).
    SPECCED(req) {
      if (req.tier === 'TRIVIAL') return { ok: true, missing: [] };
      const missing = [];
      if (!specExists(req)) missing.push('SPEC.md does not exist');
      if ((req.openQuestions ?? 0) !== 0) missing.push(`${req.openQuestions} open question(s) unresolved (G1)`);
      return { ok: missing.length === 0, missing };
    },

    ADR_PROPOSED(req) {
      const missing = [];
      if (!(req.adrs ?? []).some((a) => a.status === 'proposed')) {
        missing.push('no ADR in "proposed" state');
      }
      return { ok: missing.length === 0, missing };
    },

    // G2: every staged ADR has been decided (none still proposed). Human-only;
    // the engine separately refuses --override on this edge.
    DECIDED(req) {
      const missing = [];
      if (anyProposedAdr(req)) missing.push('one or more ADRs still "proposed" (G2 requires a human decision on each)');
      return { ok: missing.length === 0, missing };
    },

    // The SPECCED->PLANNED DEEP bypass-guard lives HERE only: a DEEP request may
    // not plan while it still has unaccepted (proposed) ADRs.
    PLANNED(req) {
      if (req.tier === 'TRIVIAL') return { ok: true, missing: [] };
      const missing = [];
      if (!planExists(req)) missing.push('PLAN.md does not exist');
      if (req.tier === 'DEEP' && anyProposedAdr(req)) {
        missing.push('DEEP request has unaccepted ADRs; decide them before planning');
      }
      return { ok: missing.length === 0, missing };
    },

    // G3: the plan-review verdict is PASS with zero blockers. Reading/validating
    // the verdict JSON is the engine's job (validate-doc); here we consume it.
    PLAN_OK(req) {
      if (req.tier === 'TRIVIAL') return { ok: true, missing: [] };
      const missing = [];
      const v = planReviewVerdict(req);
      if (!v) missing.push('qa/plan-review.verdict.json verdict missing or invalid');
      else {
        if (v.verdict !== 'PASS') missing.push(`plan-review verdict is ${v.verdict}, not PASS`);
        if ((v.blockerCount ?? 0) !== 0) missing.push(`plan-review has ${v.blockerCount} blocker(s) (must be 0)`);
      }
      return { ok: missing.length === 0, missing };
    },

    VERIFYING(req) {
      if (req.tier === 'TRIVIAL') return { ok: true, missing: [] };
      const missing = [];
      if (!planExists(req)) missing.push('PLAN.md does not exist');
      return { ok: missing.length === 0, missing };
    },

    // Both predicates injected; defaults pass-with-note until M5 (traceability) and
    // M6 (arch staleness) wire in.
    DONE(req) {
      const missing = [];
      const trace = traceabilityComplete(req);
      if (!trace.ok) missing.push(`traceability incomplete: ${(trace.holes ?? []).join('; ') || 'holes present'}`);
      if (archStale()) missing.push('ARCHITECTURE.md is stale; run `engine arch-sync` (no flags — --check only reports) to regenerate it');
      return { ok: missing.length === 0, missing };
    },
  };
}

// Targets with no precondition (always permitted if the edge is legal).
export const UNCONDITIONAL_TARGETS = new Set([
  'INTAKE',
  'IMPLEMENTING',
  'REVISING_ADR',
  'REVISING_SPEC',
  'BLOCKED',
]);

// Evaluate the precondition for `target`. Unknown/unconditional targets pass.
export function evaluatePrecondition(preconditions, target, req) {
  if (UNCONDITIONAL_TARGETS.has(target)) return { ok: true, missing: [] };
  const pred = preconditions[target];
  if (!pred) return { ok: true, missing: [] };
  return pred(req);
}
