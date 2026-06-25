// cli.mjs — argument parsing, the subcommand dispatch table, and usage text. It
// owns NO business logic: each subcommand resolves to a handler from an actions/*
// module. engine.mjs is a 3-line shim around run().

import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT, EngineError, errUsage, renderOk, renderError, renderHook } from './output.mjs';
import { resolvePluginRoot } from './schemas.mjs';
import { lifecycleCommands } from './actions/lifecycle.mjs';
import { principlesCommands } from './actions/principles.mjs';
import { adrCommands } from './actions/adr.mjs';
import { clarifyCommands } from './actions/clarify.mjs';
import { hookCommands } from './actions/hooks.mjs';
import { planCommands } from './actions/plan.mjs';
import { verifyCommands } from './actions/verify.mjs';
import { governanceCommands } from './actions/governance.mjs';
import { archCommands } from './actions/arch.mjs';
import { selfcheckCommands } from './actions/selfcheck.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// Commands whose name is two tokens (`<ns> <verb>`), e.g. `principles retrieve`.
const NAMESPACES = new Set(['principles', 'adr', 'decisions', 'schema', 'override', 'config']);

const GLOBAL_OPTIONS = {
  json: { type: 'boolean' },
  quiet: { type: 'boolean' },
  'project-dir': { type: 'string' },
  'plugin-root': { type: 'string' },
  help: { type: 'boolean' },
};

// Global flags that take a value (`--project-dir DIR`); used to skip the value when
// scanning for the command so a global may appear before it (`--project-dir D status`).
const GLOBAL_STRING_FLAGS = new Set(['--project-dir', '--plugin-root']);

// The registry. Later milestones spread additional command modules in here.
export const REGISTRY = {
  ...lifecycleCommands,
  ...principlesCommands,
  ...adrCommands,
  ...clarifyCommands,
  ...hookCommands,
  ...planCommands,
  ...verifyCommands,
  ...governanceCommands,
  ...archCommands,
  ...selfcheckCommands,
};

function engineVersion() {
  try {
    const pkg = JSON.parse(readFileSync(resolve(HERE, '..', '..', 'package.json'), 'utf8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// Find the command token(s), tolerating global flags in ANY position. Scans past
// global flags (and the value of a string-valued one) so `engine --project-dir D
// --json status` resolves to `status` just like `status --project-dir D --json`.
// Returns { key, rest } where `rest` is argv with the command token(s) removed
// (globals stay in `rest` for parseArgs).
function splitCommand(argv) {
  const toks = [];
  const used = new Set();
  for (let i = 0; i < argv.length && toks.length < 2; i++) {
    const a = argv[i];
    if (a.startsWith('-')) {
      // `--project-dir DIR`: also skip its value so it isn't mistaken for the command.
      if (GLOBAL_STRING_FLAGS.has(a) && i + 1 < argv.length && !argv[i + 1].startsWith('-')) i++;
      continue;
    }
    toks.push(a);
    used.add(i);
    // Only collect a second token when the first is a namespace (`principles retrieve`).
    if (!(toks.length === 1 && NAMESPACES.has(a))) break;
  }
  const rest = argv.filter((_, i) => !used.has(i));
  if (toks.length >= 2 && NAMESPACES.has(toks[0])) return { key: `${toks[0]} ${toks[1]}`, rest };
  if (toks.length >= 1) return { key: toks[0], rest };
  return { key: '', rest: argv };
}

function usageText() {
  const lines = ['sd-engine — system-design workflow engine', '', 'Usage: sd-engine <command> [options] [--json] [--project-dir DIR] [--plugin-root DIR]', '', 'Commands:'];
  const keys = Object.keys(REGISTRY).sort();
  const width = Math.max(...keys.map((k) => k.length));
  for (const k of keys) lines.push(`  ${k.padEnd(width)}  ${REGISTRY[k].summary ?? ''}`);
  lines.push('', 'Run `sd-engine version` for the engine version.');
  return lines.join('\n');
}

// Run the engine. Returns the process exit code (does not call process.exit so it
// is testable in-process). `io` overrides stdout/stderr for tests.
export function run(argv, io = {}) {
  const out = io.stdout ?? process.stdout;
  const err = io.stderr ?? process.stderr;
  const opts = { json: false, quiet: false };

  // Top-level help / version short-circuits.
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '-h' || argv[0] === '--help') {
    out.write(usageText() + '\n');
    return EXIT.OK;
  }
  if (argv[0] === 'version' || argv[0] === '-v' || argv[0] === '--version') {
    const v = engineVersion();
    out.write(JSON.stringify({ ok: true, code: 0, version: v }) + '\n');
    return EXIT.OK;
  }

  const { key, rest } = splitCommand(argv);
  const entry = REGISTRY[key];

  // Parse with the command's options merged over the globals so --json works even
  // on an unknown command (we still report the error structurally).
  const optionSpec = { ...GLOBAL_OPTIONS, ...(entry?.options ?? {}) };
  let parsed;
  try {
    parsed = parseArgs({ args: rest, options: optionSpec, allowPositionals: true, strict: true });
  } catch (e) {
    opts.json = rest.includes('--json');
    return finishError(errUsage(`bad arguments: ${e.message}`), opts, out, err);
  }
  opts.json = parsed.values.json === true;
  opts.quiet = parsed.values.quiet === true;

  if (!entry) {
    const culprit = key || argv[0] || '';
    // Distinguish "no command at all" (only globals) from a genuinely unknown command.
    const msg =
      key === '' && culprit.startsWith('-')
        ? `no subcommand given (global flags like ${culprit} may appear in any position, but a command is required)`
        : `unknown command "${culprit}"`;
    return finishError(errUsage(msg, { command: culprit }), opts, out, err);
  }

  const root = resolve(parsed.values['project-dir'] || process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const pluginRoot = resolvePluginRoot({ pluginRoot: parsed.values['plugin-root'] });

  const ctx = {
    values: parsed.values,
    positionals: parsed.positionals,
    root,
    pluginRoot,
    opts,
    engineVersion: engineVersion(),
    preconditionExtras: io.preconditionExtras ?? {},
  };

  try {
    const result = entry.handler(ctx);
    if (result && result.hook !== undefined) {
      renderHook(result.hook, out);
      return EXIT.OK;
    }
    renderOk(result, opts, out);
    return result.code ?? EXIT.OK;
  } catch (e) {
    if (e instanceof EngineError) return finishError(e, opts, out, err);
    return finishError(new EngineError(EXIT.EINTERNAL, e && e.stack ? e.stack : String(e)), opts, out, err);
  }
}

function finishError(e, opts, out, err) {
  renderError(e, opts, err, out);
  return e.code ?? EXIT.EINTERNAL;
}
