// actions/principles.mjs — the principle-corpus subcommands (M2):
//   principles validate | index | lint | retrieve, and schema get.
// These operate on docs/principles in the project root, so they work both in a
// user repo (the init-copied corpus) and in the plugin repo itself (CI / selfcheck).

import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { ok, errGate, errNotRepo, errUsage } from '../output.mjs';
import { validate } from '../jsonschema.mjs';
import { loadSchema } from '../schemas.mjs';
import { stringify } from '../frontmatter.mjs';
import { docsPaths } from '../paths.mjs';
import { loadCorpus, validateCorpus, lintCorpus, buildIndexDoc, retrieve } from '../retrieve.mjs';

const DOMAINS = ['general', 'systems', 'concurrency', 'io-bound', 'web', 'data'];

function requireCorpus(root) {
  const dir = docsPaths(root).principlesDir;
  if (!existsSync(dir)) throw errNotRepo(`no principles corpus at ${dir} (run \`engine init\`)`);
  return loadCorpus(dir);
}

function handleValidate(ctx) {
  const corpus = requireCorpus(ctx.root);
  const schema = loadSchema('principle.frontmatter', { pluginRoot: ctx.pluginRoot });
  const res = validateCorpus(corpus, validate, schema);
  if (!res.ok) throw errGate(`principle corpus invalid (${res.problems.length} problem(s))`, { problems: res.problems });
  return ok({ valid: true, count: res.count }, `corpus valid: ${res.count} principle(s).`);
}

function handleLint(ctx) {
  const corpus = requireCorpus(ctx.root);
  const res = lintCorpus(corpus);
  if (!res.ok) throw errGate(`principle corpus lint failed (${res.problems.length})`, { problems: res.problems });
  return ok({ ok: true }, 'corpus lint clean.');
}

function handleIndex(ctx) {
  const corpus = requireCorpus(ctx.root);
  const text = buildIndexDoc(corpus, stringify);
  const out = docsPaths(ctx.root).principlesIndex;
  const existing = existsSync(out) ? readFileSync(out, 'utf8') : null;
  const changed = existing !== text;
  if (changed) writeFileSync(out, text);
  return ok(
    { path: out, count: corpus.principles.length, changed },
    `${changed ? 'wrote' : 'unchanged'} ${out} (${corpus.principles.length} principles).`,
  );
}

function handleRetrieve(ctx) {
  const corpus = requireCorpus(ctx.root);
  const specPath = ctx.values.spec;
  if (!specPath) throw errUsage('principles retrieve requires --spec <file>');
  if (!existsSync(specPath)) throw errUsage(`--spec not found: ${specPath}`);
  const domain = ctx.values.domain ? String(ctx.values.domain) : 'general';
  if (!DOMAINS.includes(domain)) throw errUsage(`--domain must be one of ${DOMAINS.join('|')}`);
  const specText = readFileSync(specPath, 'utf8');
  const result = retrieve({ specText, domain, corpus });
  const lines = [`retrieval for domain=${domain} (min_signal=${result.min_signal}):`];
  if (result.candidates.length) {
    lines.push('  candidates:');
    for (const c of result.candidates) {
      lines.push(`    ${c.id} [${c.severity}] signal=${c.signal} (${c.matched_triggers.join(', ')})`);
    }
  } else if (result.dropped.length) {
    // Triggers fired but every match fell below the floor / was gated. This is NOT the
    // same as "no decisions to make" — the SPEC is relevant, the threshold just filtered.
    lines.push(`  (no candidates above threshold; ${result.dropped.length} principle(s) triggered but were filtered — see "considered but dropped")`);
  } else {
    // Nothing in the corpus triggered at all: genuinely trivial for this domain.
    lines.push('  (no principles triggered on this SPEC — likely a genuinely trivial change at this domain)');
  }
  if (result.dropped.length) {
    lines.push('  considered but dropped:');
    for (const d of result.dropped) lines.push(`    ${d.id} signal=${d.signal} (${d.reason})`);
  }
  return ok(result, lines.join('\n'));
}

function handleSchemaGet(ctx) {
  const name = ctx.positionals[0];
  if (!name) throw errUsage('schema get requires a schema name, e.g. `schema get state`');
  let schema;
  try {
    schema = loadSchema(name, { pluginRoot: ctx.pluginRoot });
  } catch (e) {
    throw errUsage(e.message);
  }
  return ok({ name, schema }, JSON.stringify(schema, null, 2));
}

export const principlesCommands = {
  'principles validate': { summary: 'validate the principle corpus (frontmatter + numeric limits)', options: {}, handler: handleValidate },
  'principles lint': { summary: 'lint the corpus (dup ids, dangling config refs)', options: {}, handler: handleLint },
  'principles index': { summary: 'generate docs/PRINCIPLES.md (byte-idempotent)', options: {}, handler: handleIndex },
  'principles retrieve': {
    summary: 'deterministic principle retrieval for a SPEC + domain',
    options: { spec: { type: 'string' }, domain: { type: 'string' } },
    handler: handleRetrieve,
  },
  'schema get': { summary: 'print a bundled JSON schema', options: {}, handler: handleSchemaGet },
};
