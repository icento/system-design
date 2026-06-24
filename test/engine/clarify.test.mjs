// clarify.test.mjs — triage, classify, set-open-questions, validate-doc (M3).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engine, initRepo, touch, cleanup } from '../helpers.mjs';

function validSpec(reqOwner = '0001') {
  return [
    '---',
    'id: req-0001',
    'kind: spec',
    'title: Add a thing',
    'status: ready',
    'requirements:',
    `  - id: REQ-${reqOwner}-01`,
    '    statement: the system does x',
    '    kind: functional',
    '    priority: must',
    '    acceptance: x is observable',
    'nonGoals: []',
    '---',
    '# Spec body',
    '',
  ].join('\n');
}

test('triage sets tier + open questions and advances to TRIAGED', () => {
  const root = initRepo();
  try {
    engine(['register', '--title', 'Thing'], { root });
    const r = engine(['triage', '--id', 'req-0001', '--tier', 'STANDARD'], { root });
    assert.equal(r.code, 0);
    assert.equal(r.json.status, 'TRIAGED');
    assert.equal(engine(['set-open-questions', '--id', 'req-0001', '--n', '2'], { root }).json.openQuestions, 2);
  } finally {
    cleanup(root);
  }
});

test('classify recommends a tier; --apply only in INTAKE/TRIAGED', () => {
  const root = initRepo();
  try {
    engine(['register', '--title', 'Big', '--tier', 'STANDARD'], { root });
    assert.equal(engine(['classify', '--id', 'req-0001', '--touches-adr'], { root }).json.recommended, 'DEEP');
    const applied = engine(['classify', '--id', 'req-0001', '--adds-dep', '--apply'], { root });
    assert.equal(applied.json.applied, true);
    assert.equal(applied.json.recommended, 'DEEP');
    // Move out of INTAKE/TRIAGED, then --apply must be refused (EGATE 5).
    engine(['triage', '--id', 'req-0001', '--tier', 'DEEP'], { root });
    touch(root, 'requests/req-0001/SPEC.md', 'x');
    engine(['advance', '--id', 'req-0001', '--to', 'SPECCED'], { root });
    assert.equal(engine(['classify', '--id', 'req-0001', '--files', '2', '--apply'], { root }).code, 5);
  } finally {
    cleanup(root);
  }
});

test('validate-doc spec: valid passes, REQ-owner mismatch and bad enum fail (ESCHEMA 9)', () => {
  const root = initRepo();
  try {
    engine(['register', '--title', 'Thing'], { root });
    const good = touch(root, 'requests/req-0001/SPEC.md', validSpec('0001'));
    assert.equal(engine(['validate-doc', '--kind', 'spec', '--path', good], { root }).code, 0);

    const badOwner = touch(root, 'requests/req-0001/SPEC-bad.md', validSpec('0002'));
    assert.equal(engine(['validate-doc', '--kind', 'spec', '--path', badOwner], { root }).code, 9);

    const badEnum = touch(root, 'requests/req-0001/SPEC-enum.md', validSpec('0001').replace('priority: must', 'priority: critical'));
    assert.equal(engine(['validate-doc', '--kind', 'spec', '--path', badEnum], { root }).code, 9);
  } finally {
    cleanup(root);
  }
});

test('validate-doc plan-review verdict validates the shape', () => {
  const root = initRepo();
  try {
    const ok = touch(root, 'requests/req-0001/qa/plan-review.verdict.json', JSON.stringify({ verdict: 'PASS', blockerCount: 0 }));
    assert.equal(engine(['validate-doc', '--kind', 'plan-review', '--path', ok], { root }).code, 0);
    const bad = touch(root, 'requests/req-0001/qa/bad.json', JSON.stringify({ verdict: 'MAYBE', blockerCount: 0 }));
    assert.equal(engine(['validate-doc', '--kind', 'plan-review', '--path', bad], { root }).code, 9);
    const noCount = touch(root, 'requests/req-0001/qa/nocount.json', JSON.stringify({ verdict: 'PASS' }));
    assert.equal(engine(['validate-doc', '--kind', 'plan-review', '--path', noCount], { root }).code, 9);
  } finally {
    cleanup(root);
  }
});
