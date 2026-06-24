// implement-gate.test.mjs — the implement-phase gate (M5). The CI canary for the
// load-bearing enforcement: a governed file outside the PLAN scope is denied; in
// scope it is allowed; an override permits it once; warn-first escalates to a hard
// deny; an accepted-ADR-governed edit auto-escalates to DEEP; the gate reads only
// state + the cached index (works even after the ADR markdown is removed).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { engine, initRepo, touch, cleanup } from '../helpers.mjs';

function decision(root, filePath) {
  const r = engine(['hook-gate'], { root, json: false, input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } }) });
  assert.equal(r.code, 0);
  const payload = JSON.parse(r.stdout.trim().split('\n').pop());
  return payload.hookSpecificOutput?.permissionDecision ?? 'allow';
}

const ADR = [
  '---',
  'id: adr-0001',
  'kind: adr',
  'title: DB access',
  'status: proposed',
  'date: 2026-01-01',
  'request: req-0001',
  'governs:',
  '  - src/db/**',
  'principles:',
  '  - tiger-bound-everything',
  'decisionQuestion: How to access the DB?',
  'choice: Use a bounded pool.',
  'constraints:',
  '  forbids:',
  '    - direct global db handle',
  '  requires:',
  '    - per-request scope',
  'supersedes: null',
  '---',
  'body',
  '',
].join('\n');

const SPEC = ['---', 'id: req-0001', 'kind: spec', 'title: DB', 'status: ready', 'requirements:', '  - id: REQ-0001-01', '    statement: store data', '    kind: functional', '    priority: must', 'nonGoals: []', '---', 's', ''].join('\n');

const PLAN = ['---', 'id: req-0001', 'kind: plan', 'status: draft', 'steps:', '  - id: STEP-001', '    intent: add store', '    satisfies:', '      - REQ-0001-01', '    files:', '      - src/db/store.js', '    tests:', '      - test/store.test.mjs::works', '    adrs:', '      - adr-0001', '    status: todo', '---', 'p', ''].join('\n');

const DQS = {
  request_id: 'req-0001',
  generated_at: '2026-01-01T00:00:00.000Z',
  questions: [{ id: 'Q1', staged_adr_id: 'adr-0001', entity: 'db', question: 'How?', options: [{ label: 'Pool', summary: 'p' }, { label: 'Global', summary: 'g' }], recommended_option_index: 0, principle_ids: ['tiger-bound-everything'] }],
};

// Drive a STANDARD request to IMPLEMENTING with an accepted ADR governing src/db/**.
function toImplementing() {
  const root = initRepo();
  engine(['register', '--title', 'DB', '--slug', 'db', '--tier', 'STANDARD'], { root });
  engine(['triage', '--id', 'req-0001', '--tier', 'STANDARD'], { root });
  touch(root, 'requests/req-0001/SPEC.md', SPEC);
  engine(['advance', '--id', 'req-0001', '--to', 'SPECCED'], { root });
  touch(root, 'docs/adrs/adr-0001.md', ADR);
  touch(root, 'requests/req-0001/decisions.json', JSON.stringify(DQS));
  engine(['decisions', 'write', '--req', 'req-0001', '--from', resolve(root, 'requests/req-0001/decisions.json')], { root });
  engine(['adr', 'stage', '--request', 'req-0001'], { root });
  engine(['accept-adr', '--req', 'req-0001', '--adr', 'adr-0001'], { root });
  engine(['advance', '--id', 'req-0001', '--to', 'DECIDED'], { root });
  touch(root, 'requests/req-0001/PLAN.md', PLAN);
  engine(['advance', '--id', 'req-0001', '--to', 'PLANNED'], { root });
  touch(root, 'requests/req-0001/qa/plan-review.verdict.json', JSON.stringify({ verdict: 'PASS', blockerCount: 0 }));
  engine(['advance', '--id', 'req-0001', '--to', 'PLAN_OK'], { root });
  engine(['advance', '--id', 'req-0001', '--to', 'IMPLEMENTING'], { root });
  return root;
}

test('CANARY: governed file in PLAN scope is allowed, out of scope is gated', () => {
  const root = toImplementing();
  try {
    // governs-index was built on accept-adr
    assert.equal(engine(['governs', '--path', 'src/db/store.js'], { root }).json.governed, true);
    // in scope (and governed) -> allow
    assert.equal(decision(root, 'src/db/store.js'), 'allow');
    // governed by src/db/** but NOT in PLAN scope -> gated (warn default => ask)
    assert.equal(decision(root, 'src/db/secret.js'), 'ask');
  } finally {
    cleanup(root);
  }
});

test('warn-first: enforcement=deny asks once then hard-denies', () => {
  const root = toImplementing();
  try {
    engine(['config', 'set', '--id', 'req-0001', 'enforcement', 'deny'], { root });
    assert.equal(decision(root, 'src/db/secret.js'), 'ask', 'first denial is a warning');
    assert.equal(decision(root, 'src/db/secret.js'), 'deny', 'subsequent denials are hard');
  } finally {
    cleanup(root);
  }
});

test('override permits exactly one matching edit, then is consumed', () => {
  const root = toImplementing();
  try {
    engine(['config', 'set', '--id', 'req-0001', 'enforcement', 'deny'], { root });
    engine(['override', 'add', '--req', 'req-0001', '--path', 'src/db/secret.js', '--reason', 'one-off migration', '--scope', 'once'], { root });
    assert.equal(decision(root, 'src/db/secret.js'), 'allow', 'override allows once');
    // consumed -> no longer allowed (gated again; ask is the first post-override denial)
    assert.notEqual(decision(root, 'src/db/secret.js'), 'allow');
    assert.ok(existsSync(resolve(root, 'requests/req-0001/qa/overrides.log')), 'audit log written');
  } finally {
    cleanup(root);
  }
});

test('auto-escalation: editing a governed file flips a STANDARD request to DEEP', () => {
  const root = toImplementing();
  try {
    assert.equal(engine(['context', '--id', 'req-0001'], { root }).json.tier, 'STANDARD');
    decision(root, 'src/db/store.js'); // governed edit
    const ctx = engine(['context', '--id', 'req-0001'], { root });
    assert.equal(ctx.json.tier, 'DEEP');
  } finally {
    cleanup(root);
  }
});

test('the gate uses the cached index — it still gates after the ADR markdown is removed', () => {
  const root = toImplementing();
  try {
    unlinkSync(resolve(root, 'docs/adrs/adr-0001.md')); // remove the source ADR file
    // index persists; the gate must NOT re-walk docs/adrs and must still know src/db is governed
    assert.equal(engine(['governs', '--path', 'src/db/secret.js'], { root }).json.governed, true);
    assert.equal(decision(root, 'src/db/secret.js'), 'ask');
  } finally {
    cleanup(root);
  }
});

test('an ungoverned, out-of-scope source edit is still scope-gated during IMPLEMENTING', () => {
  const root = toImplementing();
  try {
    assert.equal(decision(root, 'src/unrelated/x.js'), 'ask'); // not in PLAN scope
  } finally {
    cleanup(root);
  }
});
