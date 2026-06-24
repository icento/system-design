// plan.test.mjs — plan-check coverage holes (M4) and the engine-enforced PLAN_OK
// gate (PASS-with-blockers must NOT advance).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { engine, initRepo, touch, cleanup } from '../helpers.mjs';
import { requestPaths } from '../../bin/lib/paths.mjs';

const SPEC = [
  '---',
  'id: req-0001',
  'kind: spec',
  'title: Thing',
  'status: ready',
  'requirements:',
  '  - id: REQ-0001-01',
  '    statement: do x',
  '    kind: functional',
  '    priority: must',
  '  - id: REQ-0001-02',
  '    statement: do y',
  '    kind: functional',
  '    priority: should',
  'nonGoals: []',
  '---',
  'spec',
  '',
].join('\n');

function planMd(steps) {
  const lines = ['---', 'id: req-0001', 'kind: plan', 'status: draft', 'steps:'];
  const block = (key, items) => {
    if (items.length === 0) {
      lines.push(`    ${key}: []`);
      return;
    }
    lines.push(`    ${key}:`);
    for (const it of items) lines.push(`      - ${it}`);
  };
  for (const s of steps) {
    lines.push(`  - id: ${s.id}`);
    lines.push(`    intent: ${s.intent}`);
    block('satisfies', s.satisfies);
    block('files', s.files);
    block('tests', s.tests);
    lines.push('    status: todo');
  }
  lines.push('---', 'plan', '');
  return lines.join('\n');
}

const GOOD = [
  { id: 'STEP-001', intent: 'do x', satisfies: ['REQ-0001-01'], files: ['src/x.js'], tests: ['test/x.test.mjs::works'] },
  { id: 'STEP-002', intent: 'do y', satisfies: ['REQ-0001-02'], files: ['src/y.js'], tests: ['test/y.test.mjs::works'] },
];

function toSpecced(root) {
  engine(['register', '--title', 'Thing', '--slug', 't', '--tier', 'STANDARD'], { root });
  engine(['triage', '--id', 'req-0001', '--tier', 'STANDARD'], { root });
  touch(root, 'requests/req-0001/SPEC.md', SPEC);
  assert.equal(engine(['advance', '--id', 'req-0001', '--to', 'SPECCED'], { root }).code, 0);
}

test('plan-check passes a complete plan and fails each hole', () => {
  const root = initRepo();
  try {
    toSpecced(root);
    const plan = requestPaths(root, 'req-0001').plan;

    writeFileSync(plan, planMd(GOOD));
    assert.equal(engine(['plan-check', '--id', 'req-0001'], { root }).code, 0);

    // REQ-without-step
    writeFileSync(plan, planMd([GOOD[0]]));
    let r = engine(['plan-check', '--id', 'req-0001'], { root });
    assert.equal(r.code, 5);
    assert.ok(r.json.holes.reqWithoutStep.includes('REQ-0001-02'));

    // step-without-test
    writeFileSync(plan, planMd([GOOD[0], { ...GOOD[1], tests: [] }]));
    r = engine(['plan-check', '--id', 'req-0001'], { root });
    assert.equal(r.code, 5);
    assert.ok(r.json.holes.stepWithoutTest.includes('STEP-002'));

    // dangling satisfies
    writeFileSync(plan, planMd([GOOD[0], { ...GOOD[1], satisfies: ['REQ-0001-99'] }]));
    r = engine(['plan-check', '--id', 'req-0001'], { root });
    assert.equal(r.code, 5);
    assert.ok(r.json.holes.danglingSatisfies.some((d) => d.req === 'REQ-0001-99'));
  } finally {
    cleanup(root);
  }
});

test('plan-check rejects invalid PLAN frontmatter (ESCHEMA 9)', () => {
  const root = initRepo();
  try {
    toSpecced(root);
    writeFileSync(requestPaths(root, 'req-0001').plan, '---\nid: req-0001\nkind: plan\nstatus: draft\nsteps: []\n---\n');
    // steps minItems:1 violated
    assert.equal(engine(['plan-check', '--id', 'req-0001'], { root }).code, 9);
  } finally {
    cleanup(root);
  }
});

test('PLAN_OK gate: only PASS with zero blockers advances; PASS-with-blocker stays PLANNED', () => {
  const root = initRepo();
  try {
    toSpecced(root);
    writeFileSync(requestPaths(root, 'req-0001').plan, planMd(GOOD));
    assert.equal(engine(['advance', '--id', 'req-0001', '--to', 'PLANNED'], { root }).code, 0);

    const verdict = requestPaths(root, 'req-0001').planVerdict;

    // no verdict -> refused
    assert.equal(engine(['advance', '--id', 'req-0001', '--to', 'PLAN_OK'], { root }).code, 5);

    // PASS but blockerCount 2 -> refused (the load-bearing fix)
    touch(root, verdict, JSON.stringify({ verdict: 'PASS', blockerCount: 2 }));
    assert.equal(engine(['advance', '--id', 'req-0001', '--to', 'PLAN_OK'], { root }).code, 5);

    // REVISE -> refused
    touch(root, verdict, JSON.stringify({ verdict: 'REVISE', blockerCount: 0 }));
    assert.equal(engine(['advance', '--id', 'req-0001', '--to', 'PLAN_OK'], { root }).code, 5);

    // PASS + 0 blockers -> advances
    touch(root, verdict, JSON.stringify({ verdict: 'PASS', blockerCount: 0 }));
    const ok = engine(['advance', '--id', 'req-0001', '--to', 'PLAN_OK'], { root });
    assert.equal(ok.code, 0);
    assert.equal(ok.json.to, 'PLAN_OK');
  } finally {
    cleanup(root);
  }
});
