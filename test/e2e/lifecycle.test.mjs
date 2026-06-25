// lifecycle.test.mjs — end-to-end: drive a DEEP request INTAKE -> DONE through every
// engine phase (as the skills would), and prove DONE is blocked when a declared test
// reference no longer resolves.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { engine, initRepo, touch, cleanup } from '../helpers.mjs';

const SPEC = ['---', 'id: req-0001', 'kind: spec', 'title: Feature', 'status: ready', 'requirements:', '  - id: REQ-0001-01', '    statement: do the thing', '    kind: functional', '    priority: must', 'nonGoals: []', '---', 'spec', ''].join('\n');
const ADR = ['---', 'id: adr-0001', 'kind: adr', 'title: Pattern', 'status: proposed', 'date: 2026-01-01', 'request: req-0001', 'governs:', '  - src/feat/**', 'principles:', '  - tiger-bound-everything', 'decisionQuestion: How?', 'choice: Bounded.', 'constraints:', '  forbids: []', '  requires: []', 'supersedes: null', '---', '## Decision', '', 'Use a bounded approach.', '', '## Consequences', '', 'Predictable.', ''].join('\n');
const PLAN = ['---', 'id: req-0001', 'kind: plan', 'status: draft', 'steps:', '  - id: STEP-001', '    intent: build it', '    satisfies:', '      - REQ-0001-01', '    files:', '      - src/feat/x.js', '    tests:', '      - test/feat.test.mjs::works', '    adrs:', '      - adr-0001', '    status: todo', '---', 'plan', ''].join('\n');
const DQS = { request_id: 'req-0001', generated_at: '2026-01-01T00:00:00.000Z', questions: [{ id: 'Q1', staged_adr_id: 'adr-0001', entity: 'feat', question: 'How?', options: [{ label: 'A', summary: 'a' }, { label: 'B', summary: 'b' }], recommended_option_index: 0, principle_ids: ['tiger-bound-everything'] }] };

function E(root, ...args) {
  const r = engine(args, { root });
  assert.equal(r.code, 0, `${args.join(' ')} -> ${r.code} ${JSON.stringify(r.json)}`);
  return r;
}

function driveToVerifying(root) {
  E(root, 'register', '--title', 'Feature', '--slug', 'feat', '--tier', 'DEEP');
  E(root, 'triage', '--id', 'req-0001', '--tier', 'DEEP');
  touch(root, 'requests/req-0001/SPEC.md', SPEC);
  E(root, 'validate-doc', '--kind', 'spec', '--path', resolve(root, 'requests/req-0001/SPEC.md'));
  E(root, 'advance', '--id', 'req-0001', '--to', 'SPECCED');
  // design: stage + decide
  touch(root, 'docs/adrs/adr-0001.md', ADR);
  touch(root, 'requests/req-0001/decisions.json', JSON.stringify(DQS));
  E(root, 'decisions', 'write', '--req', 'req-0001', '--from', resolve(root, 'requests/req-0001/decisions.json'));
  E(root, 'adr', 'stage', '--request', 'req-0001');
  E(root, 'accept-adr', '--req', 'req-0001', '--adr', 'adr-0001');
  E(root, 'advance', '--id', 'req-0001', '--to', 'DECIDED');
  // plan + review
  touch(root, 'requests/req-0001/PLAN.md', PLAN);
  E(root, 'plan-check', '--id', 'req-0001');
  E(root, 'advance', '--id', 'req-0001', '--to', 'PLANNED');
  touch(root, 'requests/req-0001/qa/plan-review.verdict.json', JSON.stringify({ verdict: 'PASS', blockerCount: 0 }));
  E(root, 'advance', '--id', 'req-0001', '--to', 'PLAN_OK');
  // implement
  E(root, 'advance', '--id', 'req-0001', '--to', 'IMPLEMENTING');
  touch(root, 'src/feat/x.js', 'export const x = 1;');
  touch(root, 'test/feat.test.mjs', 'test("works", () => {});');
  E(root, 'step-done', '--id', 'req-0001', '--step', '1');
  E(root, 'advance', '--id', 'req-0001', '--to', 'VERIFYING');
  // /sd:verify persists the qa-verifier's verdict; the engine's DONE gate consumes it.
  touch(root, 'requests/req-0001/qa/qa.verdict.json', JSON.stringify({ overall: 'PASS', results: [], failures: [] }));
}

test('INTAKE -> DONE for a DEEP request (with ADR, plan review, arch-sync)', () => {
  const root = initRepo();
  try {
    driveToVerifying(root);
    // arch is stale (an ADR was accepted) -> verify fails until arch-sync
    assert.equal(engine(['verify', '--id', 'req-0001'], { root }).code, 5);
    assert.equal(engine(['advance', '--id', 'req-0001', '--to', 'DONE'], { root }).code, 5);
    E(root, 'arch-sync');
    E(root, 'verify', '--id', 'req-0001');
    E(root, 'advance', '--id', 'req-0001', '--to', 'DONE');
    assert.equal(engine(['context', '--id', 'req-0001'], { root }).json.status, 'DONE');
  } finally {
    cleanup(root);
  }
});

test('DONE is blocked when a declared test reference is removed', () => {
  const root = initRepo();
  try {
    driveToVerifying(root);
    E(root, 'arch-sync');
    cleanup(`${root}/test/feat.test.mjs`); // remove the test the PLAN references
    assert.equal(engine(['verify', '--id', 'req-0001'], { root }).code, 5);
    assert.equal(engine(['advance', '--id', 'req-0001', '--to', 'DONE'], { root }).code, 5);
  } finally {
    cleanup(root);
  }
});
