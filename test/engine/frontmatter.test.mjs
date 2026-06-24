// frontmatter.test.mjs — the strict YAML-subset reader/serializer. Round-trip is
// the core guarantee: stringify(parse(x)) === x and parse(stringify(o)) deep-equals
// o, across scalars, flow collections, nested maps, and arrays of objects.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, stringify } from '../../bin/lib/frontmatter.mjs';

test('round-trips scalars, arrays, nested maps and arrays-of-objects', () => {
  const data = {
    id: 'adr-0001',
    kind: 'adr',
    title: 'Use a token bucket',
    status: 'proposed',
    count: 3,
    ratio: 0.15,
    enabled: true,
    note: null,
    governs: ['src/db/**', 'src/api/**'],
    principles: ['tiger-bottleneck'],
    constraints: { forbids: ['global mutable rate state'], requires: ['per-key buckets'] },
    requirements: [
      { id: 'REQ-0001-01', statement: 'limit requests', kind: 'functional' },
      { id: 'REQ-0001-02', statement: 'no shared state', kind: 'constraint' },
    ],
  };
  const body = '# Context\n\nWe need rate limiting.\n';
  const text = stringify({ data, body });

  const back = parse(text);
  assert.deepEqual(back.data, data, 'object survives a parse round-trip');
  assert.equal(back.body, body, 'body preserved verbatim');
  assert.equal(stringify(back), text, 'serialization is canonical/stable');
});

test('round-trips a plan-step shape (object with nested arrays)', () => {
  const data = {
    steps: [
      {
        id: 'STEP-001',
        intent: 'add bucket store',
        satisfies: ['REQ-0001-01'],
        files: ['src/a.js', 'src/b.js'],
        tests: ['test/a.test.mjs::limits'],
        status: 'todo',
      },
    ],
  };
  const text = stringify({ data, body: '' });
  const back = parse(text);
  assert.deepEqual(back.data, data);
  assert.equal(stringify(back), text);
});

test('scalar coercion: booleans, null, numbers, quoted strings', () => {
  const { data } = parse(['---', 'b: true', 'n: ~', 'i: 42', 'f: -1.5', 's: "true"', "q: 'a: b'", '---', ''].join('\n'));
  assert.equal(data.b, true);
  assert.equal(data.n, null);
  assert.equal(data.i, 42);
  assert.equal(data.f, -1.5);
  assert.equal(data.s, 'true', 'quoted true stays a string');
  assert.equal(data.q, 'a: b', 'single-quoted colon preserved');
});

test('flow collections parse', () => {
  const { data } = parse(['---', 'tags: [a, b, c]', 'meta: {k: 1, flag: true}', '---', ''].join('\n'));
  assert.deepEqual(data.tags, ['a', 'b', 'c']);
  assert.deepEqual(data.meta, { k: 1, flag: true });
});

test('block sequence at parent indent (forbids:\\n- x) parses', () => {
  const { data } = parse(['---', 'constraints:', '  forbids:', '  - global state', '  requires:', '  - per-key', '---', ''].join('\n'));
  assert.deepEqual(data.constraints, { forbids: ['global state'], requires: ['per-key'] });
});

test('no frontmatter fence -> empty data, verbatim body', () => {
  const r = parse('# just markdown\n');
  assert.deepEqual(r.data, {});
  assert.equal(r.body, '# just markdown\n');
});

test('quoting: strings needing quotes round-trip', () => {
  const data = { a: '', b: 'has: colon', c: '#hash', d: 'trailing ', e: 'multi\nline', f: '123', g: 'true' };
  const back = parse(stringify({ data, body: '' }));
  assert.deepEqual(back.data, data);
});

test('unterminated frontmatter throws', () => {
  assert.throws(() => parse('---\na: 1\n'), /unterminated/);
});
