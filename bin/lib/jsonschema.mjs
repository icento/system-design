// jsonschema.mjs — a zero-dependency validator for a *subset* of JSON Schema
// draft-2020-12. Deliberately small: it only implements the keywords our schemas
// use, and it FAILS CLOSED — any unsupported keyword throws at load time
// (assertSupportedSchema), so the validator and the schemas can never silently
// drift (risk R2). `validate()` returns { valid, errors:[{pointer, message}] }
// where pointer is a JSON Pointer into the *instance*.

// Assertion keywords this validator actually enforces.
const SUPPORTED = new Set([
  'type',
  'enum',
  'const',
  'properties',
  'required',
  'additionalProperties',
  'patternProperties',
  'items',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minLength',
  'maxLength',
  'pattern',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'format',
  'anyOf',
  'oneOf',
  'allOf',
  'not',
  '$ref',
]);

// Annotation / metadata keywords: allowed but not enforced.
const IGNORED = new Set([
  '$schema',
  '$id',
  '$comment',
  '$defs',
  'definitions',
  'title',
  'description',
  'examples',
  'default',
  'deprecated',
  'readOnly',
  'writeOnly',
]);

// Formats we assert. Unknown formats are treated as pure annotations (no-op),
// which is spec-compliant; we simply never author schemas that rely on those.
const FORMAT_CHECKS = {
  date: (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)),
  'date-time': (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s),
  email: (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s),
  uri: (s) => /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(s),
};

// Walk a schema object and throw if it uses any keyword we do not implement.
// This is the fail-closed guard: a schema authored with `if`/`then`, `$dynamicRef`,
// etc. will refuse to load rather than validate too loosely.
export function assertSupportedSchema(schema, path = '#') {
  if (schema === true || schema === false) return;
  if (schema === null || typeof schema !== 'object') {
    throw new Error(`schema at ${path} must be an object or boolean`);
  }
  if (Array.isArray(schema)) {
    throw new Error(`schema at ${path} must not be an array`);
  }
  for (const key of Object.keys(schema)) {
    if (IGNORED.has(key)) {
      if (key === '$defs' || key === 'definitions') {
        for (const [name, sub] of Object.entries(schema[key])) {
          assertSupportedSchema(sub, `${path}/${key}/${name}`);
        }
      }
      continue;
    }
    if (!SUPPORTED.has(key)) {
      throw new Error(`unsupported JSON Schema keyword "${key}" at ${path}`);
    }
  }
  // Recurse into subschemas.
  if (schema.properties) {
    for (const [name, sub] of Object.entries(schema.properties)) {
      assertSupportedSchema(sub, `${path}/properties/${name}`);
    }
  }
  if (schema.patternProperties) {
    for (const [name, sub] of Object.entries(schema.patternProperties)) {
      assertSupportedSchema(sub, `${path}/patternProperties/${name}`);
    }
  }
  if (schema.items) assertSupportedSchema(schema.items, `${path}/items`);
  if (typeof schema.additionalProperties === 'object') {
    assertSupportedSchema(schema.additionalProperties, `${path}/additionalProperties`);
  }
  for (const k of ['anyOf', 'oneOf', 'allOf']) {
    if (schema[k]) {
      if (!Array.isArray(schema[k])) throw new Error(`${k} at ${path} must be an array`);
      schema[k].forEach((sub, i) => assertSupportedSchema(sub, `${path}/${k}/${i}`));
    }
  }
  if (schema.not) assertSupportedSchema(schema.not, `${path}/not`);
}

const typeOf = (v) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v; // 'string' | 'number' | 'boolean' | 'object'
};

const matchesType = (v, t) => {
  const actual = typeOf(v);
  if (t === 'number') return actual === 'number' || actual === 'integer';
  if (t === 'integer') return actual === 'integer';
  return actual === t;
};

function resolveRef(ref, root) {
  if (ref === '#') return root;
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref "${ref}" (only local pointers)`);
  const parts = ref
    .slice(2)
    .split('/')
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let node = root;
  for (const p of parts) {
    if (node == null || typeof node !== 'object') throw new Error(`$ref "${ref}" not found`);
    node = node[p];
  }
  if (node === undefined) throw new Error(`$ref "${ref}" not found`);
  return node;
}

const deepEqual = (a, b) => {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
};

// Core recursive validator. Pushes { pointer, message } onto `errors`.
function check(schema, data, ptr, root, errors) {
  if (schema === true) return;
  if (schema === false) {
    errors.push({ pointer: ptr, message: 'schema is false (no value allowed)' });
    return;
  }
  if (schema.$ref) {
    check(resolveRef(schema.$ref, root), data, ptr, root, errors);
    // $ref siblings are ignored in our subset (2020-12 allows them, we keep it simple).
    return;
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(data, t))) {
      errors.push({ pointer: ptr, message: `expected type ${types.join('|')}, got ${typeOf(data)}` });
      return; // further keyword checks are meaningless on a type mismatch
    }
  }

  if (schema.const !== undefined && !deepEqual(data, schema.const)) {
    errors.push({ pointer: ptr, message: `must equal ${JSON.stringify(schema.const)}` });
  }
  if (schema.enum !== undefined && !schema.enum.some((e) => deepEqual(data, e))) {
    errors.push({ pointer: ptr, message: `must be one of ${JSON.stringify(schema.enum)}` });
  }

  const t = typeOf(data);

  if (t === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push({ pointer: ptr, message: `shorter than minLength ${schema.minLength}` });
    }
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push({ pointer: ptr, message: `longer than maxLength ${schema.maxLength}` });
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(data)) {
      errors.push({ pointer: ptr, message: `does not match pattern ${schema.pattern}` });
    }
    if (schema.format && FORMAT_CHECKS[schema.format] && !FORMAT_CHECKS[schema.format](data)) {
      errors.push({ pointer: ptr, message: `invalid ${schema.format} format` });
    }
  }

  if (t === 'number' || t === 'integer') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push({ pointer: ptr, message: `less than minimum ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push({ pointer: ptr, message: `greater than maximum ${schema.maximum}` });
    }
    if (schema.exclusiveMinimum !== undefined && data <= schema.exclusiveMinimum) {
      errors.push({ pointer: ptr, message: `not > exclusiveMinimum ${schema.exclusiveMinimum}` });
    }
    if (schema.exclusiveMaximum !== undefined && data >= schema.exclusiveMaximum) {
      errors.push({ pointer: ptr, message: `not < exclusiveMaximum ${schema.exclusiveMaximum}` });
    }
    if (schema.multipleOf !== undefined && !Number.isInteger(data / schema.multipleOf)) {
      errors.push({ pointer: ptr, message: `not a multiple of ${schema.multipleOf}` });
    }
  }

  if (t === 'array') {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push({ pointer: ptr, message: `fewer than minItems ${schema.minItems}` });
    }
    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      errors.push({ pointer: ptr, message: `more than maxItems ${schema.maxItems}` });
    }
    if (schema.uniqueItems && !uniqueOk(data)) {
      errors.push({ pointer: ptr, message: 'items must be unique' });
    }
    if (schema.items) {
      data.forEach((item, i) => check(schema.items, item, `${ptr}/${i}`, root, errors));
    }
  }

  if (t === 'object') {
    const keys = Object.keys(data);
    if (schema.required) {
      for (const r of schema.required) {
        if (!Object.prototype.hasOwnProperty.call(data, r)) {
          errors.push({ pointer: ptr, message: `missing required property "${r}"` });
        }
      }
    }
    if (schema.properties) {
      for (const [name, sub] of Object.entries(schema.properties)) {
        if (Object.prototype.hasOwnProperty.call(data, name)) {
          check(sub, data[name], `${ptr}/${name}`, root, errors);
        }
      }
    }
    if (schema.patternProperties) {
      for (const [pat, sub] of Object.entries(schema.patternProperties)) {
        const re = new RegExp(pat);
        for (const k of keys) {
          if (re.test(k)) check(sub, data[k], `${ptr}/${k}`, root, errors);
        }
      }
    }
    if (schema.additionalProperties !== undefined && schema.additionalProperties !== true) {
      const declared = new Set(Object.keys(schema.properties ?? {}));
      const patterns = Object.keys(schema.patternProperties ?? {}).map((p) => new RegExp(p));
      for (const k of keys) {
        if (declared.has(k)) continue;
        if (patterns.some((re) => re.test(k))) continue;
        if (schema.additionalProperties === false) {
          errors.push({ pointer: `${ptr}/${k}`, message: 'additional property not allowed' });
        } else {
          check(schema.additionalProperties, data[k], `${ptr}/${k}`, root, errors);
        }
      }
    }
  }

  if (schema.allOf) schema.allOf.forEach((s) => check(s, data, ptr, root, errors));
  if (schema.anyOf && !schema.anyOf.some((s) => isValid(s, data, root))) {
    errors.push({ pointer: ptr, message: 'does not match any of anyOf' });
  }
  if (schema.oneOf) {
    const n = schema.oneOf.filter((s) => isValid(s, data, root)).length;
    if (n !== 1) errors.push({ pointer: ptr, message: `must match exactly one of oneOf (matched ${n})` });
  }
  if (schema.not && isValid(schema.not, data, root)) {
    errors.push({ pointer: ptr, message: 'must not match the "not" schema' });
  }
}

function uniqueOk(arr) {
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (deepEqual(arr[i], arr[j])) return false;
    }
  }
  return true;
}

function isValid(schema, data, root) {
  const errs = [];
  check(schema, data, '', root, errs);
  return errs.length === 0;
}

// Public API. Validates `data` against `schema` (which is also its own $ref root).
export function validate(schema, data) {
  const errors = [];
  check(schema, data, '', schema, errors);
  return { valid: errors.length === 0, errors };
}
