// governance.test.mjs — config + override argument validation (M5), and the
// agent tool-restriction invariants.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from '../../bin/lib/frontmatter.mjs';
import { engine, initRepo, cleanup, PLUGIN_ROOT } from '../helpers.mjs';

test('config set validates keys and values', () => {
  const root = initRepo();
  try {
    engine(['register', '--title', 'C', '--slug', 'c'], { root });
    assert.equal(engine(['config', 'set', '--id', 'req-0001', 'enforcement', 'deny'], { root }).code, 0);
    assert.equal(engine(['config', 'set', '--id', 'req-0001', 'enforcement', 'loud'], { root }).code, 2);
    assert.equal(engine(['config', 'set', '--id', 'req-0001', 'tigerLintBlocking', 'true'], { root }).code, 0);
    assert.equal(engine(['config', 'set', '--id', 'req-0001', 'tigerLintBlocking', 'maybe'], { root }).code, 2);
    assert.equal(engine(['config', 'set', '--id', 'req-0001', 'nope', 'x'], { root }).code, 2);
  } finally {
    cleanup(root);
  }
});

test('override add validates required args and mints sequential ids', () => {
  const root = initRepo();
  try {
    engine(['register', '--title', 'O', '--slug', 'o'], { root });
    assert.equal(engine(['override', 'add', '--req', 'req-0001'], { root }).code, 2); // no path/glob
    assert.equal(engine(['override', 'add', '--req', 'req-0001', '--glob', 'src/**'], { root }).code, 2); // no reason
    const a = engine(['override', 'add', '--req', 'req-0001', '--glob', 'src/**', '--reason', 'r', '--scope', 'once'], { root });
    assert.equal(a.json.override, 'ovr-1');
    const b = engine(['override', 'add', '--req', 'req-0001', '--path', 'src/x.js', '--reason', 'r2', '--scope', 'request'], { root });
    assert.equal(b.json.override, 'ovr-2');
    assert.equal(engine(['override', 'add', '--req', 'req-0001', '--path', 'x', '--reason', 'r', '--scope', 'forever'], { root }).code, 2);
  } finally {
    cleanup(root);
  }
});

test('qa-verifier subagent has no Edit/Write tools; implementer does', () => {
  const qa = parse(readFileSync(resolve(PLUGIN_ROOT, 'agents/qa-verifier.md'), 'utf8')).data;
  assert.ok(!/Edit|Write|MultiEdit/.test(qa.tools ?? ''), 'qa-verifier must be read-only');
  const impl = parse(readFileSync(resolve(PLUGIN_ROOT, 'agents/implementer.md'), 'utf8')).data;
  assert.ok(/Edit/.test(impl.tools ?? ''), 'implementer can edit');
});
