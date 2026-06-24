// schemas.mjs — loads & caches bundled JSON schemas from `schemas/`, resolving the
// plugin root, and asserts each loaded schema uses only supported keywords (fail
// closed — risk R2). Shared by state I/O, validate-doc, principles validate, etc.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSupportedSchema } from './jsonschema.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)); // .../bin/lib
const DEFAULT_PLUGIN_ROOT = resolve(HERE, '..', '..'); // .../system-design

const cache = new Map();

export function resolvePluginRoot(opts = {}) {
  return opts.pluginRoot || process.env.CLAUDE_PLUGIN_ROOT || DEFAULT_PLUGIN_ROOT;
}

export function rawSchemaPath(name, opts = {}) {
  return resolve(resolvePluginRoot(opts), 'schemas', `${name}.schema.json`);
}

// Load schemas/<name>.schema.json, parse, assert-supported, and cache by abs path.
export function loadSchema(name, opts = {}) {
  const file = rawSchemaPath(name, opts);
  if (cache.has(file)) return cache.get(file);
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new Error(`schema not found: ${name} (${file})`);
  }
  const schema = JSON.parse(text);
  try {
    assertSupportedSchema(schema, `#(${name})`);
  } catch (e) {
    throw new Error(`schema "${name}" is not loadable: ${e.message}`);
  }
  cache.set(file, schema);
  return schema;
}

export function _clearCache() {
  cache.clear();
}
