// hooks.test.mjs — the main-thread PreToolUse gate (hook-gate) and the SessionStart
// rehydrate banner (status --hook).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engine, initRepo, touch, cleanup, tmpDir } from '../helpers.mjs';

// hook-gate emits a bare permissionDecision payload and always exits 0.
function gate(root, filePath) {
  const r = engine(['hook-gate'], { root, json: false, input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } }) });
  assert.equal(r.code, 0, 'hook-gate always exits 0');
  const payload = JSON.parse(r.stdout.trim().split('\n').pop());
  return payload.hookSpecificOutput?.permissionDecision ?? 'allow';
}

function deepNoSpecRepo() {
  const root = initRepo();
  engine(['register', '--title', 'Big refactor', '--slug', 'big', '--tier', 'DEEP'], { root });
  engine(['triage', '--id', 'req-0001', '--tier', 'DEEP'], { root });
  return root;
}

test('hook-gate denies edits to generated/engine-owned files', () => {
  const root = deepNoSpecRepo();
  try {
    assert.equal(gate(root, 'docs/PRINCIPLES.md'), 'deny');
    assert.equal(gate(root, 'docs/.state.json'), 'deny');
  } finally {
    cleanup(root);
  }
});

test('hook-gate asks (warn-first) on a premature source edit for a DEEP request with no SPEC', () => {
  const root = deepNoSpecRepo();
  try {
    assert.equal(gate(root, 'src/app.js'), 'ask');
  } finally {
    cleanup(root);
  }
});

test('hook-gate allows workflow artifacts and unrelated/non-workflow files', () => {
  const root = deepNoSpecRepo();
  try {
    assert.equal(gate(root, 'requests/req-0001/SPEC.md'), 'allow'); // skills manage these
    assert.equal(gate(root, 'docs/adrs/adr-0001.md'), 'allow');
  } finally {
    cleanup(root);
  }
  // A directory that is not a workflow repo: allow, exit 0.
  const plain = tmpDir();
  try {
    assert.equal(gate(plain, 'anything.js'), 'allow');
  } finally {
    cleanup(plain);
  }
});

test('hook-gate stops gating once the DEEP request has a SPEC and no proposed ADRs', () => {
  const root = deepNoSpecRepo();
  try {
    touch(root, 'requests/req-0001/SPEC.md', 'spec');
    assert.equal(gate(root, 'src/app.js'), 'allow');
  } finally {
    cleanup(root);
  }
});

test('status --hook rehydrates pending gates and is silent outside a workflow repo', () => {
  const root = initRepo();
  try {
    engine(['register', '--title', 'Thing'], { root });
    engine(['await', '--id', 'req-0001', '--gate', 'G2'], { root });
    const banner = engine(['status', '--hook'], { root, json: false });
    assert.match(banner.stdout, /awaiting G2/);
  } finally {
    cleanup(root);
  }
  const plain = tmpDir();
  try {
    const r = engine(['status', '--hook'], { root: plain, json: false });
    assert.equal(r.code, 0);
    assert.equal(r.stdout.trim(), '', 'silent outside a workflow repo');
  } finally {
    cleanup(plain);
  }
});
