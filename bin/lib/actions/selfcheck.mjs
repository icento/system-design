// actions/selfcheck.mjs — the single machine-checkable integrity gate for the plugin
// itself (run in CI). Asserts: every bundled schema parses and uses only supported
// keywords; the principle corpus is valid + lint-clean; the manifest is well-formed;
// and the CHANGELOG's top released version matches the manifest version.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ok, errState } from '../output.mjs';
import { assertSupportedSchema, validate } from '../jsonschema.mjs';
import { loadSchema } from '../schemas.mjs';
import { loadCorpus, validateCorpus, lintCorpus } from '../retrieve.mjs';

function handleSelfcheck(ctx) {
  const root = ctx.pluginRoot;
  const problems = [];

  // 1) every schema parses + only-supported-keywords.
  const schemaDir = resolve(root, 'schemas');
  let schemaCount = 0;
  if (existsSync(schemaDir)) {
    for (const f of readdirSync(schemaDir)) {
      if (!f.endsWith('.schema.json')) continue;
      schemaCount++;
      try {
        assertSupportedSchema(JSON.parse(readFileSync(resolve(schemaDir, f), 'utf8')), `#(${f})`);
      } catch (e) {
        problems.push(`schema ${f}: ${e.message}`);
      }
    }
  } else {
    problems.push('schemas/ directory missing');
  }

  // 2) principle corpus valid + lint-clean.
  const principlesDir = resolve(root, 'docs', 'principles');
  if (existsSync(principlesDir)) {
    const corpus = loadCorpus(principlesDir);
    const v = validateCorpus(corpus, validate, loadSchema('principle.frontmatter', { pluginRoot: root }));
    if (!v.ok) problems.push(...v.problems.map((p) => `corpus: ${p}`));
    const l = lintCorpus(corpus);
    if (!l.ok) problems.push(...l.problems.map((p) => `corpus lint: ${p}`));
  } else {
    problems.push('docs/principles/ missing');
  }

  // 3) manifest well-formed.
  const manifestPath = resolve(root, '.claude-plugin', 'plugin.json');
  let manifestVersion = null;
  if (!existsSync(manifestPath)) {
    problems.push('.claude-plugin/plugin.json missing');
  } else {
    try {
      const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (!m.name) problems.push('manifest missing name');
      if (!/^\d+\.\d+\.\d+$/.test(m.version ?? '')) problems.push(`manifest version "${m.version}" is not semver`);
      manifestVersion = m.version;
    } catch (e) {
      problems.push(`manifest parse error: ${e.message}`);
    }
  }

  // 4) CHANGELOG top released version == manifest version (tolerate [Unreleased]).
  const changelogPath = resolve(root, 'CHANGELOG.md');
  if (existsSync(changelogPath) && manifestVersion) {
    const m = /##\s*\[(\d+\.\d+\.\d+)\]/.exec(readFileSync(changelogPath, 'utf8'));
    if (!m) problems.push('CHANGELOG has no released version heading');
    else if (m[1] !== manifestVersion) problems.push(`CHANGELOG top ${m[1]} != manifest ${manifestVersion}`);
  }

  if (problems.length) throw errState(`selfcheck failed (${problems.length})`, { problems });
  return ok({ ok: true, schemas: schemaCount, version: manifestVersion }, `selfcheck OK: ${schemaCount} schemas, corpus valid, manifest ${manifestVersion}.`);
}

export const selfcheckCommands = {
  selfcheck: { summary: 'verify plugin integrity (schemas, corpus, manifest, CHANGELOG)', options: {}, handler: handleSelfcheck },
};
