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

// Each gate's "resolution state" — the state entered when the gate passes.
export const GATE_RESOLUTION = Object.freeze({ G1: 'SPECCED', G2: 'DECIDED', G3: 'PLAN_OK' });

// Linear forward progress of the non-branching states. REVISING_*/BLOCKED are absent
// on purpose: they sit "before" their resolution target, so they never count as past a
// gate (a loop-back is still heading toward it).
const PROGRESS = ['INTAKE', 'TRIAGED', 'SPECCED', 'ADR_PROPOSED', 'DECIDED', 'PLANNED', 'PLAN_OK', 'IMPLEMENTING', 'VERIFYING', 'DONE'];

// Has gate `g` already been cleared from `status`? True only when the current state is
// strictly past the gate's resolution state in linear progress (so awaiting a gate you
// already passed — a stale/unreachable cursor — can be refused). Unknown/branching
// states answer false (the gate is still ahead or relevant).
export function gateAlreadyPassed(status, g) {
  const res = GATE_RESOLUTION[g];
  if (!res) return false;
  const si = PROGRESS.indexOf(status);
  const ri = PROGRESS.indexOf(res);
  return si !== -1 && si > ri;
}

// The recommended next /sd: command for a request's current state. The engine owns this
// mapping so the next step is deterministic and cannot drift from the GRAPH; /sd:status
// surfaces it rather than re-deriving the table in prose. Returns { command, note }
// with command === null at a terminal state.
export function nextCommand(req) {
  switch (req.status) {
    case 'INTAKE':
      return { command: '/sd:spec', note: 'triage done; write the SPEC' };
    case 'TRIAGED':
      return { command: '/sd:spec', note: 'write the SPEC (G1)' };
    case 'SPECCED':
      return req.tier === 'DEEP'
        ? { command: '/sd:design', note: 'derive architecture decisions' }
        : { command: '/sd:plan', note: 'plan (or /sd:design first if architecture is in play)' };
    case 'ADR_PROPOSED':
      return { command: '/sd:decide', note: 'decide the staged ADRs (G2)' };
    case 'DECIDED':
      return { command: '/sd:plan', note: 'write the PLAN' };
    case 'PLANNED':
      return { command: '/sd:review', note: 'adversarial plan review (G3)' };
    case 'PLAN_OK':
      return { command: '/sd:implement', note: 'implement the PLAN' };
    case 'IMPLEMENTING':
      return { command: '/sd:verify', note: 'QA/verify the implementation' };
    case 'VERIFYING':
      return { command: '/sd:verify', note: 'finish (DONE) or loop back' };
    case 'REVISING_ADR':
      return { command: '/sd:design', note: 'revise the architecture decisions' };
    case 'REVISING_SPEC':
      return { command: '/sd:spec', note: 'revise the SPEC' };
    case 'BLOCKED':
      return { command: '/sd:status', note: 'resolve blockedReason, then resume' };
    default:
      return { command: null, note: 'done' };
  }
}

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
