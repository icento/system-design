// lint.test.mjs — static hygiene of the user-facing surface (commands, agents).
// Enforces the command protocol invariants without running a model.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from '../../bin/lib/frontmatter.mjs';
import { PLUGIN_ROOT } from '../helpers.mjs';

function walk(dir, match) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, match));
    else if (e.isFile() && match(e.name, p)) out.push(p);
  }
  return out;
}

const commandFiles = () => walk(resolve(PLUGIN_ROOT, 'commands'), (n) => n.endsWith('.md'));
const agentFiles = () => walk(resolve(PLUGIN_ROOT, 'agents'), (n) => n.endsWith('.md'));

// A direct state write = a shell redirection / tee into .state.json. Prose mentions
// like "Never hand-edit docs/.state.json" are fine.
const FORBIDDEN_STATE_WRITE = /(^|[\s;|&])(>>?|tee\b)[^\n]*\.state\.json/m;

// A command must not delegate to a deleted skill — the procedure now lives inline.
const DANGLING_SKILL_REF = /`sd-[a-z]+`\s+skill|[Ff]ollow the `sd-/;

test('commands: self-contained, valid frontmatter, no direct state writes', () => {
  const files = commandFiles();
  assert.ok(files.length >= 6, 'found the M3 commands');
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    const { data } = parse(text);
    assert.ok(data.description, `${f}: frontmatter description`);
    assert.ok(!FORBIDDEN_STATE_WRITE.test(text), `${f}: must not write .state.json directly`);
    assert.ok(!DANGLING_SKILL_REF.test(text), `${f}: must not delegate to a (deleted) skill`);
  }
});

test('agents: no subagent references AskUserQuestion (main-thread-only, R9)', () => {
  for (const f of agentFiles()) {
    const text = readFileSync(f, 'utf8');
    // Spike throwaways live under spike/, not agents/ — but guard anyway.
    if (f.includes('_spike')) continue;
    assert.ok(!/AskUserQuestion/.test(text), `${f}: subagents cannot use AskUserQuestion`);
  }
});

test('entry-point hook scripts are executable (sourced libs under lib/ exempt)', () => {
  const entries = walk(resolve(PLUGIN_ROOT, 'hooks'), (n, p) => n.endsWith('.sh') && !p.includes('/lib/'));
  assert.ok(entries.length >= 2);
  for (const f of entries) {
    assert.ok(statSync(f).mode & 0o111, `${f} should be executable`);
  }
});
