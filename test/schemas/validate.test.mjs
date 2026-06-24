// validate.test.mjs — the hand-rolled JSON Schema subset validator and the state
// schema. Guards the zero-dep promise: any unsupported keyword throws at load.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, assertSupportedSchema } from '../../bin/lib/jsonschema.mjs';
import { loadSchema } from '../../bin/lib/schemas.mjs';
import { emptyState } from '../../bin/lib/state.mjs';

test('assertSupportedSchema throws on any unsupported keyword (fail closed)', () => {
  assert.throws(() => assertSupportedSchema({ type: 'object', if: {}, then: {} }), /unsupported/);
  assert.throws(() => assertSupportedSchema({ $dynamicRef: '#x' }), /unsupported/);
  assert.throws(() => assertSupportedSchema({ properties: { a: { contains: {} } } }), /unsupported/);
  // The real bundled schemas must all load.
  assert.doesNotThrow(() => assertSupportedSchema(loadSchema('state')));
});

test('state schema accepts a valid empty state', () => {
  const { valid, errors } = validate(loadSchema('state'), emptyState());
  assert.ok(valid, JSON.stringify(errors));
});

test('state schema reports the exact failing pointer', () => {
  const schema = loadSchema('state');
  const bad = { ...emptyState(), version: 2 };
  const r1 = validate(schema, bad);
  assert.ok(!r1.valid);
  assert.ok(r1.errors.some((e) => e.pointer === '/version'));

  const s2 = emptyState();
  s2.requests['req-0001'] = { ...fullReq(), status: 'NOPE' };
  const r2 = validate(schema, s2);
  assert.ok(!r2.valid);
  assert.ok(r2.errors.some((e) => e.pointer === '/requests/req-0001/status'));

  const s3 = emptyState();
  s3.requests['req-0001'] = { ...fullReq(), surprise: true };
  const r3 = validate(schema, s3);
  assert.ok(!r3.valid);
  assert.ok(r3.errors.some((e) => e.pointer === '/requests/req-0001/surprise'));
});

test('validator core: type, required, additionalProperties pointer, pattern, enum, format', () => {
  const s = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'when'],
    properties: {
      id: { type: 'string', pattern: '^req-\\d{4}$' },
      when: { type: 'string', format: 'date-time' },
      kind: { enum: ['a', 'b'] },
      n: { type: 'integer', minimum: 0 },
    },
  };
  assert.ok(validate(s, { id: 'req-0001', when: '2026-01-01T00:00:00.000Z' }).valid);
  assert.ok(!validate(s, { id: 'nope', when: '2026-01-01T00:00:00.000Z' }).valid);
  assert.ok(!validate(s, { id: 'req-0001', when: 'not-a-date' }).valid);
  const extra = validate(s, { id: 'req-0001', when: '2026-01-01T00:00:00.000Z', x: 1 });
  assert.ok(!extra.valid);
  assert.equal(extra.errors[0].pointer, '/x');
  assert.ok(!validate(s, { id: 'req-0001', when: '2026-01-01T00:00:00.000Z', kind: 'z' }).valid);
  assert.ok(!validate(s, { id: 'req-0001', when: '2026-01-01T00:00:00.000Z', n: -1 }).valid);
});

test('validator: anyOf, items, minItems, $ref', () => {
  const s = {
    $defs: { tag: { type: 'string', minLength: 1 } },
    type: 'object',
    properties: {
      v: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      tags: { type: 'array', minItems: 1, items: { $ref: '#/$defs/tag' } },
    },
  };
  assert.ok(validate(s, { v: null, tags: ['x'] }).valid);
  assert.ok(validate(s, { v: 'hi', tags: ['x', 'y'] }).valid);
  assert.ok(!validate(s, { v: 3, tags: ['x'] }).valid);
  assert.ok(!validate(s, { v: 'hi', tags: [] }).valid);
  assert.ok(!validate(s, { v: 'hi', tags: [''] }).valid);
});

function fullReq() {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'req-0001',
    slug: 's',
    title: 't',
    tier: null,
    status: 'INTAKE',
    openQuestions: 0,
    blockedReason: null,
    awaiting: null,
    createdAt: now,
    updatedAt: now,
    adrs: [],
    overrides: [],
    config: { enforcement: 'warn', tigerLintBlocking: false },
    runtime: { firstDenialSeen: false },
    history: [{ from: null, to: 'INTAKE', at: now, by: 'engine', gate: null, override: null, note: null }],
  };
}
