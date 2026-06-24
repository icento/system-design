// retrieve.test.mjs — the deterministic core of differentiator #1. A synthetic
// corpus isolates the four behaviors (word-boundary, domain-gate, min_signal vs
// enforced bypass, precedence ordering); the real corpus is checked for validity
// and byte-idempotent index generation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import {
  countSignal,
  retrieve,
  loadCorpus,
  validateCorpus,
  lintCorpus,
  buildIndexDoc,
} from '../../bin/lib/retrieve.mjs';
import { validate } from '../../bin/lib/jsonschema.mjs';
import { loadSchema } from '../../bin/lib/schemas.mjs';
import { stringify, parse } from '../../bin/lib/frontmatter.mjs';
import { PLUGIN_ROOT, engine, initRepo, touch, cleanup } from '../helpers.mjs';

const SYN = {
  config: {
    sources_precedence: ['tiger-style', 'aposd'],
    domain_gates: { 'io-bound': { suppress: ['tiger-x'] } },
    min_signal: 2,
    max_questions_per_run: 7,
  },
  principles: [
    { id: 'tiger-x', source: 'tiger-style', severity: 'recommended', domain: ['general', 'systems'], triggers: ['alpha', 'beta'] },
    { id: 'aposd-y', source: 'aposd', severity: 'recommended', domain: ['general'], triggers: ['alpha', 'beta'] },
    { id: 'tiger-enf', source: 'tiger-style', severity: 'enforced', domain: ['general'], triggers: ['gamma'] },
    { id: 'aposd-rec1', source: 'aposd', severity: 'recommended', domain: ['general'], triggers: ['gamma'] },
  ],
};

test('countSignal matches whole words only (word boundary)', () => {
  assert.equal(countSignal('we cached the value', ['cache']).signal, 0);
  assert.equal(countSignal('the cache layer', ['cache']).signal, 1);
  assert.equal(countSignal('avoid shared state here', ['shared state']).signal, 1);
  assert.equal(countSignal('ALPHA Beta', ['alpha', 'beta']).signal, 2, 'case-insensitive');
});

test('domain-gate suppresses listed ids on the gated domain', () => {
  const general = retrieve({ specText: 'alpha beta', domain: 'general', corpus: SYN });
  assert.deepEqual(new Set(general.candidates.map((c) => c.id)), new Set(['tiger-x', 'aposd-y']));
  const io = retrieve({ specText: 'alpha beta', domain: 'io-bound', corpus: SYN });
  assert.deepEqual(io.candidates.map((c) => c.id), ['aposd-y']);
  assert.ok(io.dropped.some((d) => d.id === 'tiger-x' && /suppress/.test(d.reason)));
});

test('min_signal drops weak recommended records but enforced bypasses', () => {
  const r = retrieve({ specText: 'gamma', domain: 'general', corpus: SYN });
  assert.deepEqual(r.candidates.map((c) => c.id), ['tiger-enf']);
  assert.ok(r.dropped.some((d) => d.id === 'aposd-rec1' && /min_signal/.test(d.reason)));
});

test('precedence orders equal severity+signal by source (tiger before aposd)', () => {
  const r = retrieve({ specText: 'alpha beta', domain: 'general', corpus: SYN });
  assert.equal(r.candidates[0].id, 'tiger-x');
  assert.equal(r.candidates[1].id, 'aposd-y');
});

// ---- real corpus integration ----------------------------------------------

const realCorpus = () => loadCorpus(resolve(PLUGIN_ROOT, 'docs', 'principles'));

test('real corpus: 22 records, all valid, lint clean', () => {
  const corpus = realCorpus();
  assert.equal(corpus.principles.length, 22);
  const v = validateCorpus(corpus, validate, loadSchema('principle.frontmatter'));
  assert.ok(v.ok, JSON.stringify(v.problems));
  assert.ok(lintCorpus(corpus).ok);
});

test('principles index is byte-idempotent and schema-valid', () => {
  const corpus = realCorpus();
  const a = buildIndexDoc(corpus, stringify);
  const b = buildIndexDoc(corpus, stringify);
  assert.equal(a, b, 'two runs produce identical bytes');
  // The generated frontmatter validates against its schema.
  const data = parse(a).data;
  assert.ok(validate(loadSchema('principles-index.frontmatter'), data).valid);
  assert.equal(data.count, 22);
});

test('engine principles validate/index are wired and idempotent', () => {
  const root = initRepo(); // copies the corpus in
  try {
    assert.equal(engine(['principles', 'validate'], { root }).code, 0);
    const first = engine(['principles', 'index'], { root });
    assert.equal(first.code, 0);
    const second = engine(['principles', 'index'], { root });
    assert.equal(second.json.changed, false, 'second index run writes nothing');
  } finally {
    cleanup(root);
  }
});

test('engine principles retrieve scores a fixture SPEC', () => {
  const root = initRepo();
  try {
    const spec = touch(root, 'requests/req-0001/SPEC.md', 'We must assert invariants and bound every loop and queue with a retry.');
    const r = engine(['principles', 'retrieve', '--spec', spec, '--domain', 'general'], { root });
    assert.equal(r.code, 0);
    const ids = r.json.candidates.map((c) => c.id);
    assert.ok(ids.includes('tiger-assert-floor'));
    assert.ok(ids.includes('tiger-bound-everything'));
  } finally {
    cleanup(root);
  }
});
