// actions/hooks.mjs — the engine logic behind the hook shell scripts. Every hook-*
// subcommand reads the PreToolUse JSON on stdin, emits a permissionDecision payload,
// and ALWAYS exits 0 (the deny is in the payload, never the exit code). These FAIL
// OPEN: any internal error allows the edit and is logged loudly, so a bug never
// bricks editing (risk R4).

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { load, save, isWorkflowRepo } from '../state.mjs';
import { requestPaths } from '../paths.mjs';
import { parse } from '../frontmatter.mjs';
import { readGovernsIndex, governedBy, buildGovernsIndex, saveGovernsIndex } from '../governs.mjs';
import { globMatches } from '../tier.mjs';
import { archSourceHash, recordedHash, markArchStale } from '../arch.mjs';
import { analyze, isCodeFile } from '../tigerlint.mjs';

// Generated / engine-owned files that must never be hand-edited.
const PROTECTED = new Set([
  'docs/PRINCIPLES.md',
  'docs/ARCHITECTURE.md',
  'docs/.state.json',
  'docs/.state.bak',
  'docs/.governs-index.json',
  'docs/.arch-hash',
  'docs/.architecture-stale',
]);

const ALLOW = {}; // empty payload -> pass through to normal permission flow

function deny(reason) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
}
function ask(reason) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason } };
}
function allowWith(reason) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: reason } };
}

function readStdin() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function logError(e) {
  try {
    const dir = process.env.CLAUDE_PLUGIN_DATA || tmpdir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(resolve(dir, 'gate-errors.log'), `${new Date().toISOString()} hook-gate: ${e && e.stack ? e.stack : e}\n`);
  } catch {
    /* never throw from the error logger */
  }
}

function relPath(root, filePath) {
  if (!filePath) return null;
  const rel = relative(root, resolve(root, filePath));
  return rel.split('\\').join('/');
}

// Open (non-DONE) requests, deterministically ordered: most-recently-updated first,
// ties broken by id descending. The id tie-break makes the comparator transitive —
// the old `a<b?1:-1` returned -1 for BOTH (a,b) and (b,a) on equal timestamps, so the
// chosen request was sort-implementation-dependent.
function sortedOpen(state) {
  return Object.values(state.requests)
    .filter((r) => r.status !== 'DONE')
    .sort((a, b) => {
      if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    });
}

// Choose the request whose edit gate governs THIS file. Resolving by file (not merely
// "the most-recently-updated open request") is what keeps the gate sound when several
// requests are open: registering or touching a second request must never silently
// disable the in-flight request's PLAN-scope or DEEP-incomplete protection — which the
// old single-active heuristic did, because a newer request became "active" and its
// (INTAKE) gate let everything through.
function gateTarget(state, root, rel) {
  const open = sortedOpen(state);
  if (open.length === 0) return null;
  const implementing = open.filter((r) => r.status === 'IMPLEMENTING');
  // 1) an IMPLEMENTING request whose PLAN scope already covers this file owns the edit.
  const owner = implementing.find((r) => inScope(planScope(root, r.id), rel));
  if (owner) return owner;
  // 2) else any IMPLEMENTING request still governs it (the edit is out of its scope).
  if (implementing.length) return implementing[0];
  // 3) a DEEP request whose architecture is undecided blocks source edits broadly.
  const deepPending = open.find(
    (r) => r.tier === 'DEEP' && (!existsSync(requestPaths(root, r.id).spec) || (r.adrs ?? []).some((a) => a.status === 'proposed')),
  );
  if (deepPending) return deepPending;
  // 4) a non-DEEP request that governs this file (auto-escalation candidate).
  if (governedBy(readGovernsIndex(root), rel).length) {
    const gov = open.find((r) => r.tier !== 'DEEP');
    if (gov) return gov;
  }
  // 5) deterministic fallback.
  return open[0];
}

// Decide ask-vs-deny under the warn-first policy, persisting any pending state
// mutation and firstDenialSeen together. Returns the payload.
function gateDecision(ctx, state, req, reason, mutated = false, overridable = true) {
  const warnOnly = (req.config?.enforcement ?? 'warn') === 'warn';
  if (warnOnly) {
    if (mutated) trySave(ctx, state);
    return ask(`${reason} (enforcement=warn; allowing with a warning)`);
  }
  if (!req.runtime.firstDenialSeen) {
    req.runtime.firstDenialSeen = true;
    trySave(ctx, state); // persists firstDenialSeen + any mutation atomically
    // /sd:override only unblocks the IMPLEMENTING PLAN-scope gate; the DEEP-incomplete
    // gate is cleared by writing the SPEC / deciding the ADRs, so don't point there.
    const remedy = overridable ? 'confirm or run /sd:override' : 'confirm, or resolve the above first';
    return ask(`${reason} (first denial — ${remedy})`);
  }
  if (mutated) trySave(ctx, state);
  return deny(reason);
}

// Union of steps[].files in the request's PLAN = the allowed edit scope.
function planScope(root, id) {
  const p = requestPaths(root, id).plan;
  if (!existsSync(p)) return null;
  try {
    const plan = parse(readFileSync(p, 'utf8')).data;
    return (plan.steps ?? []).flatMap((s) => s.files ?? []);
  } catch {
    return null;
  }
}

const inScope = (scope, rel) => scope !== null && scope.some((g) => g === rel || globMatches(g, rel));

// A live override matching this path: unconsumed, scope-valid.
function matchingOverride(req, rel) {
  return (req.overrides ?? []).find((o) => {
    if (o.consumedAt !== null && o.scope === 'once') return false;
    if (o.path && o.path === rel) return true;
    if (o.glob && globMatches(o.glob, rel)) return true;
    return false;
  });
}

function handleHookGate(ctx) {
  try {
    const input = readStdin();
    const filePath = input?.tool_input?.file_path;
    const rel = relPath(ctx.root, filePath);
    if (!rel || rel.startsWith('..')) return { hook: ALLOW };

    // 1) generated / engine-owned protection (always, independent of state).
    if (PROTECTED.has(rel)) {
      return { hook: deny(`${rel} is generated/engine-owned; do not edit by hand (use the engine).`) };
    }

    if (!isWorkflowRepo(ctx.root)) return { hook: ALLOW };
    const { state } = load(ctx.root, ctx.opts);
    const req = gateTarget(state, ctx.root, rel);
    if (!req) return { hook: ALLOW };

    // 2) workflow artifacts are managed by commands/the engine -> allow.
    if (rel.startsWith('docs/') || rel.startsWith('requests/')) return { hook: ALLOW };

    let mutated = false;

    // 3) governs reverse-index + auto-escalation. Editing an accepted-ADR-governed
    //    file escalates a non-DEEP request to DEEP (architecture is now in play).
    const govHits = governedBy(readGovernsIndex(ctx.root), rel);
    if (govHits.length && req.tier !== 'DEEP') {
      req.escalatedFrom = req.tier ?? 'STANDARD';
      req.tier = 'DEEP';
      mutated = true;
    }

    // 4) DEEP-incomplete gate: block source edits while a DEEP request lacks a SPEC
    //    or still has proposed ADRs (architecture undecided).
    if (req.tier === 'DEEP') {
      const noSpec = !existsSync(requestPaths(ctx.root, req.id).spec);
      const proposed = (req.adrs ?? []).some((a) => a.status === 'proposed');
      if (noSpec || proposed) {
        const why = noSpec ? `${req.id} has no SPEC yet` : `${req.id} has ADRs still proposed (decide them first)`;
        return { hook: gateDecision(ctx, state, req, `editing ${rel}: ${why}`, mutated, false) };
      }
    }

    // 5) implementation-phase PLAN-scope enforcement.
    if (req.status === 'IMPLEMENTING') {
      const scope = planScope(ctx.root, req.id);

      // 5a) a live override wins (and a `once` override is consumed here).
      const ov = matchingOverride(req, rel);
      if (ov) {
        if (ov.scope === 'once') {
          ov.consumedAt = ctx.opts.clock ? ctx.opts.clock() : new Date().toISOString();
          mutated = true;
        }
        if (mutated) trySave(ctx, state);
        return { hook: allowWith(`override ${ov.id} permits editing ${rel} (${ov.scope}).`) };
      }

      // 5b) governed file outside PLAN scope -> the strongest denial.
      if (!inScope(scope, rel)) {
        const reason = govHits.length
          ? `editing ${rel}: governed by ${govHits.map((h) => h.adr).join(', ')} and outside the PLAN scope`
          : `editing ${rel}: outside the PLAN scope (not in any step's files)`;
        return { hook: gateDecision(ctx, state, req, reason, mutated) };
      }
    }

    if (mutated) trySave(ctx, state);
    return { hook: ALLOW };
  } catch (e) {
    logError(e);
    return { hook: ALLOW }; // fail open
  }
}

function trySave(ctx, state) {
  try {
    save(ctx.root, state, ctx.opts);
  } catch (e) {
    logError(e);
  }
}

// hook-adr-edit (PostToolUse on docs/adrs/**): rebuild the governs reverse-index so
// the gate stays current after an ADR is written/edited. (M6 adds the arch-stale
// flag here.) Advisory: never blocks, always exits 0.
function handleHookAdrEdit(ctx) {
  try {
    if (!isWorkflowRepo(ctx.root)) return { hook: ALLOW };
    const { state } = load(ctx.root, ctx.opts);
    saveGovernsIndex(ctx.root, buildGovernsIndex(ctx.root, state, ctx.opts.clock));
    // If the accepted-ADR content changed, ARCHITECTURE.md is now stale.
    if (archSourceHash(ctx.root, state) !== recordedHash(ctx.root)) markArchStale(ctx.root);
  } catch (e) {
    logError(e);
  }
  return { hook: ALLOW };
}

// hook-tiger-lint (PostToolUse on code edits): advisory numeric-limit lint. Surfaces
// findings as context; in blocking mode records them to qa/tiger-lint.json for QA.
function handleHookTigerLint(ctx) {
  try {
    const input = readStdin();
    const filePath = input?.tool_input?.file_path;
    const rel = relPath(ctx.root, filePath);
    if (!rel || rel.startsWith('..') || !isCodeFile(rel)) return { hook: ALLOW };
    const abs = resolve(ctx.root, rel);
    if (!existsSync(abs)) return { hook: ALLOW };
    const findings = analyze(readFileSync(abs, 'utf8'), { path: rel });
    if (findings.length === 0) return { hook: ALLOW };

    if (isWorkflowRepo(ctx.root)) {
      const { state } = load(ctx.root, ctx.opts);
      const req = gateTarget(state, ctx.root, rel);
      if (req?.config?.tigerLintBlocking) {
        const out = requestPaths(ctx.root, req.id).tigerLint;
        if (!existsSync(requestPaths(ctx.root, req.id).qaDir)) mkdirSync(requestPaths(ctx.root, req.id).qaDir, { recursive: true });
        appendFileSync(out, JSON.stringify({ file: rel, findings }) + '\n');
      }
    }
    const summary = findings.map((f) => `${f.rule}: ${f.message}`).join('; ');
    return { hook: { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `[tiger-lint] ${rel}: ${summary}` } } };
  } catch (e) {
    logError(e);
    return { hook: ALLOW };
  }
}

// hook-active-req (UserPromptSubmit): inject the active request as context so each
// turn knows what is in flight.
function handleHookActiveReq(ctx) {
  try {
    if (!isWorkflowRepo(ctx.root)) return { hook: ALLOW };
    const { state } = load(ctx.root, ctx.opts);
    const req = sortedOpen(state)[0] ?? null;
    if (!req) return { hook: ALLOW };
    const ctxLine = `[system-design] active request ${req.id} [${req.status}] tier=${req.tier ?? '?'}${req.awaiting ? ' awaiting ' + req.awaiting : ''} — "${req.title}"`;
    return { hook: { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: ctxLine } } };
  } catch (e) {
    logError(e);
    return { hook: ALLOW };
  }
}

export const hookCommands = {
  'hook-gate': { summary: '(hook) PreToolUse edit gate — emits permissionDecision', options: {}, handler: handleHookGate },
  'hook-pre-protect': { summary: '(hook) alias of hook-gate for the main-thread pre-edit gate', options: {}, handler: handleHookGate },
  'hook-adr-edit': { summary: '(hook) PostToolUse — rebuild the governs index + flag arch stale after an ADR edit', options: {}, handler: handleHookAdrEdit },
  'hook-active-req': { summary: '(hook) UserPromptSubmit — inject the active request', options: {}, handler: handleHookActiveReq },
  'hook-tiger-lint': { summary: '(hook) PostToolUse — advisory tiger-lint on a code edit', options: {}, handler: handleHookTigerLint },
};
