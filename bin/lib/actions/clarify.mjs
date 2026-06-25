// actions/clarify.mjs — intake/clarify subcommands (M3): triage, set-open-questions,
// classify, validate-doc. These drive G1 (open-question burn-down) and tier choice,
// and run the referential checks a JSON schema cannot express.

import { existsSync, readFileSync } from 'node:fs';
import { ok, errNoRequest, errNotRepo, errUsage, errGate, errSchema } from '../output.mjs';
import { validate } from '../jsonschema.mjs';
import { loadSchema } from '../schemas.mjs';
import { parse } from '../frontmatter.mjs';
import { load, save, isWorkflowRepo } from '../state.mjs';
import { buildPreconditions } from '../paths.mjs';
import { applyTransition } from '../transition.mjs';
import { classifyTier, TIERS } from '../tier.mjs';
import { reqItemOwnershipViolations } from '../ids.mjs';

function loadReq(root, id, opts) {
  if (!isWorkflowRepo(root)) throw errNotRepo();
  const { state } = load(root, opts);
  const req = state.requests[id];
  if (!req) throw errNoRequest(`request ${id} not found`, { id });
  return { state, req };
}

function countOpenQuestions(file) {
  if (!existsSync(file)) throw errUsage(`--questions-file not found: ${file}`);
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#')).length;
}

// triage --id --tier --questions-file  (set tier + open questions, advance to TRIAGED)
function handleTriage(ctx) {
  const { root, opts } = ctx;
  const id = ctx.values.id;
  if (!id) throw errUsage('triage requires --id');
  const tier = ctx.values.tier ? String(ctx.values.tier).toUpperCase() : null;
  if (!tier || !TIERS.includes(tier)) throw errUsage(`triage requires --tier ${TIERS.join('|')}`);
  const { state, req } = loadReq(root, id, opts);
  req.tier = tier;
  if (ctx.values['questions-file']) req.openQuestions = countOpenQuestions(String(ctx.values['questions-file']));
  const preconditions = buildPreconditions(root);
  const result = applyTransition(req, 'TRIAGED', { preconditions, by: 'engine', note: `triaged ${tier}`, clock: opts.clock });
  if (result.changed) req.awaiting = null;
  save(root, state, opts);
  return ok({ id, tier, openQuestions: req.openQuestions, status: req.status }, `${id}: triaged ${tier} (${req.openQuestions} open question(s)) -> ${req.status}`);
}

// set-open-questions --id --n  (drives G1; legal in any state)
function handleSetOpenQuestions(ctx) {
  const { root, opts } = ctx;
  const id = ctx.values.id;
  if (!id) throw errUsage('set-open-questions requires --id');
  const n = Number(ctx.values.n);
  if (!Number.isInteger(n) || n < 0) throw errUsage('set-open-questions requires --n <non-negative integer>');
  const { state, req } = loadReq(root, id, opts);
  req.openQuestions = n;
  save(root, state, opts);
  return ok({ id, openQuestions: n }, `${id}: ${n} open question(s).`);
}

// classify --id [--touches-adr] [--adds-dep] [--files n] [--hint t] [--apply]
function handleClassify(ctx) {
  const { root, opts } = ctx;
  const id = ctx.values.id;
  if (!id) throw errUsage('classify requires --id');
  const { state, req } = loadReq(root, id, opts);
  const filesArg = ctx.values.files !== undefined ? Number(ctx.values.files) : undefined;
  const { tier, reasons, signalTier } = classifyTier({
    touchesAdr: ctx.values['touches-adr'] === true,
    addsDep: ctx.values['adds-dep'] === true,
    files: Number.isFinite(filesArg) ? filesArg : undefined,
    hint: ctx.values.hint,
  });
  let applied = false;
  if (ctx.values.apply === true) {
    if (!['INTAKE', 'TRIAGED'].includes(req.status)) {
      throw errGate(`cannot apply tier in state ${req.status} (only INTAKE/TRIAGED)`, { status: req.status });
    }
    req.tier = tier;
    save(root, state, opts);
    applied = true;
  }
  const hintDisagrees = signalTier !== tier;
  return ok(
    { id, recommended: tier, signalTier, hintDisagrees, reasons, applied },
    `${id}: recommend ${tier} (${reasons.join('; ')})${applied ? ' [applied]' : ''}`,
  );
}

// retier --id [--to TIER | --restore]  (correct an over-classification, or undo an
// auto-escalation). Unlike `classify --apply` (gated to INTAKE/TRIAGED) and `triage`
// (which only reaches the tier via the INTAKE->TRIAGED edge), retier sets the tier in
// ANY non-terminal state — the gap the lifecycle otherwise leaves once a request has
// progressed or been auto-escalated to DEEP by a governed-file edit.
function handleRetier(ctx) {
  const { root, opts } = ctx;
  const id = ctx.values.id;
  if (!id) throw errUsage('retier requires --id');
  const { state, req } = loadReq(root, id, opts);

  const restore = ctx.values.restore === true;
  const toArg = ctx.values.to ? String(ctx.values.to).toUpperCase() : null;
  if (!restore && !toArg) throw errUsage('retier requires --to <TIER> or --restore');
  if (restore && toArg) throw errUsage('retier: pass either --to or --restore, not both');

  let to;
  if (restore) {
    // Undo a governed-file auto-escalation back to the recorded prior tier. Floored at
    // STANDARD: once architecture was in play, the SPEC/PLAN/review gates stay in force.
    if (!req.escalatedFrom) {
      throw errGate(`${id} was not auto-escalated (no prior tier recorded); use --to <tier> to set one`, { tier: req.tier });
    }
    to = req.escalatedFrom === 'TRIVIAL' ? 'STANDARD' : req.escalatedFrom;
  } else {
    if (!TIERS.includes(toArg)) throw errUsage(`retier --to must be ${TIERS.join('|')}`);
    to = toArg;
  }

  // Gate-safety: TRIVIAL short-circuits the SPECCED/PLANNED/PLAN_OK/VERIFYING gates, so
  // dropping to it mid-flow would let later transitions skip SPEC/PLAN/review entirely.
  // Only permit TRIVIAL before any artifact gate is in play (INTAKE/TRIAGED).
  if (to === 'TRIVIAL' && !['INTAKE', 'TRIAGED'].includes(req.status)) {
    throw errGate(`cannot retier to TRIVIAL in state ${req.status} — TRIVIAL skips the SPEC/PLAN/review gates; downgrade to STANDARD instead`, { status: req.status, tier: req.tier });
  }

  const from = req.tier;
  req.tier = to;
  if (req.escalatedFrom) delete req.escalatedFrom; // consume the (previously dead) marker
  req.updatedAt = opts.clock ? opts.clock() : new Date().toISOString();
  save(root, state, opts);
  return ok(
    { id, from: from ?? null, to, restored: restore, status: req.status },
    `${id}: re-tiered ${from ?? '?'} -> ${to}${restore ? ' (restored prior tier)' : ''}.`,
  );
}

// validate-doc --kind <k> --path <p>  (referential checks beyond JSON schema)
function handleValidateDoc(ctx) {
  const kind = ctx.values.kind;
  const path = ctx.values.path;
  if (!kind) throw errUsage('validate-doc requires --kind');
  if (!path) throw errUsage('validate-doc requires --path');
  if (!existsSync(path)) throw errUsage(`--path not found: ${path}`);

  if (kind === 'spec' || kind === 'adr') {
    const schemaName = kind === 'spec' ? 'spec.frontmatter' : 'adr.frontmatter';
    const { data } = parse(readFileSync(path, 'utf8'));
    const { valid, errors } = validate(loadSchema(schemaName, { pluginRoot: ctx.pluginRoot }), data);
    if (!valid) throw errSchema(`${kind} invalid: ${errors.map((e) => `${e.pointer} ${e.message}`).join('; ')}`, { errors });
    if (kind === 'spec') {
      const bad = reqItemOwnershipViolations(data.id, (data.requirements ?? []).map((r) => r.id));
      if (bad.length) throw errSchema(`requirement ids not owned by ${data.id}: ${bad.join(', ')}`, { bad });
    }
    return ok({ kind, valid: true }, `${kind} valid.`);
  }

  if (kind === 'plan-review' || kind === 'qa') {
    // Verdict JSON validation (used by M4/M5). Validated structurally here.
    let v;
    try {
      v = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      throw errSchema(`${kind} verdict JSON parse error: ${e.message}`);
    }
    const verdictField = kind === 'plan-review' ? 'verdict' : 'overall';
    const allowed = kind === 'plan-review' ? ['PASS', 'REVISE'] : ['PASS', 'FAIL'];
    if (!allowed.includes(v[verdictField])) throw errSchema(`${kind} ${verdictField} must be ${allowed.join('|')}`);
    if (kind === 'plan-review' && !Number.isInteger(v.blockerCount)) throw errSchema('plan-review blockerCount must be an integer');
    return ok({ kind, valid: true, verdict: v[verdictField], blockerCount: v.blockerCount ?? null }, `${kind} verdict valid.`);
  }

  throw errUsage(`unknown --kind "${kind}" (spec|adr|plan-review|qa)`);
}

export const clarifyCommands = {
  triage: {
    summary: 'set tier + open questions and advance to TRIAGED',
    options: { id: { type: 'string' }, tier: { type: 'string' }, 'questions-file': { type: 'string' } },
    handler: handleTriage,
  },
  'set-open-questions': {
    summary: 'set the residual open-question count (drives G1)',
    options: { id: { type: 'string' }, n: { type: 'string' } },
    handler: handleSetOpenQuestions,
  },
  classify: {
    summary: 'recommend a tier from intake signals; --apply to write it',
    options: { id: { type: 'string' }, 'touches-adr': { type: 'boolean' }, 'adds-dep': { type: 'boolean' }, files: { type: 'string' }, hint: { type: 'string' }, apply: { type: 'boolean' } },
    handler: handleClassify,
  },
  retier: {
    summary: 'correct a tier after triage (--to TIER) or undo an auto-escalation (--restore)',
    options: { id: { type: 'string' }, to: { type: 'string' }, restore: { type: 'boolean' } },
    handler: handleRetier,
  },
  'validate-doc': {
    summary: 'referential validation of a SPEC/ADR/verdict document',
    options: { kind: { type: 'string' }, path: { type: 'string' } },
    handler: handleValidateDoc,
  },
};
