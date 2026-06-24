// transition.mjs — the pure composition of graph legality + preconditions into a
// single state move. Does NOT touch disk; the engine loads state, calls this, then
// persists. Kept separate so the full transition matrix is unit-testable in memory.
//
//   illegal edge (not in GRAPH)      -> EILLEGAL (6)
//   legal edge, precondition unmet   -> EGATE (5) with { missing[] }, unless --override
//   from === to                      -> no-op, { changed:false }, caller writes nothing
//   --override into DECIDED           -> refused (G2 is human-only) -> EGATE (5)

import { isLegalEdge, isState, illegalEdgeReason } from './gate.mjs';
import { evaluatePrecondition } from './preconditions.mjs';
import { errIllegal, errGate } from './output.mjs';

// Transitions on which --override is never honored (human-only gates).
const OVERRIDE_REFUSED = new Set(['DECIDED']);

export function applyTransition(request, to, opts = {}) {
  const { preconditions = {}, override = null, by = 'engine', gate = null, note = null, clock } = opts;
  const from = request.status;

  if (!isState(to)) throw errIllegal(`unknown target state "${to}"`, { from, to });
  if (from === to) return { changed: false, request, from, to };
  if (!isLegalEdge(from, to)) throw errIllegal(illegalEdgeReason(from, to), { from, to });

  const pc = evaluatePrecondition(preconditions, to, request);
  let appliedOverride = null;
  if (!pc.ok) {
    if (!override) {
      throw errGate(`precondition for ${to} unmet`, { from, to, missing: pc.missing });
    }
    if (OVERRIDE_REFUSED.has(to)) {
      throw errGate(`--override is refused for ${to} (this is a human-only gate)`, { from, to, missing: pc.missing });
    }
    appliedOverride = override;
  }

  const at = clock ? clock() : new Date().toISOString();
  request.status = to;
  request.updatedAt = at;
  if (to === 'BLOCKED') request.blockedReason = note ?? request.blockedReason ?? null;
  else if (from === 'BLOCKED') request.blockedReason = null;

  request.history.push({
    from,
    to,
    at,
    by,
    gate: gate ?? null,
    override: appliedOverride,
    note: note ?? null,
  });

  return { changed: true, request, from, to, overridden: appliedOverride !== null };
}

// Dry-run: returns { ok, code, missing[] } without mutating. code mirrors what
// applyTransition would throw (0 ok / 5 gate / 6 illegal).
export function evaluateTransition(request, to, opts = {}) {
  const { preconditions = {}, override = null } = opts;
  const from = request.status;
  if (!isState(to)) return { ok: false, code: 6, from, to, reason: `unknown target state "${to}"`, missing: [] };
  if (from === to) return { ok: true, code: 0, from, to, missing: [], noop: true };
  if (!isLegalEdge(from, to)) return { ok: false, code: 6, from, to, reason: illegalEdgeReason(from, to), missing: [] };
  const pc = evaluatePrecondition(preconditions, to, request);
  if (!pc.ok) {
    if (override && !OVERRIDE_REFUSED.has(to)) return { ok: true, code: 0, from, to, missing: [], overridable: true };
    return { ok: false, code: 5, from, to, reason: `precondition for ${to} unmet`, missing: pc.missing };
  }
  return { ok: true, code: 0, from, to, missing: [] };
}
