// gates.test.mjs — the lifecycle gatekeeper. Graph legality is tested in isolation
// (empty preconditions) so every edge is exercised; each precondition predicate is
// tested separately; then the real engine binary is checked for the EGATE/EILLEGAL/
// noop contract.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTransition, evaluateTransition } from '../../bin/lib/transition.mjs';
import { GRAPH, STATES } from '../../bin/lib/gate.mjs';
import { makePreconditions, evaluatePrecondition } from '../../bin/lib/preconditions.mjs';
import { engine, initRepo, cleanup } from '../helpers.mjs';

function baseReq(status = 'INTAKE') {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'req-0001',
    slug: 's',
    title: 't',
    tier: 'STANDARD',
    status,
    openQuestions: 0,
    blockedReason: null,
    awaiting: null,
    createdAt: now,
    updatedAt: now,
    adrs: [],
    overrides: [],
    config: { enforcement: 'warn', tigerLintBlocking: false },
    runtime: { firstDenialSeen: false },
    history: [{ from: null, to: 'INTAKE', at: now, by: 'engine', gate: null, override: null, note: null }],
  };
}

test('transition matrix: every (from,to) obeys the GRAPH (preconditions isolated)', () => {
  const clock = () => '2026-01-02T00:00:00.000Z';
  for (const from of STATES) {
    for (const to of STATES) {
      const req = baseReq(from);
      if (from === to) {
        const r = applyTransition(req, to, { preconditions: {}, clock });
        assert.equal(r.changed, false, `${from}->${to} should be a no-op`);
        assert.equal(req.history.length, 1, 'no-op writes no history');
        continue;
      }
      if (GRAPH[from].includes(to)) {
        const r = applyTransition(req, to, { preconditions: {}, clock });
        assert.equal(r.changed, true, `${from}->${to} legal`);
        assert.equal(req.status, to);
        assert.equal(req.history.at(-1).to, to);
      } else {
        assert.throws(
          () => applyTransition(req, to, { preconditions: {}, clock }),
          (e) => e.code === 6,
          `${from}->${to} should be EILLEGAL`,
        );
      }
    }
  }
});

test('precondition: TRIAGED requires a tier', () => {
  const pc = makePreconditions({});
  const noTier = { ...baseReq('INTAKE'), tier: null };
  assert.equal(evaluatePrecondition(pc, 'TRIAGED', noTier).ok, false);
  assert.equal(evaluatePrecondition(pc, 'TRIAGED', baseReq('INTAKE')).ok, true);
});

test('precondition: SPECCED is G1 (SPEC exists AND openQuestions==0)', () => {
  const withSpec = makePreconditions({ specExists: () => true });
  const noSpec = makePreconditions({ specExists: () => false });
  assert.equal(evaluatePrecondition(noSpec, 'SPECCED', baseReq('TRIAGED')).ok, false);
  assert.equal(evaluatePrecondition(withSpec, 'SPECCED', baseReq('TRIAGED')).ok, true);
  const openQ = { ...baseReq('TRIAGED'), openQuestions: 2 };
  const r = evaluatePrecondition(withSpec, 'SPECCED', openQ);
  assert.equal(r.ok, false);
  assert.match(r.missing.join(' '), /open question/);
});

test('precondition: ADR_PROPOSED needs a proposed ADR; DECIDED needs none proposed', () => {
  const pc = makePreconditions({});
  const proposed = { ...baseReq('SPECCED'), adrs: [{ id: 'adr-0001', status: 'proposed' }] };
  const accepted = { ...baseReq('ADR_PROPOSED'), adrs: [{ id: 'adr-0001', status: 'accepted' }] };
  assert.equal(evaluatePrecondition(pc, 'ADR_PROPOSED', proposed).ok, true);
  assert.equal(evaluatePrecondition(pc, 'ADR_PROPOSED', baseReq('SPECCED')).ok, false);
  assert.equal(evaluatePrecondition(pc, 'DECIDED', proposed).ok, false);
  assert.equal(evaluatePrecondition(pc, 'DECIDED', accepted).ok, true);
});

test('precondition: PLANNED DEEP bypass-guard blocks unaccepted ADRs', () => {
  const pc = makePreconditions({ planExists: () => true });
  const deepProposed = { ...baseReq('SPECCED'), tier: 'DEEP', adrs: [{ id: 'adr-0001', status: 'proposed' }] };
  const stdNoAdr = { ...baseReq('SPECCED'), tier: 'STANDARD' };
  assert.equal(evaluatePrecondition(pc, 'PLANNED', deepProposed).ok, false);
  assert.equal(evaluatePrecondition(pc, 'PLANNED', stdNoAdr).ok, true);
});

test('precondition: PLAN_OK is verdict==PASS AND blockerCount==0', () => {
  const mk = (v) => makePreconditions({ planReviewVerdict: () => v });
  assert.equal(evaluatePrecondition(mk(null), 'PLAN_OK', baseReq('PLANNED')).ok, false);
  assert.equal(evaluatePrecondition(mk({ verdict: 'REVISE', blockerCount: 0 }), 'PLAN_OK', baseReq('PLANNED')).ok, false);
  assert.equal(evaluatePrecondition(mk({ verdict: 'PASS', blockerCount: 2 }), 'PLAN_OK', baseReq('PLANNED')).ok, false);
  assert.equal(evaluatePrecondition(mk({ verdict: 'PASS', blockerCount: 0 }), 'PLAN_OK', baseReq('PLANNED')).ok, true);
});

test('precondition: DONE injects traceability + archStale (default deferred passes)', () => {
  const deferred = makePreconditions({});
  assert.equal(evaluatePrecondition(deferred, 'DONE', baseReq('VERIFYING')).ok, true, 'M1 default passes');
  const holes = makePreconditions({ traceabilityComplete: () => ({ ok: false, holes: ['REQ-0001-01 has no step'] }) });
  assert.equal(evaluatePrecondition(holes, 'DONE', baseReq('VERIFYING')).ok, false);
  const stale = makePreconditions({ archStale: () => true });
  assert.equal(evaluatePrecondition(stale, 'DONE', baseReq('VERIFYING')).ok, false);
});

test('--override is refused into DECIDED (G2 human-only)', () => {
  const proposed = { ...baseReq('ADR_PROPOSED'), adrs: [{ id: 'adr-0001', status: 'proposed' }] };
  assert.throws(
    () => applyTransition(proposed, 'DECIDED', { preconditions: makePreconditions({}), override: 'force it' }),
    (e) => e.code === 5 && /human-only/.test(e.message),
  );
});

test('evaluateTransition dry-run mirrors codes without mutating', () => {
  const req = baseReq('INTAKE');
  const ev = evaluateTransition(req, 'DONE', { preconditions: {} });
  assert.equal(ev.code, 6);
  assert.equal(req.status, 'INTAKE', 'dry-run did not mutate');
});

// ---- engine integration ---------------------------------------------------

test('engine advance: EGATE(5), EILLEGAL(6), and idempotent no-op(0)', () => {
  const root = initRepo();
  try {
    assert.equal(engine(['register', '--title', 'Thing'], { root }).code, 0);
    // INTAKE->TRIAGED without a tier => EGATE
    const g = engine(['advance', '--id', 'req-0001', '--to', 'TRIAGED'], { root });
    assert.equal(g.code, 5);
    assert.deepEqual(g.json.missing, ['tier not set']);
    // INTAKE->DONE => EILLEGAL
    assert.equal(engine(['advance', '--id', 'req-0001', '--to', 'DONE'], { root }).code, 6);
    // set tier, then INTAKE->TRIAGED succeeds; repeating is a no-op
    // (tier is set via register here for simplicity)
    engine(['register', '--title', 'Tiered', '--slug', 'tiered', '--tier', 'STANDARD'], { root });
    const adv = engine(['advance', '--id', 'req-0002', '--to', 'TRIAGED'], { root });
    assert.equal(adv.code, 0);
    assert.equal(adv.json.to, 'TRIAGED');
    const noop = engine(['advance', '--id', 'req-0002', '--to', 'TRIAGED'], { root });
    assert.equal(noop.code, 0);
    assert.equal(noop.json.changed, false);
  } finally {
    cleanup(root);
  }
});

test('engine advance unknown request => ENOREQUEST(4)', () => {
  const root = initRepo();
  try {
    const r = engine(['advance', '--id', 'req-9999', '--to', 'TRIAGED'], { root });
    assert.equal(r.code, 4);
  } finally {
    cleanup(root);
  }
});

test('TRIVIAL fast-path reaches DONE with no SPEC/PLAN/review artifacts', () => {
  const root = initRepo();
  try {
    engine(['register', '--title', 'Fix a typo', '--slug', 'typo', '--tier', 'TRIVIAL'], { root });
    for (const to of ['TRIAGED', 'SPECCED', 'PLANNED', 'PLAN_OK', 'IMPLEMENTING', 'VERIFYING', 'DONE']) {
      const r = engine(['advance', '--id', 'req-0001', '--to', to], { root });
      assert.equal(r.code, 0, `TRIVIAL advance to ${to}`);
    }
    assert.equal(engine(['context', '--id', 'req-0001'], { root }).json.status, 'DONE');
  } finally {
    cleanup(root);
  }
});

test('engine unknown subcommand/flag => EUSAGE(2)', () => {
  const root = initRepo();
  try {
    assert.equal(engine(['frobnicate'], { root }).code, 2);
    assert.equal(engine(['status', '--nope'], { root }).code, 2);
  } finally {
    cleanup(root);
  }
});
