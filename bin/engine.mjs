#!/usr/bin/env node
// engine.mjs — the system-design workflow engine: the ONLY writer of workflow
// state (docs/.state.json) and the sole gatekeeper of lifecycle transitions.
// Zero npm dependencies; Node >= 18.3 (parseArgs/structuredClone). All logic lives
// in ./lib; this file is a thin shim so the shebang module stays trivial.

import process from 'node:process';
import { run } from './lib/cli.mjs';

// Preflight: refuse to run on an unsupported Node version (frozen exit 2).
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 18 || (maj === 18 && min < 3)) {
  process.stderr.write(`sd-engine: EUSAGE: Node >= 18.3 required, found ${process.versions.node}\n`);
  process.exit(2);
}

process.exit(run(process.argv.slice(2)));
