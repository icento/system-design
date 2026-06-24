// selfcheck.test.mjs — the plugin-integrity gate passes on the real plugin and fails
// loudly on a broken copy (schema regression / version divergence).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { engine, PLUGIN_ROOT, tmpDir, cleanup } from '../helpers.mjs';

test('selfcheck passes on the real plugin', () => {
  const manifestVersion = JSON.parse(readFileSync(resolve(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  const r = engine(['selfcheck', '--plugin-root', PLUGIN_ROOT], { json: true });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json.version, manifestVersion);
});

test('selfcheck fails (7) on a schema with an unsupported keyword', () => {
  const copy = tmpDir('sd-selfcheck-');
  try {
    cpSync(resolve(PLUGIN_ROOT, '.claude-plugin'), resolve(copy, '.claude-plugin'), { recursive: true });
    cpSync(resolve(PLUGIN_ROOT, 'schemas'), resolve(copy, 'schemas'), { recursive: true });
    cpSync(resolve(PLUGIN_ROOT, 'docs'), resolve(copy, 'docs'), { recursive: true });
    cpSync(resolve(PLUGIN_ROOT, 'CHANGELOG.md'), resolve(copy, 'CHANGELOG.md'));
    // inject an unsupported keyword into a schema
    const f = resolve(copy, 'schemas', 'state.schema.json');
    const s = JSON.parse(readFileSync(f, 'utf8'));
    s.if = { type: 'object' };
    writeFileSync(f, JSON.stringify(s));
    const r = engine(['selfcheck', '--plugin-root', copy], { json: true });
    assert.equal(r.code, 7);
    assert.ok(r.json.problems.some((p) => /unsupported|state\.schema/.test(p)));
  } finally {
    cleanup(copy);
  }
});

test('selfcheck fails (7) on CHANGELOG/manifest version divergence', () => {
  const copy = tmpDir('sd-selfcheck-');
  try {
    cpSync(resolve(PLUGIN_ROOT, '.claude-plugin'), resolve(copy, '.claude-plugin'), { recursive: true });
    cpSync(resolve(PLUGIN_ROOT, 'schemas'), resolve(copy, 'schemas'), { recursive: true });
    cpSync(resolve(PLUGIN_ROOT, 'docs'), resolve(copy, 'docs'), { recursive: true });
    writeFileSync(resolve(copy, 'CHANGELOG.md'), '# Changelog\n\n## [9.9.9] - 2026-01-01\n\n- x\n');
    const r = engine(['selfcheck', '--plugin-root', copy], { json: true });
    assert.equal(r.code, 7);
    assert.ok(r.json.problems.some((p) => /CHANGELOG top 9\.9\.9/.test(p)));
  } finally {
    cleanup(copy);
  }
});
