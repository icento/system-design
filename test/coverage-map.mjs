#!/usr/bin/env node
// coverage-map.mjs — exercise every registered engine subcommand's dispatch/parse
// path and assert none crashes internally (exit 70). Run via `node test/run.mjs
// --coverage-map`. This is a breadth check, not a behavior check.

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGISTRY } from '../bin/lib/cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(HERE, '..', 'bin', 'engine.mjs');

const keys = Object.keys(REGISTRY);
let crashed = 0;
for (const key of keys) {
  const args = key.split(' ');
  const r = spawnSync(process.execPath, [ENGINE, ...args, '--json'], { encoding: 'utf8', input: '{}' });
  if (r.status === 70) {
    console.error(`INTERNAL ERROR (exit 70) on subcommand: ${key}\n${r.stdout}${r.stderr}`);
    crashed++;
  }
}
console.log(`coverage-map: exercised ${keys.length} subcommands, ${crashed} crashed`);
process.exit(crashed ? 1 : 0);
