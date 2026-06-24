// lint.test.mjs — static hygiene of the user-facing surface (skills, commands,
// agents). Enforces the skill protocol invariants without running a model.

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

const skillFiles = () => walk(resolve(PLUGIN_ROOT, 'skills'), (n) => n === 'SKILL.md');
const commandFiles = () => walk(resolve(PLUGIN_ROOT, 'commands'), (n) => n.endsWith('.md'));
const agentFiles = () => walk(resolve(PLUGIN_ROOT, 'agents'), (n) => n.endsWith('.md'));

// A direct state write = a shell redirection / tee into .state.json. Prose mentions
// like "Never hand-edit docs/.state.json" are fine.
const FORBIDDEN_STATE_WRITE = /(^|[\s;|&])(>>?|tee\b)[^\n]*\.state\.json/m;

test('skills: valid frontmatter, RULES sentinel, no direct state writes', () => {
  const files = skillFiles();
  assert.ok(files.length >= 6, 'found the M3 skills');
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    const { data, body } = parse(text);
    assert.ok(data.name, `${f}: frontmatter name`);
    assert.ok(data.description, `${f}: frontmatter description`);
    assert.match(body, /Never hand-edit/, `${f}: RULES sentinel present`);
    assert.ok(!FORBIDDEN_STATE_WRITE.test(text), `${f}: must not write .state.json directly`);
  }
});

test('commands: valid frontmatter with a description, no direct state writes', () => {
  const files = commandFiles();
  assert.ok(files.length >= 6, 'found the M3 commands');
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    const { data } = parse(text);
    assert.ok(data.description, `${f}: frontmatter description`);
    assert.ok(!FORBIDDEN_STATE_WRITE.test(text), `${f}: must not write .state.json directly`);
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
