// state.test.mjs — atomic state I/O, .bak recovery, lock contention, mid-write
// .tmp recovery, invalid-state rejection, and gap-aware id minting.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from 'node:fs';
import { load, save, emptyState, statePaths } from '../../bin/lib/state.mjs';
import { nextReqId, nextAdrId } from '../../bin/lib/ids.mjs';
import { tmpDir, cleanup } from '../helpers.mjs';

function withRepo(fn) {
  const root = tmpDir();
  mkdirSync(statePaths(root).dir, { recursive: true });
  try {
    return fn(root);
  } finally {
    cleanup(root);
  }
}

test('save writes atomically: no .tmp remains, .state.json is valid', () => {
  withRepo((root) => {
    save(root, emptyState());
    const p = statePaths(root);
    assert.ok(existsSync(p.json), '.state.json exists');
    assert.ok(!existsSync(p.tmp), 'no leftover .state.tmp');
    const { state } = load(root);
    assert.equal(state.version, 1);
  });
});

test('a second save snapshots the prior state to .bak', () => {
  withRepo((root) => {
    save(root, emptyState());
    const { state } = load(root);
    state.requests['req-0001'] = mkRequest();
    save(root, state);
    assert.ok(existsSync(statePaths(root).bak), '.bak created on second save');
  });
});

test('load recovers from .bak when .state.json is corrupt', () => {
  withRepo((root) => {
    save(root, emptyState()); // A (empty)
    const { state } = load(root);
    state.requests['req-0001'] = mkRequest();
    save(root, state); // B; .bak now holds A
    const p = statePaths(root);
    writeFileSync(p.json, 'this is not json');
    const res = load(root);
    assert.equal(res.recoveredFromBak, true);
    assert.equal(Object.keys(res.state.requests).length, 0, 'recovered the empty backup');
  });
});

test('lock contention throws EWRITE (exit 8)', () => {
  withRepo((root) => {
    save(root, emptyState());
    const p = statePaths(root);
    writeFileSync(p.lock, 'held\n'); // fresh, non-stale lock
    assert.throws(
      () => save(root, emptyState()),
      (e) => e.code === 8,
    );
    unlinkSync(p.lock);
  });
});

test('mid-write recovery: a leftover .tmp with no .json is promoted', () => {
  withRepo((root) => {
    save(root, emptyState());
    const p = statePaths(root);
    renameSync(p.json, p.tmp); // simulate a crash between temp-write and rename
    assert.ok(!existsSync(p.json));
    const { state } = load(root);
    assert.equal(state.version, 1);
    assert.ok(existsSync(p.json), '.json restored from .tmp');
    assert.ok(!existsSync(p.tmp));
  });
});

test('invalid state is refused and the prior file stays intact (ESTATE 7)', () => {
  withRepo((root) => {
    save(root, emptyState());
    const before = readFileSync(statePaths(root).json, 'utf8');
    const bad = emptyState();
    bad.requests['req-0002'] = { id: 'req-0002' }; // missing required fields
    assert.throws(
      () => save(root, bad),
      (e) => e.code === 7,
    );
    assert.equal(readFileSync(statePaths(root).json, 'utf8'), before, 'prior state untouched');
  });
});

test('newer state version is rejected (ESTATE 7)', () => {
  withRepo((root) => {
    save(root, emptyState());
    const p = statePaths(root);
    const obj = JSON.parse(readFileSync(p.json, 'utf8'));
    obj.version = 2;
    writeFileSync(p.json, JSON.stringify(obj));
    // wipe the backup so recovery cannot mask the version error
    if (existsSync(p.bak)) unlinkSync(p.bak);
    assert.throws(
      () => load(root),
      (e) => e.code === 7,
    );
  });
});

test('ids mint gap-aware (max+1, never recycled)', () => {
  assert.equal(nextReqId([]), 'req-0001');
  assert.equal(nextReqId(['req-0001', 'req-0005']), 'req-0006'); // gap at 2..4 preserved
  assert.equal(nextReqId(['req-0009', 'req-0002']), 'req-0010');
  assert.equal(nextAdrId(['adr-0003']), 'adr-0004');
  assert.equal(nextAdrId([]), 'adr-0001');
});

function mkRequest() {
  const now = new Date().toISOString();
  return {
    id: 'req-0001',
    slug: 'sample',
    title: 'Sample',
    tier: null,
    status: 'INTAKE',
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
