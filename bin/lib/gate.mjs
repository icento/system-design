// gate.mjs — the lifecycle state graph and edge legality. This module knows ONLY
// the shape of the graph (which transitions exist); whether a *legal* edge may be
// taken right now (preconditions) lives in preconditions.mjs. The engine composes
// the two: illegal edge -> EILLEGAL(6); legal-but-unmet -> EGATE(5).

export const TERMINAL = 'DONE';

// Every non-terminal state; BLOCKED can return to any of these (minus itself).
const NON_TERMINAL = [
  'INTAKE',
  'TRIAGED',
  'SPECCED',
  'ADR_PROPOSED',
  'DECIDED',
  'PLANNED',
  'PLAN_OK',
  'IMPLEMENTING',
  'VERIFYING',
  'REVISING_ADR',
  'REVISING_SPEC',
];

export const GRAPH = Object.freeze({
  INTAKE: ['TRIAGED', 'BLOCKED'],
  TRIAGED: ['SPECCED', 'BLOCKED'],
  SPECCED: ['ADR_PROPOSED', 'PLANNED', 'BLOCKED'],
  ADR_PROPOSED: ['DECIDED', 'REVISING_ADR', 'BLOCKED'],
  DECIDED: ['PLANNED', 'BLOCKED'],
  PLANNED: ['PLAN_OK', 'REVISING_SPEC', 'REVISING_ADR', 'BLOCKED'],
  PLAN_OK: ['IMPLEMENTING', 'BLOCKED'],
  IMPLEMENTING: ['VERIFYING', 'BLOCKED'],
  VERIFYING: ['DONE', 'IMPLEMENTING', 'REVISING_ADR', 'REVISING_SPEC', 'BLOCKED'],
  REVISING_ADR: ['ADR_PROPOSED', 'BLOCKED'],
  REVISING_SPEC: ['SPECCED', 'BLOCKED'],
  DONE: [],
  // BLOCKED can resume into any non-terminal state (except itself).
  BLOCKED: NON_TERMINAL.slice(),
});

export const STATES = Object.freeze(Object.keys(GRAPH));
export const STATE_SET = new Set(STATES);

export const isState = (s) => STATE_SET.has(s);
export const isTerminal = (s) => s === TERMINAL;
export const targetsOf = (from) => GRAPH[from] ?? [];

// Is there an edge from -> to in the graph? (self-edge from===to is treated as a
// legal no-op by the engine and short-circuits before this is consulted.)
export function isLegalEdge(from, to) {
  return (GRAPH[from] ?? []).includes(to);
}

// Human reason for an illegal edge, including the legal alternatives.
export function illegalEdgeReason(from, to) {
  if (!isState(from)) return `unknown current state "${from}"`;
  if (!isState(to)) return `unknown target state "${to}"`;
  const allowed = targetsOf(from);
  const list = allowed.length ? allowed.join(', ') : '(none — terminal)';
  return `illegal transition ${from} -> ${to}; legal targets from ${from}: ${list}`;
}
