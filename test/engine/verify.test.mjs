// verify.test.mjs — traceability + the DONE gate (M5): verify, trace, step-done,
// gate-done, and the requirement that DONE is refused on any hole.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engine, initRepo, touch, cleanup } from '../helpers.mjs';

const SPEC = [
  '---', 'id: req-0001', 'kind: spec', 'title: Two', 'status: ready', 'requirements:',
  '  - id: REQ-0001-01', '    statement: alpha', '    kind: functional', '    priority: must',
  '  - id: REQ-0001-02', '    statement: beta', '    kind: functional', '    priority: must',
  'nonGoals: []', '---', 's', '',
].join('\n');

const PLAN = [
  '---', 'id: req-0001', 'kind: plan', 'status: draft', 'steps:',
  '  - id: STEP-001', '    intent: alpha', '    satisfies:', '      - REQ-0001-01', '    files:', '      - src/a.js', '    tests:', '      - test/a.test.mjs::alpha', '    status: todo',
  '  - id: STEP-002', '    intent: beta', '    satisfies:', '      - REQ-0001-02', '    files:', '      - src/b.js', '    tests:', '      - test/b.test.mjs::beta', '    status: todo',
  '---', 'p', '',
].join('\n');

// STANDARD request driven to IMPLEMENTING, with the declared test files present.
function toImplementing() {
  const root = initRepo();
  engine(['register', '--title', 'Two', '--slug', 'two', '--tier', 'STANDARD'], { root });
  engine(['triage', '--id', 'req-0001', '--tier', 'STANDARD'], { root });
  touch(root, 'requests/req-0001/SPEC.md', SPEC);
  engine(['advance', '--id', 'req-0001', '--to', 'SPECCED'], { root });
  touch(root, 'requests/req-0001/PLAN.md', PLAN);
  engine(['advance', '--id', 'req-0001', '--to', 'PLANNED'], { root });
  touch(root, 'requests/req-0001/qa/plan-review.verdict.json', JSON.stringify({ verdict: 'PASS', blockerCount: 0 }));
  engine(['advance', '--id', 'req-0001', '--to', 'PLAN_OK'], { root });
  engine(['advance', '--id', 'req-0001', '--to', 'IMPLEMENTING'], { root });
  touch(root, 'test/a.test.mjs', '// test\nimport x; test("alpha", ()=>{});');
  touch(root, 'test/b.test.mjs', '// test\nimport y; test("beta", ()=>{});');
  return root;
}

test('verify fails while steps are not done, passes once done; DONE follows', () => {
  const root = toImplementing();
  try {
    // steps still todo -> verify reports holes (EGATE 5)
    let v = engine(['verify', '--id', 'req-0001'], { root });
    assert.equal(v.code, 5);
    assert.ok(v.json.traceability.holes.some((h) => /not done/.test(h)));

    engine(['step-done', '--id', 'req-0001', '--step', '1'], { root });
    engine(['step-done', '--id', 'req-0001', '--step', '2'], { root });

    v = engine(['verify', '--id', 'req-0001'], { root });
    assert.equal(v.code, 0, JSON.stringify(v.json));

    engine(['advance', '--id', 'req-0001', '--to', 'VERIFYING'], { root });
    touch(root, 'requests/req-0001/qa/qa.verdict.json', JSON.stringify({ overall: 'PASS' }));
    assert.equal(engine(['advance', '--id', 'req-0001', '--to', 'DONE'], { root }).code, 0);
  } finally {
    cleanup(root);
  }
});

test('DONE is refused when a declared test file is missing', () => {
  const root = toImplementing();
  try {
    engine(['step-done', '--id', 'req-0001', '--step', '1'], { root });
    engine(['step-done', '--id', 'req-0001', '--step', '2'], { root });
    // remove a test so its ref no longer resolves
    cleanup(`${root}/test/b.test.mjs`);
    const v = engine(['verify', '--id', 'req-0001'], { root });
    assert.equal(v.code, 5);
    assert.ok(v.json.traceability.holes.some((h) => /missing test/.test(h)));
    engine(['advance', '--id', 'req-0001', '--to', 'VERIFYING'], { root });
    assert.equal(engine(['advance', '--id', 'req-0001', '--to', 'DONE'], { root }).code, 5, 'DONE gate refuses');
  } finally {
    cleanup(root);
  }
});

test('DONE is refused on a FAILED QA verdict and allowed once it PASSES', () => {
  const root = toImplementing();
  try {
    engine(['step-done', '--id', 'req-0001', '--step', '1'], { root });
    engine(['step-done', '--id', 'req-0001', '--step', '2'], { root });
    engine(['advance', '--id', 'req-0001', '--to', 'VERIFYING'], { root });
    // A FAIL verdict must block DONE even though traceability is clean.
    touch(root, 'requests/req-0001/qa/qa.verdict.json', JSON.stringify({ overall: 'FAIL' }));
    const blocked = engine(['advance', '--id', 'req-0001', '--to', 'DONE'], { root });
    assert.equal(blocked.code, 5);
    assert.ok(blocked.json.missing.some((m) => /QA verdict is FAIL/.test(m)));
    // Flipping the verdict to PASS lets it through (the engine, not the skill, enforces this).
    touch(root, 'requests/req-0001/qa/qa.verdict.json', JSON.stringify({ overall: 'PASS' }));
    assert.equal(engine(['advance', '--id', 'req-0001', '--to', 'DONE'], { root }).code, 0);
  } finally {
    cleanup(root);
  }
});

test('trace renders the matrix and gate-done reflects readiness', () => {
  const root = toImplementing();
  try {
    const t = engine(['trace', '--id', 'req-0001'], { root });
    assert.equal(t.code, 0);
    assert.equal(t.json.rows.length, 2);
    assert.equal(engine(['gate-done', '--id', 'req-0001'], { root }).code, 5); // steps not done yet
    engine(['step-done', '--id', 'req-0001', '--step', '1'], { root });
    engine(['step-done', '--id', 'req-0001', '--step', '2'], { root });
    assert.equal(engine(['gate-done', '--id', 'req-0001'], { root }).code, 5); // QA verdict not written yet
    touch(root, 'requests/req-0001/qa/qa.verdict.json', JSON.stringify({ overall: 'PASS' }));
    assert.equal(engine(['gate-done', '--id', 'req-0001'], { root }).code, 0);
  } finally {
    cleanup(root);
  }
});
