// tigerlint.mjs — mechanized checks for the TIGER_STYLE numeric limits. Heuristic
// and language-agnostic-ish (tuned for C-family / JS). Advisory by default; findings
// are surfaced to the model and (in blocking mode) recorded for the QA phase.
//
// Rules: size (function > 70 lines, line > 100 cols), unbounded-loop (while(true)/
// for(;;) with no break), assert-density (avg < 2 asserts per function).

const LINE_COLUMNS_MAX = 100;
const FUNCTION_LINES_MAX = 70;
const ASSERT_FLOOR = 2;

const CODE_EXT = /\.(mjs|cjs|js|jsx|ts|tsx|c|h|cc|cpp|hpp|go|rs|java|zig)$/i;

export function isCodeFile(path) {
  return CODE_EXT.test(path || '');
}

// Find function spans by brace counting from a header line. Returns [{start,end}].
function functionSpans(lines) {
  const headerRe = /(function\b|\)\s*=>\s*\{|^\s*(?:export\s+)?(?:async\s+)?[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{)/;
  const spans = [];
  for (let i = 0; i < lines.length; i++) {
    if (!headerRe.test(lines[i]) || !lines[i].includes('{')) continue;
    let depth = 0;
    let started = false;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') {
          depth++;
          started = true;
        } else if (ch === '}') depth--;
      }
      if (started && depth <= 0) {
        spans.push({ start: i, end: j });
        i = j;
        break;
      }
    }
  }
  return spans;
}

export function analyze(code, { path = '' } = {}) {
  const findings = [];
  if (!isCodeFile(path)) return findings;
  const lines = code.split('\n');

  // size: long lines
  lines.forEach((ln, idx) => {
    if (ln.length > LINE_COLUMNS_MAX) {
      findings.push({ rule: 'size', line: idx + 1, message: `line ${idx + 1} is ${ln.length} cols (> ${LINE_COLUMNS_MAX})` });
    }
  });

  const spans = functionSpans(lines);

  // size: long functions
  for (const s of spans) {
    const len = s.end - s.start + 1;
    if (len > FUNCTION_LINES_MAX) {
      findings.push({ rule: 'size', line: s.start + 1, message: `function at line ${s.start + 1} is ${len} lines (> ${FUNCTION_LINES_MAX})` });
    }
  }

  // unbounded-loop: while(true)/while(1)/for(;;) with no break in the file region
  lines.forEach((ln, idx) => {
    if (/\b(while\s*\(\s*(true|1)\s*\)|for\s*\(\s*;\s*;\s*\))/.test(ln)) {
      const region = lines.slice(idx, Math.min(lines.length, idx + 60)).join('\n');
      if (!/\bbreak\b|\breturn\b/.test(region)) {
        findings.push({ rule: 'unbounded-loop', line: idx + 1, message: `unbounded loop at line ${idx + 1} (no break/return)` });
      }
    }
  });

  // assert-density: average asserts per function below the floor
  if (spans.length > 0) {
    const assertCount = (code.match(/\bassert\b|\bassert\./g) || []).length;
    const avg = assertCount / spans.length;
    if (avg < ASSERT_FLOOR) {
      findings.push({ rule: 'assert-density', line: 1, message: `assert density ${avg.toFixed(2)} < floor ${ASSERT_FLOOR} (${assertCount} asserts / ${spans.length} functions)` });
    }
  }

  return findings;
}
