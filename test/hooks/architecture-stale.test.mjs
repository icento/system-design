// architecture-stale.test.mjs — the .architecture-stale sentinel gates DONE and is
// cleared by arch-sync; accepting/editing an accepted ADR flips it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { engine, initRepo, touch, cleanup } from '../helpers.mjs';
import { statePaths } from '../../bin/lib/state.mjs';

const SPEC = ['---', 'id: req-0001', 'kind: spec', 'title: X', 'status: ready', 'requirements:', '  - id: REQ-0001-01', '    statement: x', '    kind: functional', '    priority: must', 'nonGoals: []', '---', 's', ''].join('\n');
const DQS = { request_id: 'req-0001', generated_at: '2026-01-01T00:00:00.000Z', questions: [{ id: 'Q1', staged_adr_id: 'adr-0001', entity: 'x', question: 'How?', options: [{ label: 'P', summary: 'p' }, { label: 'N', summary: 'n' }], recommended_option_index: 0, principle_ids: ['tiger-bound-everything'] }] };
const ADR = ['---', 'id: adr-0001', 'kind: adr', 'title: Pool', 'status: proposed', 'date: 2026-01-01', 'request: req-0001', 'governs:', '  - src/x/**', 'principles:', '  - tiger-bound-everything', 'decisionQuestion: How?', 'choice: Pool.', 'constraints:', '  forbids: []', '  requires: []', 'supersedes: null', '---', '## Decision', '', 'Use a pool.', '', '## Consequences', '', 'ok.', ''].join('\n');

test('accepting an ADR flags ARCHITECTURE stale; arch-sync clears it', () => {
  const root = initRepo();
  try {
    engine(['register', '--title', 'X', '--slug', 'x', '--tier', 'STANDARD'], { root });
    engine(['triage', '--id', 'req-0001', '--tier', 'STANDARD'], { root });
    touch(root, 'requests/req-0001/SPEC.md', SPEC);
    engine(['advance', '--id', 'req-0001', '--to', 'SPECCED'], { root });
    touch(root, 'docs/adrs/adr-0001.md', ADR);
    touch(root, 'requests/req-0001/decisions.json', JSON.stringify(DQS));
    engine(['decisions', 'write', '--req', 'req-0001', '--from', resolve(root, 'requests/req-0001/decisions.json')], { root });
    engine(['adr', 'stage', '--request', 'req-0001'], { root });
    engine(['accept-adr', '--req', 'req-0001', '--adr', 'adr-0001'], { root });

    assert.ok(existsSync(statePaths(root).archStale), 'sentinel set on acceptance');
    engine(['arch-sync'], { root });
    assert.ok(!existsSync(statePaths(root).archStale), 'arch-sync clears the sentinel');
  } finally {
    cleanup(root);
  }
});

test('DONE is blocked while ARCHITECTURE is stale, then permitted after arch-sync', () => {
  const root = initRepo();
  try {
    // A TRIVIAL request reaches VERIFYING with complete (empty) traceability.
    engine(['register', '--title', 'tiny', '--slug', 'tiny', '--tier', 'TRIVIAL'], { root });
    for (const to of ['TRIAGED', 'SPECCED', 'PLANNED', 'PLAN_OK', 'IMPLEMENTING', 'VERIFYING']) {
      engine(['advance', '--id', 'req-0001', '--to', to], { root });
    }
    // Manually flag stale (as an accepted ADR elsewhere would).
    writeFileSync(statePaths(root).archStale, 'x\n');
    assert.equal(engine(['advance', '--id', 'req-0001', '--to', 'DONE'], { root }).code, 5, 'DONE blocked while stale');

    engine(['arch-sync'], { root });
    assert.equal(engine(['advance', '--id', 'req-0001', '--to', 'DONE'], { root }).code, 0, 'DONE after arch-sync');
  } finally {
    cleanup(root);
  }
});

test('hook-adr-edit re-flags stale after an accepted ADR Decision changes', () => {
  const root = initRepo();
  try {
    engine(['register', '--title', 'X', '--slug', 'x', '--tier', 'STANDARD'], { root });
    engine(['triage', '--id', 'req-0001', '--tier', 'STANDARD'], { root });
    touch(root, 'requests/req-0001/SPEC.md', SPEC);
    engine(['advance', '--id', 'req-0001', '--to', 'SPECCED'], { root });
    touch(root, 'docs/adrs/adr-0001.md', ADR);
    touch(root, 'requests/req-0001/decisions.json', JSON.stringify(DQS));
    engine(['decisions', 'write', '--req', 'req-0001', '--from', resolve(root, 'requests/req-0001/decisions.json')], { root });
    engine(['adr', 'stage', '--request', 'req-0001'], { root });
    engine(['accept-adr', '--req', 'req-0001', '--adr', 'adr-0001'], { root });
    engine(['arch-sync'], { root }); // fresh
    assert.ok(!existsSync(statePaths(root).archStale));

    // Edit the accepted ADR's Decision, then fire the post-adr-edit hook.
    writeFileSync(resolve(root, 'docs/adrs/adr-0001.md'), ADR.replace('Use a pool.', 'Use a GLOBAL handle.'));
    engine(['hook-adr-edit'], { root, json: false });
    assert.ok(existsSync(statePaths(root).archStale), 'hook re-flags stale');
  } finally {
    cleanup(root);
  }
});
