// frontmatter.mjs — a deterministic reader/serializer for a strict YAML *subset*
// used in artifact frontmatter. It is intentionally narrow so that `parse` and
// `stringify` are exact inverses on canonical input (round-trip tested) and so a
// model-authored block can never be mis-read into a wrong gate decision (risk R3).
//
// Supported subset (everything else throws):
//   * `---` fenced frontmatter, then a verbatim markdown body.
//   * Block mappings (`key: value`) nested by 2-space indentation.
//   * Block sequences (`- item`), at the parent key's indent or deeper.
//   * Sequence items that are scalars OR single block maps (`- key: value`).
//   * Nested objects (e.g. `constraints: { forbids[], requires[] }`) and arrays of
//     objects (e.g. `requirements[]`, `steps[]`) — bounded depth, no recursion limit
//     needed because the schemas cap nesting.
//   * Flow scalars: `[a, b]`, `{k: v}` of scalars only.
//   * Scalar coercion: true/false -> boolean, null/~ -> null, numbers -> number,
//     single/double quoted -> string (always), otherwise plain string.
//   * Full-line `#` comments and blank lines.
//
// NOT supported (parser throws / serializer never emits): YAML anchors/aliases,
// multi-document streams, block scalars (`|`, `>`), complex keys, tags, trailing
// inline comments. Keep frontmatter inside the subset.

const RESERVED = /^(true|false|null|~|yes|no|on|off)$/i;
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---- scalar parsing -------------------------------------------------------

function parseScalar(raw) {
  const s = raw.trim();
  if (s === '') return null;
  if (s === '~' || s === 'null' || s === 'Null' || s === 'NULL') return null;
  if (s === '[]') return [];
  if (s === '{}') return {};
  if (s[0] === '"') return parseDoubleQuoted(s);
  if (s[0] === "'") return parseSingleQuoted(s);
  if (s[0] === '[') return parseFlowSeq(s);
  if (s[0] === '{') return parseFlowMap(s);
  if (s === 'true' || s === 'True' || s === 'TRUE') return true;
  if (s === 'false' || s === 'False' || s === 'FALSE') return false;
  if (NUMBER.test(s)) return Number(s);
  return s; // plain string
}

function parseDoubleQuoted(s) {
  if (s[s.length - 1] !== '"') throw new Error(`unterminated double-quoted scalar: ${s}`);
  let out = '';
  for (let i = 1; i < s.length - 1; i++) {
    const c = s[i];
    if (c === '\\') {
      const n = s[++i];
      out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n;
    } else {
      out += c;
    }
  }
  return out;
}

function parseSingleQuoted(s) {
  if (s[s.length - 1] !== "'") throw new Error(`unterminated single-quoted scalar: ${s}`);
  return s.slice(1, -1).replace(/''/g, "'");
}

// Split a flow body on top-level commas, respecting nested [] {} and quotes.
function splitFlow(body) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) {
      cur += c;
      if (c === quote && quote === '"' && body[i - 1] === '\\') continue;
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === '[' || c === '{') {
      depth++;
      cur += c;
    } else if (c === ']' || c === '}') {
      depth--;
      cur += c;
    } else if (c === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.trim() !== '' || parts.length > 0) parts.push(cur);
  return parts;
}

function parseFlowSeq(s) {
  const inner = s.slice(1, -1).trim();
  if (inner === '') return [];
  return splitFlow(inner).map((p) => parseScalar(p));
}

function parseFlowMap(s) {
  const inner = s.slice(1, -1).trim();
  if (inner === '') return {};
  const out = {};
  for (const part of splitFlow(inner)) {
    const idx = findKeyColon(part);
    if (idx === -1) throw new Error(`invalid flow mapping entry: ${part}`);
    out[parseScalar(part.slice(0, idx)).toString()] = parseScalar(part.slice(idx + 1));
  }
  return out;
}

// Find the `: ` (or trailing `:`) that separates a mapping key from its value,
// skipping any colon inside quotes or flow collections.
function findKeyColon(line) {
  let quote = null;
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
    else if (c === ':' && depth === 0 && (i === line.length - 1 || line[i + 1] === ' ')) return i;
  }
  return -1;
}

// ---- block parsing --------------------------------------------------------

// Tokenize into significant lines (drop blanks & full-line comments).
function tokenize(text) {
  const out = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const trimmedStart = line.replace(/^\s*/, '');
    if (trimmedStart === '' || trimmedStart[0] === '#') continue;
    const indent = line.length - trimmedStart.length;
    out.push({ indent, content: trimmedStart, raw: line });
  }
  return out;
}

function parseBlock(lines, start, indent) {
  if (start >= lines.length) return [null, start];
  if (lines[start].content[0] === '-' && (lines[start].content[1] === ' ' || lines[start].content === '-')) {
    return parseSequence(lines, start, indent);
  }
  return parseMapping(lines, start, indent);
}

function parseSequence(lines, start, indent) {
  const items = [];
  let i = start;
  while (i < lines.length && lines[i].indent === indent && isSeqMarker(lines[i].content)) {
    const content = lines[i].content;
    if (content === '-') {
      // Nested block belongs to this item.
      const childIndent = i + 1 < lines.length ? lines[i + 1].indent : indent + 2;
      if (i + 1 < lines.length && childIndent > indent) {
        const [val, next] = parseBlock(lines, i + 1, childIndent);
        items.push(val);
        i = next;
      } else {
        items.push(null);
        i++;
      }
    } else {
      const rest = content.slice(2); // after "- "
      if (findKeyColon(rest) !== -1) {
        // Inline map start: the item is a mapping whose first key sits at column
        // indent+2. Rewrite this line to that column and parse it as a mapping.
        const childIndent = indent + 2;
        const synthetic = lines.slice();
        synthetic[i] = { indent: childIndent, content: rest, raw: ' '.repeat(childIndent) + rest };
        const [val, next] = parseMapping(synthetic, i, childIndent);
        items.push(val);
        i = next;
      } else {
        items.push(parseScalar(rest));
        i++;
      }
    }
  }
  return [items, i];
}

const isSeqMarker = (c) => c === '-' || (c[0] === '-' && c[1] === ' ');

function parseMapping(lines, start, indent) {
  const map = {};
  let i = start;
  while (i < lines.length && lines[i].indent === indent && !isSeqMarker(lines[i].content)) {
    const line = lines[i].content;
    const colon = findKeyColon(line);
    if (colon === -1) throw new Error(`expected "key:" mapping entry, got: ${line}`);
    const key = unquoteKey(line.slice(0, colon).trim());
    const rest = line.slice(colon + 1).trim();
    if (rest !== '') {
      map[key] = parseScalar(rest);
      i++;
      continue;
    }
    // Empty value -> nested block (sequence at >= this indent, or map at > this indent).
    let j = i + 1;
    if (j < lines.length) {
      const nxt = lines[j];
      if (isSeqMarker(nxt.content) && nxt.indent >= indent) {
        const [val, next] = parseSequence(lines, j, nxt.indent);
        map[key] = val;
        i = next;
        continue;
      }
      if (!isSeqMarker(nxt.content) && nxt.indent > indent) {
        const [val, next] = parseMapping(lines, j, nxt.indent);
        map[key] = val;
        i = next;
        continue;
      }
    }
    map[key] = null;
    i++;
  }
  return [map, i];
}

function unquoteKey(k) {
  if ((k[0] === '"' && k.endsWith('"')) || (k[0] === "'" && k.endsWith("'"))) {
    return parseScalar(k);
  }
  return k;
}

function parseYaml(text) {
  const lines = tokenize(text);
  if (lines.length === 0) return {};
  const [val] = parseBlock(lines, 0, lines[0].indent);
  return val ?? {};
}

// ---- public parse ---------------------------------------------------------

// Split `---` fenced frontmatter from the markdown body. Returns { data, body }.
// No fence -> { data:{}, body:<verbatim text> }.
export function parse(text) {
  const norm = text.replace(/\r\n/g, '\n');
  if (!norm.startsWith('---\n') && norm !== '---\n') {
    return { data: {}, body: text };
  }
  const lines = norm.split('\n');
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      close = i;
      break;
    }
  }
  if (close === -1) throw new Error('unterminated frontmatter (missing closing ---)');
  const yaml = lines.slice(1, close).join('\n');
  const body = lines.slice(close + 1).join('\n');
  return { data: parseYaml(yaml), body };
}

// ---- serialization --------------------------------------------------------

function needsQuote(s) {
  if (s === '') return true;
  if (/^\s|\s$/.test(s)) return true;
  if (/[\n\t]/.test(s)) return true;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s)) return true;
  if (/: |\s#/.test(s)) return true;
  if (s.endsWith(':')) return true;
  if (RESERVED.test(s)) return true;
  if (NUMBER.test(s)) return true;
  return false;
}

function dumpScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`cannot serialize non-finite number ${v}`);
    return String(v);
  }
  const s = String(v);
  if (!needsQuote(s)) return s;
  const esc = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  return `"${esc}"`;
}

function dumpMapping(obj, indent) {
  const pad = '  '.repeat(indent);
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const keyStr = needsQuote(k) ? dumpScalar(k) : k;
    if (Array.isArray(v)) {
      if (v.length === 0) out.push(`${pad}${keyStr}: []`);
      else {
        out.push(`${pad}${keyStr}:`);
        out.push(dumpSequence(v, indent + 1));
      }
    } else if (isPlainObject(v)) {
      if (Object.keys(v).length === 0) out.push(`${pad}${keyStr}: {}`);
      else {
        out.push(`${pad}${keyStr}:`);
        out.push(dumpMapping(v, indent + 1));
      }
    } else {
      out.push(`${pad}${keyStr}: ${dumpScalar(v)}`);
    }
  }
  return out.join('\n');
}

function dumpSequence(arr, indent) {
  const pad = '  '.repeat(indent);
  const out = [];
  for (const v of arr) {
    if (isPlainObject(v)) {
      if (Object.keys(v).length === 0) {
        out.push(`${pad}- {}`);
        continue;
      }
      const sub = dumpMapping(v, indent + 1).split('\n');
      const firstStripped = sub[0].slice((indent + 1) * 2);
      out.push(`${pad}- ${firstStripped}`);
      for (let i = 1; i < sub.length; i++) out.push(sub[i]);
    } else if (Array.isArray(v)) {
      out.push(`${pad}- ${v.length === 0 ? '[]' : ''}`.trimEnd());
      if (v.length > 0) out.push(dumpSequence(v, indent + 1));
    } else {
      out.push(`${pad}- ${dumpScalar(v)}`);
    }
  }
  return out.join('\n');
}

// Serialize { data, body } back to a frontmatter document. Inverse of parse on
// canonical input. Always LF; body emitted verbatim after the closing fence.
export function stringify({ data = {}, body = '' }) {
  const yaml = dumpMapping(data, 0);
  return `---\n${yaml}\n---\n${body}`;
}

// Convenience: read a file's data only (throws on bad frontmatter).
export function readData(text) {
  return parse(text).data;
}
