// arch-sync.test.mjs — ARCHITECTURE.md generation is byte-deterministic (frozen
// clock); --check reports staleness; a whitespace-only ADR edit does NOT change the
// hash, but a Decision-content edit does.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { engine, initRepo, touch, cleanup } from '../helpers.mjs';

function adrMd(decision) {
  return [
    '---', 'id: adr-0001', 'kind: adr', 'title: Pooling', 'status: proposed', 'date: 2026-01-01',
    'request: req-0001', 'governs:', '  - src/x/**', 'principles:', '  - tiger-bound-everything',
    'decisionQuestion: How?', 'choice: Use a bounded pool.', 'constraints:', '  forbids: []', '  requires: []',
    'supersedes: null', '---',
    '## Context', '', 'ctx', '', '## Decision', '', decision, '', '## Consequences', '', 'Bounded memory.', '',
  ].join('\n');
}

const DQS = { request_id: 'req-0001', generated_at: '2026-01-01T00:00:00.000Z', questions: [{ id: 'Q1', staged_adr_id: 'adr-0001', entity: 'x', question: 'How?', options: [{ label: 'Pool', summary: 'p' }, { label: 'No', summary: 'n' }], recommended_option_index: 0, principle_ids: ['tiger-bound-everything'] }] };
const SPEC = ['---', 'id: req-0001', 'kind: spec', 'title: X', 'status: ready', 'requirements:', '  - id: REQ-0001-01', '    statement: x', '    kind: functional', '    priority: must', 'nonGoals: []', '---', 's', ''].join('\n');

function repoWithAcceptedAdr(decision = 'Use a bounded connection pool sized at startup.') {
  const root = initRepo();
  engine(['register', '--title', 'X', '--slug', 'x', '--tier', 'STANDARD'], { root });
  engine(['triage', '--id', 'req-0001', '--tier', 'STANDARD'], { root });
  touch(root, 'requests/req-0001/SPEC.md', SPEC);
  engine(['advance', '--id', 'req-0001', '--to', 'SPECCED'], { root });
  touch(root, 'docs/adrs/adr-0001.md', adrMd(decision));
  touch(root, 'requests/req-0001/decisions.json', JSON.stringify(DQS));
  engine(['decisions', 'write', '--req', 'req-0001', '--from', resolve(root, 'requests/req-0001/decisions.json')], { root });
  engine(['adr', 'stage', '--request', 'req-0001'], { root });
  engine(['accept-adr', '--req', 'req-0001', '--adr', 'adr-0001'], { root });
  return root;
}

test('arch-sync is byte-deterministic under a frozen clock', () => {
  const root = repoWithAcceptedAdr();
  try {
    engine(['arch-sync', '--frozen-clock'], { root });
    const a = readFileSync(resolve(root, 'docs/ARCHITECTURE.md'), 'utf8');
    engine(['arch-sync', '--frozen-clock'], { root });
    const b = readFileSync(resolve(root, 'docs/ARCHITECTURE.md'), 'utf8');
    assert.equal(a, b);
    assert.match(a, /adr-0001/);
  } finally {
    cleanup(root);
  }
});

test('--check is 0 fresh, 6 after a Decision edit, 0 after re-sync', () => {
  const root = repoWithAcceptedAdr();
  try {
    engine(['arch-sync'], { root });
    assert.equal(engine(['arch-sync', '--check'], { root }).code, 0);

    // change the Decision content -> stale
    writeFileSync(resolve(root, 'docs/adrs/adr-0001.md'), adrMd('Use a SHARED GLOBAL handle instead.'));
    assert.equal(engine(['arch-sync', '--check'], { root }).code, 6);

    engine(['arch-sync'], { root });
    assert.equal(engine(['arch-sync', '--check'], { root }).code, 0);
  } finally {
    cleanup(root);
  }
});

test('a whitespace-only ADR edit does NOT change the hash', () => {
  const root = repoWithAcceptedAdr();
  try {
    engine(['arch-sync'], { root });
    const before = engine(['arch-sync', '--check'], { root });
    assert.equal(before.code, 0);
    // add trailing/internal whitespace to the Decision section only
    writeFileSync(resolve(root, 'docs/adrs/adr-0001.md'), adrMd('Use a bounded connection pool sized at startup.   '));
    assert.equal(engine(['arch-sync', '--check'], { root }).code, 0, 'whitespace-only edit stays fresh');
  } finally {
    cleanup(root);
  }
});
