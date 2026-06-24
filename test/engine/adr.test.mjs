// adr.test.mjs — the M2 ADR/decision engine surface (deterministic plumbing the
// model-invoked architect drives): adr next, decisions write, adr stage, accept-adr,
// and the SPECCED -> ADR_PROPOSED -> DECIDED path with the G2 gate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { engine, initRepo, touch, cleanup } from '../helpers.mjs';

function adrMd(id, governs) {
  return [
    '---',
    `id: ${id}`,
    'kind: adr',
    `title: Decide ${id}`,
    'status: proposed',
    'date: 2026-01-01',
    'request: req-0001',
    'governs:',
    `  - ${governs}`,
    'principles:',
    '  - tiger-bound-everything',
    'decisionQuestion: How should it be bounded?',
    'choice: Bound it explicitly with a fixed cap.',
    'constraints:',
    '  forbids: []',
    '  requires: []',
    'supersedes: null',
    '---',
    '## Context\n\nx\n\n## Decision\n\ny\n\n## Consequences\n\nz\n',
  ].join('\n');
}

function dqs() {
  return {
    request_id: 'req-0001',
    generated_at: '2026-01-01T00:00:00.000Z',
    questions: [
      { id: 'Q1', staged_adr_id: 'adr-0001', entity: 'queue', question: 'How to bound the queue?', options: [{ label: 'Fixed', summary: 'cap' }, { label: 'Grow', summary: 'unbounded' }], recommended_option_index: 0, principle_ids: ['tiger-bound-everything'] },
      { id: 'Q2', staged_adr_id: 'adr-0002', entity: 'store', question: 'How to allocate the store?', options: [{ label: 'Static', summary: 'pool' }, { label: 'Dynamic', summary: 'heap' }], recommended_option_index: 0, principle_ids: ['tiger-static-allocation'] },
    ],
  };
}

function toSpecced(root) {
  engine(['register', '--title', 'Bounded queue', '--slug', 'bq', '--tier', 'STANDARD'], { root });
  engine(['advance', '--id', 'req-0001', '--to', 'TRIAGED'], { root });
  touch(root, 'requests/req-0001/SPEC.md', 'spec body');
  const r = engine(['advance', '--id', 'req-0001', '--to', 'SPECCED'], { root });
  assert.equal(r.code, 0, 'reached SPECCED');
}

test('adr next reserves gap-aware ids without writing', () => {
  const root = initRepo();
  try {
    const r = engine(['adr', 'next', '--count', '2'], { root });
    assert.deepEqual(r.json.ids, ['adr-0001', 'adr-0002']);
    // No state mutation: a second call returns the same ids.
    assert.deepEqual(engine(['adr', 'next', '--count', '2'], { root }).json.ids, ['adr-0001', 'adr-0002']);
  } finally {
    cleanup(root);
  }
});

test('decisions write validates and persists the DQS handoff', () => {
  const root = initRepo();
  try {
    toSpecced(root);
    const tmp = resolve(root, 'requests/req-0001/decisions.json');
    writeFileSync(tmp, JSON.stringify(dqs()));
    const r = engine(['decisions', 'write', '--req', 'req-0001', '--from', tmp], { root });
    assert.equal(r.code, 0);
    assert.equal(r.json.questions, 2);
    // An invalid DQS is rejected with ESCHEMA(9).
    writeFileSync(tmp, JSON.stringify({ request_id: 'req-0001', generated_at: 'x', questions: [{ id: 'bad' }] }));
    assert.equal(engine(['decisions', 'write', '--req', 'req-0001', '--from', tmp], { root }).code, 9);
  } finally {
    cleanup(root);
  }
});

test('full G2 path: stage -> ADR_PROPOSED -> accept both -> DECIDED', () => {
  const root = initRepo();
  try {
    toSpecced(root);
    touch(root, 'docs/adrs/adr-0001.md', adrMd('adr-0001', 'src/queue/**'));
    touch(root, 'docs/adrs/adr-0002.md', adrMd('adr-0002', 'src/store/**'));
    writeFileSync(resolve(root, 'requests/req-0001/decisions.json'), JSON.stringify(dqs()));
    engine(['decisions', 'write', '--req', 'req-0001', '--from', resolve(root, 'requests/req-0001/decisions.json')], { root });

    const staged = engine(['adr', 'stage', '--request', 'req-0001'], { root });
    assert.equal(staged.code, 0);
    assert.equal(staged.json.status, 'ADR_PROPOSED');
    assert.deepEqual(staged.json.staged, ['adr-0001', 'adr-0002']);

    // Cannot reach DECIDED while ADRs are proposed (G2), even with --override.
    assert.equal(engine(['advance', '--id', 'req-0001', '--to', 'DECIDED'], { root }).code, 5);
    assert.equal(engine(['advance', '--id', 'req-0001', '--to', 'DECIDED', '--override', 'force'], { root }).code, 5);

    assert.equal(engine(['accept-adr', '--req', 'req-0001', '--adr', 'adr-0001'], { root }).code, 0);
    // still one proposed
    assert.equal(engine(['advance', '--id', 'req-0001', '--to', 'DECIDED'], { root }).code, 5);
    const acc2 = engine(['accept-adr', '--req', 'req-0001', '--adr', 'adr-0002'], { root });
    assert.equal(acc2.json.proposedRemaining, 0);

    // Now DECIDED is reachable (human verb already flipped the ADRs).
    assert.equal(engine(['advance', '--id', 'req-0001', '--to', 'DECIDED'], { root }).code, 0);

    // The accepted ADR markdown frontmatter was flipped too.
    const ctx = engine(['context', '--id', 'req-0001'], { root });
    assert.ok(ctx.json.adrs.every((a) => a.status === 'accepted'));

    // Re-accepting an accepted ADR is refused.
    assert.equal(engine(['accept-adr', '--req', 'req-0001', '--adr', 'adr-0001'], { root }).code, 5);
  } finally {
    cleanup(root);
  }
});

test('adr stage rejects a DQS that points at a missing ADR file (ESCHEMA 9)', () => {
  const root = initRepo();
  try {
    toSpecced(root);
    writeFileSync(resolve(root, 'requests/req-0001/decisions.json'), JSON.stringify(dqs()));
    engine(['decisions', 'write', '--req', 'req-0001', '--from', resolve(root, 'requests/req-0001/decisions.json')], { root });
    // No adr markdown files written -> stage fails closed.
    assert.equal(engine(['adr', 'stage', '--request', 'req-0001'], { root }).code, 9);
  } finally {
    cleanup(root);
  }
});
