#!/usr/bin/env node
// run.mjs — zero-dependency test runner. Discovers every *.test.mjs under test/
// and runs it through node's built-in test runner. `--coverage-map` additionally
// asserts every engine subcommand is exercised (wired in M7).

import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));

function findTests(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...findTests(p));
    else if (entry.isFile() && entry.name.endsWith('.test.mjs')) out.push(p);
  }
  return out.sort();
}

const flags = process.argv.slice(2);
const coverageMap = flags.includes('--coverage-map');

const files = findTests(HERE);
if (files.length === 0) {
  console.error('no test files found');
  process.exit(1);
}

const res = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
if ((res.status ?? 1) !== 0) process.exit(res.status ?? 1);

if (coverageMap) {
  const cov = spawnSync(process.execPath, [resolve(HERE, 'coverage-map.mjs')], { stdio: 'inherit' });
  process.exit(cov.status ?? 0);
}

process.exit(0);
