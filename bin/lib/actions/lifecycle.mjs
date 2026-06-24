// actions/lifecycle.mjs — core lifecycle subcommands (M1): init, register/new,
// advance/set, gate, await, context, status, validate. Each handler is pure-ish:
// it loads state via state.mjs, mutates in memory, and persists via state.save —
// state.mjs remains the sole writer.

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ok, errNoRequest, errNotRepo, errUsage, errState } from '../output.mjs';
import { load, save, emptyState, isWorkflowRepo, statePaths } from '../state.mjs';
import { docsPaths, requestPaths, requestDir, requestsRoot, buildPreconditions } from '../paths.mjs';
import { applyTransition, evaluateTransition } from '../transition.mjs';
import { nextReqId, isReqId } from '../ids.mjs';
import { GRAPH, isState } from '../gate.mjs';

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'request';

function copyDir(src, dst) {
  if (!existsSync(src)) return;
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = resolve(src, entry.name);
    const d = resolve(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile() && !existsSync(d)) copyFileSync(s, d);
  }
}

// ---- init -----------------------------------------------------------------

function handleInit(ctx) {
  const { root, opts, pluginRoot } = ctx;
  const force = ctx.values.force === true;
  const sp = statePaths(root);
  const dp = docsPaths(root);

  for (const d of [dp.docs, dp.adrsDir, dp.principlesDir, dp.specDir, requestsRoot(root)]) {
    mkdirSync(d, { recursive: true });
  }

  // Copy the principles corpus shipped in the plugin (no-op until it exists @ M2).
  copyDir(resolve(pluginRoot, 'docs', 'principles'), dp.principlesDir);

  const existed = existsSync(sp.json);
  if (!existed || force) {
    save(root, emptyState({ clock: opts.clock, engineVersion: ctx.engineVersion }), opts);
  }

  return ok(
    { initialized: true, root, created: !existed, forced: force },
    existed && !force
      ? `Already initialized at ${root} (idempotent no-op).`
      : `Initialized system-design workflow at ${root}.`,
  );
}

// ---- register / new -------------------------------------------------------

function handleRegister(ctx) {
  const { root, opts } = ctx;
  if (!isWorkflowRepo(root)) throw errNotRepo();
  const title = ctx.values.title;
  if (!title) throw errUsage('register requires --title');
  const slug = ctx.values.slug ? String(ctx.values.slug) : slugify(title);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw errUsage(`invalid --slug "${slug}"`);

  const { state } = load(root, opts);

  // Idempotent on an open slug: return the existing non-DONE request unchanged.
  for (const req of Object.values(state.requests)) {
    if (req.slug === slug && req.status !== 'DONE') {
      return ok({ id: req.id, slug, status: req.status, idempotent: true }, `${req.id} (existing open request for "${slug}")`);
    }
  }

  const id = nextReqId(Object.keys(state.requests));
  const now = opts.clock ? opts.clock() : new Date().toISOString();
  const tier = ctx.values.tier ? String(ctx.values.tier).toUpperCase() : null;
  if (tier && !['TRIVIAL', 'STANDARD', 'DEEP'].includes(tier)) throw errUsage(`invalid --tier "${tier}"`);

  state.requests[id] = {
    id,
    slug,
    title: String(title).slice(0, 200),
    tier,
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
    history: [{ from: null, to: 'INTAKE', at: now, by: 'engine', gate: null, override: null, note: 'registered' }],
  };

  mkdirSync(requestDir(root, id), { recursive: true });
  if (ctx.values['statement-file']) {
    const sf = String(ctx.values['statement-file']);
    if (!existsSync(sf)) throw errUsage(`--statement-file not found: ${sf}`);
    writeFileSync(requestPaths(root, id).intake, readFileSync(sf, 'utf8'));
  }

  save(root, state, opts);
  return ok({ id, slug, status: 'INTAKE', tier }, `Registered ${id} "${title}" (${slug}).`);
}

// ---- advance / set --------------------------------------------------------

function handleAdvance(ctx) {
  const { root, opts } = ctx;
  if (!isWorkflowRepo(root)) throw errNotRepo();
  const id = ctx.values.id;
  const to = ctx.values.to ? String(ctx.values.to).toUpperCase() : null;
  if (!id) throw errUsage('advance requires --id');
  if (!to) throw errUsage('advance requires --to');

  const { state } = load(root, opts);
  const req = state.requests[id];
  if (!req) throw errNoRequest(`request ${id} not found`, { id });

  const preconditions = buildPreconditions(root, ctx.preconditionExtras ?? {});
  const result = applyTransition(req, to, {
    preconditions,
    override: ctx.values.override ?? null,
    gate: ctx.values.gate ?? null,
    by: ctx.values.by ?? 'engine',
    note: ctx.values.note ?? null,
    clock: opts.clock,
  });

  if (result.changed) {
    req.awaiting = null; // a successful move clears any pending gate cursor
    save(root, state, opts);
  }
  return ok(
    { id, from: result.from, to: result.to, changed: result.changed, overridden: result.overridden ?? false },
    result.changed ? `${id}: ${result.from} -> ${result.to}` : `${id}: already ${to} (no-op)`,
  );
}

// ---- gate (dry-run) -------------------------------------------------------

function handleGate(ctx) {
  const { root, opts } = ctx;
  if (!isWorkflowRepo(root)) throw errNotRepo();
  const id = ctx.values.id;
  const to = ctx.values.to ? String(ctx.values.to).toUpperCase() : null;
  if (!id) throw errUsage('gate requires --id');
  if (!to) throw errUsage('gate requires --to');
  const { state } = load(root, opts);
  const req = state.requests[id];
  if (!req) throw errNoRequest(`request ${id} not found`, { id });
  const preconditions = buildPreconditions(root, ctx.preconditionExtras ?? {});
  const ev = evaluateTransition(req, to, { preconditions, override: ctx.values.override ?? null });
  return {
    code: ev.code,
    json: { id, from: ev.from, to: ev.to, ok: ev.ok, missing: ev.missing, reason: ev.reason ?? null },
    human: ev.ok ? `${id}: ${ev.from} -> ${ev.to} OK` : `${id}: cannot reach ${ev.to}: ${ev.reason}${ev.missing.length ? ' [' + ev.missing.join('; ') + ']' : ''}`,
  };
}

// ---- await (persist gate cursor) -----------------------------------------

function handleAwait(ctx) {
  const { root, opts } = ctx;
  if (!isWorkflowRepo(root)) throw errNotRepo();
  const id = ctx.values.id;
  const gate = ctx.values.gate ? String(ctx.values.gate).toUpperCase() : null;
  if (!id) throw errUsage('await requires --id');
  if (!['G1', 'G2', 'G3'].includes(gate)) throw errUsage('await requires --gate G1|G2|G3');
  const { state } = load(root, opts);
  const req = state.requests[id];
  if (!req) throw errNoRequest(`request ${id} not found`, { id });
  req.awaiting = gate;
  save(root, state, opts);
  return ok({ id, awaiting: gate }, `${id}: awaiting ${gate}`);
}

// ---- context (resume bundle) ---------------------------------------------

function handleContext(ctx) {
  const { root, opts } = ctx;
  if (!isWorkflowRepo(root)) throw errNotRepo();
  const id = ctx.values.id;
  if (!id) throw errUsage('context requires --id');
  const { state } = load(root, opts);
  const req = state.requests[id];
  if (!req) throw errNoRequest(`request ${id} not found`, { id });
  const rp = requestPaths(root, id);
  const artifacts = {
    intake: existsSync(rp.intake) ? rp.intake : null,
    spec: existsSync(rp.spec) ? rp.spec : null,
    plan: existsSync(rp.plan) ? rp.plan : null,
    planReview: existsSync(rp.planReview) ? rp.planReview : null,
    decisions: existsSync(rp.decisions) ? rp.decisions : null,
  };
  const bundle = {
    id,
    slug: req.slug,
    title: req.title,
    status: req.status,
    tier: req.tier,
    awaiting: req.awaiting ?? null,
    openQuestions: req.openQuestions,
    blockedReason: req.blockedReason ?? null,
    adrs: req.adrs,
    legalTargets: GRAPH[req.status] ?? [],
    overrideAvailable: (req.overrides ?? []).some((o) => o.consumedAt === null),
    artifacts,
  };
  return ok(
    bundle,
    `${id} [${req.status}] tier=${req.tier ?? '?'} awaiting=${req.awaiting ?? '-'} openQ=${req.openQuestions}`,
  );
}

// ---- status (dashboard / --hook rehydrate) -------------------------------

function handleStatus(ctx) {
  const { root, opts } = ctx;
  const hook = ctx.values.hook === true;
  if (!isWorkflowRepo(root)) {
    // --hook MUST exit 0 silently outside a workflow repo.
    if (hook) return ok({ workflow: false }, '');
    throw errNotRepo();
  }
  const { state } = load(root, opts);
  const reqs = Object.values(state.requests);
  if (ctx.values.id) {
    const req = state.requests[ctx.values.id];
    if (!req) throw errNoRequest(`request ${ctx.values.id} not found`, { id: ctx.values.id });
    return ok({ request: summarize(req) }, formatRequestLine(req));
  }
  const active = reqs.filter((r) => r.status !== 'DONE');
  const awaiting = active.filter((r) => r.awaiting);
  if (hook) {
    const lines = ['[system-design] workflow active.'];
    for (const r of awaiting) lines.push(`  ${r.id} awaiting ${r.awaiting} — "${r.title}"`);
    for (const r of active.filter((r) => !r.awaiting)) lines.push(`  ${r.id} [${r.status}] — "${r.title}"`);
    if (active.length === 0) lines.push('  (no open requests)');
    return ok({ workflow: true, active: active.length, awaiting: awaiting.length }, lines.join('\n'));
  }
  const human = reqs.length ? reqs.map(formatRequestLine).join('\n') : 'No requests yet. Run `engine register --title ...`.';
  return ok({ count: reqs.length, requests: reqs.map(summarize) }, human);
}

const summarize = (r) => ({ id: r.id, slug: r.slug, status: r.status, tier: r.tier, awaiting: r.awaiting ?? null, openQuestions: r.openQuestions });
const formatRequestLine = (r) => `${r.id} [${r.status}]${r.awaiting ? ' awaiting ' + r.awaiting : ''} tier=${r.tier ?? '?'} — "${r.title}"`;

// ---- validate (state + referential cross-checks) -------------------------

function handleValidate(ctx) {
  const { root, opts } = ctx;
  if (!isWorkflowRepo(root)) throw errNotRepo();
  const { state } = load(root, opts); // schema-validates on load
  const problems = [];
  for (const [key, req] of Object.entries(state.requests)) {
    if (key !== req.id) problems.push(`key ${key} != request.id ${req.id}`);
    if (!isReqId(req.id)) problems.push(`bad request id ${req.id}`);
    if (!isState(req.status)) problems.push(`${req.id}: unknown status ${req.status}`);
    if (!req.history.length) problems.push(`${req.id}: empty history`);
    const last = req.history[req.history.length - 1];
    if (last && last.to !== req.status) problems.push(`${req.id}: status ${req.status} != last history.to ${last.to}`);
  }
  if (problems.length) throw errState(`state referential problems: ${problems.join('; ')}`, { problems });
  return ok({ valid: true, requests: Object.keys(state.requests).length }, `state valid (${Object.keys(state.requests).length} request(s)).`);
}

// ---- registry -------------------------------------------------------------

export const lifecycleCommands = {
  init: {
    summary: 'scaffold a workflow repo (idempotent)',
    options: { force: { type: 'boolean' } },
    handler: handleInit,
  },
  register: {
    summary: 'mint a new request (req-NNNN), status INTAKE',
    options: { title: { type: 'string' }, slug: { type: 'string' }, tier: { type: 'string' }, 'statement-file': { type: 'string' } },
    handler: handleRegister,
  },
  new: {
    summary: 'alias of register',
    options: { title: { type: 'string' }, slug: { type: 'string' }, tier: { type: 'string' }, 'statement-file': { type: 'string' } },
    handler: handleRegister,
  },
  advance: {
    summary: 'transition a request to a new state (the only status writer)',
    options: { id: { type: 'string' }, to: { type: 'string' }, override: { type: 'string' }, gate: { type: 'string' }, by: { type: 'string' }, note: { type: 'string' } },
    handler: handleAdvance,
  },
  set: {
    summary: 'alias of advance',
    options: { id: { type: 'string' }, to: { type: 'string' }, override: { type: 'string' }, gate: { type: 'string' }, by: { type: 'string' }, note: { type: 'string' } },
    handler: handleAdvance,
  },
  gate: {
    summary: 'dry-run a transition (never writes)',
    options: { id: { type: 'string' }, to: { type: 'string' }, override: { type: 'string' } },
    handler: handleGate,
  },
  await: {
    summary: 'persist an awaiting-gate cursor (crash-safe)',
    options: { id: { type: 'string' }, gate: { type: 'string' } },
    handler: handleAwait,
  },
  context: {
    summary: 'print a resume bundle for a request',
    options: { id: { type: 'string' } },
    handler: handleContext,
  },
  status: {
    summary: 'dashboard; --hook for SessionStart rehydrate (always exit 0 outside a repo)',
    options: { id: { type: 'string' }, hook: { type: 'boolean' } },
    handler: handleStatus,
  },
  validate: {
    summary: 'schema-validate state + referential cross-checks',
    options: {},
    handler: handleValidate,
  },
};
