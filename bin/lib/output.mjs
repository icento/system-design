// output.mjs — the stdout/stderr/--json contract and the frozen exit-code API.
//
// Frozen exit-code contract (public API — never renumber):
//   0  OK        success
//   2  EUSAGE    bad args / unknown subcommand or flag
//   3  ENOTREPO  not initialized (no workflow root)
//   4  ENOREQUEST  --id not found
//   5  EGATE     precondition unmet (also traceability holes, arch-stale) — the branchable code
//   6  EILLEGAL  transition edge not in graph
//   7  ESTATE    state corrupt/invalid/newer-version; or selfcheck failed
//   8  EWRITE    atomic write / fs / lock failure
//   9  ESCHEMA   referenced artifact frontmatter invalid
//   70 EINTERNAL unexpected
//
// Contract rules:
//   * --json ALWAYS co-emits { ok, code } so callers branch on structured data, never stderr text.
//   * Success structured output goes to stdout; human output to stdout (suppressed by --quiet).
//   * Error structured output (--json) goes to stdout as { ok:false, code, error, message, ... };
//     human errors go to stderr. Exit code is always the frozen code.

export const EXIT = Object.freeze({
  OK: 0,
  EUSAGE: 2,
  ENOTREPO: 3,
  ENOREQUEST: 4,
  EGATE: 5,
  EILLEGAL: 6,
  ESTATE: 7,
  EWRITE: 8,
  ESCHEMA: 9,
  EINTERNAL: 70,
});

export const EXIT_NAME = Object.freeze({
  0: 'OK',
  2: 'EUSAGE',
  3: 'ENOTREPO',
  4: 'ENOREQUEST',
  5: 'EGATE',
  6: 'EILLEGAL',
  7: 'ESTATE',
  8: 'EWRITE',
  9: 'ESCHEMA',
  70: 'EINTERNAL',
});

// EngineError — every deliberate non-zero exit flows through this so the top-level
// handler can render it uniformly. `extra` is merged into the --json payload
// (e.g. { missing: [...] } for EGATE, { from, to } for EILLEGAL).
export class EngineError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = EXIT_NAME[code] ?? 'EINTERNAL';
    this.code = code;
    this.extra = extra;
  }
}

// Convenience constructors keep call sites terse and intention-revealing.
export const errUsage = (m, x) => new EngineError(EXIT.EUSAGE, m, x);
export const errNotRepo = (m = 'not a system-design workflow repo (run `engine init`)', x) =>
  new EngineError(EXIT.ENOTREPO, m, x);
export const errNoRequest = (m, x) => new EngineError(EXIT.ENOREQUEST, m, x);
export const errGate = (m, x) => new EngineError(EXIT.EGATE, m, x);
export const errIllegal = (m, x) => new EngineError(EXIT.EILLEGAL, m, x);
export const errState = (m, x) => new EngineError(EXIT.ESTATE, m, x);
export const errWrite = (m, x) => new EngineError(EXIT.EWRITE, m, x);
export const errSchema = (m, x) => new EngineError(EXIT.ESCHEMA, m, x);
export const errInternal = (m, x) => new EngineError(EXIT.EINTERNAL, m, x);

// A subcommand handler returns a Result. The dispatcher renders it.
//   code:  exit code (default 0)
//   json:  object merged into the structured payload
//   human: string printed to stdout when not --json (unless --quiet)
export function ok(json = {}, human = '') {
  return { code: EXIT.OK, json, human };
}

// Render a successful Result.
export function renderOk(result, opts, out = process.stdout) {
  const { json = {}, human = '' } = result;
  if (opts.json) {
    out.write(JSON.stringify({ ok: true, code: EXIT.OK, ...json }) + '\n');
  } else if (!opts.quiet && human) {
    out.write(human.endsWith('\n') ? human : human + '\n');
  }
}

// Render an EngineError.
export function renderError(err, opts, errOut = process.stderr, out = process.stdout) {
  const code = err.code ?? EXIT.EINTERNAL;
  if (opts.json) {
    out.write(
      JSON.stringify({
        ok: false,
        code,
        error: EXIT_NAME[code] ?? 'EINTERNAL',
        message: String(err.message ?? ''),
        ...(err.extra ?? {}),
      }) + '\n',
    );
  } else {
    errOut.write(`sd-engine: ${EXIT_NAME[code] ?? 'EINTERNAL'}: ${err.message}\n`);
  }
}

// Render a hook-* Result: hook subcommands ALWAYS exit 0 and put the decision in
// the JSON payload (permissionDecision / additionalContext). Never human text.
export function renderHook(payload, out = process.stdout) {
  out.write(JSON.stringify(payload) + '\n');
}
