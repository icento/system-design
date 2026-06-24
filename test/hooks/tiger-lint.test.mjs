// tiger-lint.test.mjs — the TIGER_STYLE numeric-limit analyzers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../bin/lib/tigerlint.mjs';

const rules = (code, path = 'x.mjs') => new Set(analyze(code, { path }).map((f) => f.rule));

test('size: flags a long function and a long line, ignores short ones', () => {
  const longFn = `function big() {\n${Array.from({ length: 95 }, (_, i) => `  const v${i} = ${i};`).join('\n')}\n}\n`;
  assert.ok(rules(longFn).has('size'));
  const shortFn = 'function ok() {\n  const a = 1;\n  return a;\n}\n';
  assert.ok(!analyze(shortFn, { path: 'x.mjs' }).some((f) => f.rule === 'size' && /function/.test(f.message)));
  assert.ok(rules('const x = "' + 'a'.repeat(120) + '";\n').has('size'));
});

test('unbounded-loop: flags while(true)/for(;;) with no break, allows bounded', () => {
  assert.ok(rules('function f(){\n  while (true) {\n    doThing();\n  }\n}\n').has('unbounded-loop'));
  assert.ok(rules('function f(){\n  for (;;) {\n    work();\n  }\n}\n').has('unbounded-loop'));
  assert.ok(!rules('function f(){\n  while (true) {\n    if (done) break;\n  }\n}\n').has('unbounded-loop'));
});

test('assert-density: flags low average, allows >= floor', () => {
  const noAsserts = 'function a(){ return 1; }\nfunction b(){ return 2; }\n';
  assert.ok(rules(noAsserts).has('assert-density'));
  const dense = 'function a(){ assert(x); assert(y); }\nfunction b(){ assert(z); assert(w); }\n';
  assert.ok(!rules(dense).has('assert-density'));
});

test('non-code files are not analyzed', () => {
  assert.equal(analyze('# a very '.repeat(40), { path: 'README.md' }).length, 0);
  assert.equal(analyze('{"x":1}', { path: 'data.json' }).length, 0);
});
