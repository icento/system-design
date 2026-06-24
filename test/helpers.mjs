// helpers.mjs — shared test utilities. Each test makes its own os.tmpdir() fixture
// and removes it; nothing is shared between tests.

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = resolve(HERE, '..');
export const ENGINE = resolve(PLUGIN_ROOT, 'bin', 'engine.mjs');

// Create a throwaway directory; returns its path. Caller cleans up via cleanup().
export function tmpDir(prefix = 'sd-test-') {
  return mkdtempSync(resolve(tmpdir(), prefix));
}

export function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

// Run the real engine binary in `root`, always with --json, and parse the final
// JSON line of stdout. Returns { code, json, stdout, stderr }.
export function engine(args, { root, env, input, json: wantJson = true } = {}) {
  const full = [...args];
  if (root) full.push('--project-dir', root);
  if (wantJson) full.push('--json');
  const res = spawnSync(process.execPath, [ENGINE, ...full], {
    encoding: 'utf8',
    input: input ?? undefined,
    env: { ...process.env, ...(env ?? {}) },
  });
  let parsed = null;
  const lines = (res.stdout ?? '').trim().split('\n').filter(Boolean);
  if (lines.length) {
    try {
      parsed = JSON.parse(lines[lines.length - 1]);
    } catch {
      /* leave null */
    }
  }
  return { code: res.status, json: parsed, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

// Make an initialized workflow repo, return its root.
export function initRepo() {
  const root = tmpDir();
  const r = engine(['init'], { root });
  if (r.code !== 0) throw new Error(`init failed: ${r.stderr}`);
  return root;
}

// Seed a SPEC.md / PLAN.md presence for precondition tests.
export function touch(root, relPath, content = 'x') {
  const p = resolve(root, relPath);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  return p;
}
