// retrieve.mjs — the DETERMINISTIC half of principle retrieval (differentiator #1).
// Given a SPEC text + a domain, it scores the principle corpus by trigger signal,
// applies domain gating and the min-signal floor (with an enforced-severity bypass),
// and returns an ordered candidate set. All judgment (entity extraction, question
// phrasing, ADR staging) is the principle-architect subagent's job, not this file's.
//
// Pure functions operate on an already-loaded corpus so they unit-test without fs;
// the fs loaders are thin.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from './frontmatter.mjs';
import { docsPaths } from './paths.mjs';

const SEVERITY_RANK = { enforced: 0, recommended: 1, advisory: 2 };
const SOURCE_DIRS = ['aposd', 'tiger-style', 'house'];
const ID_PREFIX_FOR_SOURCE = { aposd: 'aposd', 'tiger-style': 'tiger', house: 'house' };

export const DEFAULT_CONFIG = Object.freeze({
  sources_precedence: ['tiger-style', 'aposd'],
  domain_gates: {},
  min_signal: 2,
  max_questions_per_run: 7,
});

// ---- loading --------------------------------------------------------------

export function loadConfig(principlesDir) {
  const p = resolve(principlesDir, 'principles.config.json');
  if (!existsSync(p)) return { ...DEFAULT_CONFIG };
  return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(p, 'utf8')) };
}

export function readPrinciples(principlesDir) {
  const out = [];
  for (const source of SOURCE_DIRS) {
    const sdir = resolve(principlesDir, source);
    if (!existsSync(sdir)) continue;
    for (const f of readdirSync(sdir).sort()) {
      if (!f.endsWith('.md')) continue;
      const file = resolve(sdir, f);
      const { data } = parse(readFileSync(file, 'utf8'));
      out.push({ ...data, _sourceDir: source, _file: file });
    }
  }
  return out;
}

export function loadCorpus(principlesDir) {
  return { config: loadConfig(principlesDir), principles: readPrinciples(principlesDir), dir: principlesDir };
}

export function loadCorpusForRoot(root) {
  return loadCorpus(docsPaths(root).principlesDir);
}

// ---- scoring --------------------------------------------------------------

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Signal = number of distinct triggers that occur as whole words (case-insensitive)
// in the text. Word-boundary matching avoids 'cache' matching 'cached'.
export function countSignal(text, triggers) {
  const matched = [];
  for (const t of triggers ?? []) {
    if (new RegExp(`\\b${escapeRe(t)}\\b`, 'i').test(text)) matched.push(t);
  }
  return { signal: matched.length, matched };
}

function precedenceCompare(precedence) {
  const rank = (s) => {
    const i = precedence.indexOf(s);
    return i < 0 ? 99 : i;
  };
  // Ordering: most-actionable first. severity (enforced->advisory), then signal
  // desc, then source precedence (the precedence tiebreaker), then id for stability.
  return (a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    b.signal - a.signal ||
    rank(a.source) - rank(b.source) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// The deterministic retrieval. Returns { domain, min_signal, candidates[], dropped[] }.
export function retrieve({ specText, domain = 'general', corpus }) {
  const { config, principles } = corpus;
  const minSignal = config.min_signal ?? 2;
  const suppress = new Set(config.domain_gates?.[domain]?.suppress ?? []);
  const precedence = config.sources_precedence ?? [];

  const candidates = [];
  const dropped = [];

  for (const p of principles) {
    const { signal, matched } = countSignal(specText, p.triggers);
    if (signal === 0) continue; // untriggered — not even a drop, just irrelevant

    const domains = p.domain ?? [];
    if (!domains.includes('general') && !domains.includes(domain)) {
      dropped.push({ id: p.id, signal, reason: `domain ${domain} not in [${domains.join(',')}]` });
      continue;
    }
    if (suppress.has(p.id)) {
      dropped.push({ id: p.id, signal, reason: `suppressed on domain ${domain}` });
      continue;
    }
    const enforced = p.severity === 'enforced';
    if (signal < minSignal && !enforced) {
      dropped.push({ id: p.id, signal, reason: `signal ${signal} < min_signal ${minSignal}` });
      continue;
    }
    candidates.push({
      id: p.id,
      source: p.source,
      severity: p.severity,
      domain: domains,
      signal,
      matched_triggers: matched,
      recommended_default: p.recommended_default,
      decision_question_template: p.decision_question_template,
      limits: p.limits ?? null,
    });
  }

  candidates.sort(precedenceCompare(precedence));
  return { domain, min_signal: minSignal, candidates, dropped };
}

// ---- corpus validity (engine principles validate) -------------------------

const REQUIRED_LIMITS = {
  'tiger-assert-floor': (l) => l && l.assertions_per_function_avg_min >= 2,
  'tiger-limits-size': (l) => l && l.line_columns_max === 100 && l.function_lines_max === 70,
  'aposd-strategic': (l) => l && l.investment_pct_min === 10 && l.investment_pct_max === 20,
};

export function validateCorpus(corpus, validateFn, principleSchema) {
  const problems = [];
  for (const p of corpus.principles) {
    const { _sourceDir, _file, ...data } = p;
    const { valid, errors } = validateFn(principleSchema, data);
    if (!valid) problems.push(`${p.id}: ${errors.map((e) => `${e.pointer} ${e.message}`).join('; ')}`);
    if (ID_PREFIX_FOR_SOURCE[_sourceDir] && !p.id.startsWith(ID_PREFIX_FOR_SOURCE[_sourceDir] + '-')) {
      problems.push(`${p.id}: id prefix does not match source dir ${_sourceDir}`);
    }
    if (data.source !== _sourceDir) problems.push(`${p.id}: source "${data.source}" != dir "${_sourceDir}"`);
    if (REQUIRED_LIMITS[p.id] && !REQUIRED_LIMITS[p.id](p.limits)) {
      problems.push(`${p.id}: required machine-readable limits missing or wrong`);
    }
  }
  return { ok: problems.length === 0, problems, count: corpus.principles.length };
}

// ---- corpus lint (engine principles lint) ---------------------------------

export function lintCorpus(corpus) {
  const problems = [];
  const seen = new Map();
  for (const p of corpus.principles) {
    if (seen.has(p.id)) problems.push(`duplicate id ${p.id} (${seen.get(p.id)} and ${p._file})`);
    else seen.set(p.id, p._file);
  }
  const ids = new Set(corpus.principles.map((p) => p.id));
  const gates = corpus.config.domain_gates ?? {};
  for (const [domain, g] of Object.entries(gates)) {
    for (const sup of g.suppress ?? []) {
      if (!ids.has(sup)) problems.push(`domain_gates.${domain}.suppress references unknown principle ${sup}`);
    }
  }
  const sourcesPresent = new Set(corpus.principles.map((p) => p.source));
  for (const s of corpus.config.sources_precedence ?? []) {
    if (!sourcesPresent.has(s) && s !== 'house') problems.push(`sources_precedence lists "${s}" but no records use it`);
  }
  return { ok: problems.length === 0, problems };
}

// ---- generated index (engine principles index) ----------------------------

// Build the byte-idempotent PRINCIPLES.md text. No timestamps: same corpus -> same
// bytes. Sorted by source precedence then id.
export function buildIndexDoc(corpus, stringifyFn) {
  const precedence = corpus.config.sources_precedence ?? [];
  const rank = (s) => {
    const i = precedence.indexOf(s);
    return i < 0 ? 99 : i;
  };
  const sorted = corpus.principles.slice().sort((a, b) => rank(a.source) - rank(b.source) || (a.id < b.id ? -1 : 1));
  const sources = {};
  for (const p of corpus.principles) sources[p.source] = (sources[p.source] ?? 0) + 1;

  const data = {
    kind: 'principles-index',
    generated: true,
    count: corpus.principles.length,
    sources: Object.fromEntries(Object.keys(sources).sort().map((k) => [k, sources[k]])),
    precedence,
    doNotEdit: true,
  };

  const rows = sorted.map((p) => `| \`${p.id}\` | ${p.source} | ${p.severity} | ${(p.domain ?? []).join(', ')} | ${p.title} |`);
  const body = [
    '# Principles index',
    '',
    '> GENERATED by `engine principles index`. Do not edit by hand.',
    '',
    `Source precedence: ${precedence.join(' > ')}.`,
    '',
    '| id | source | severity | domain | title |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');

  return stringifyFn({ data, body });
}
