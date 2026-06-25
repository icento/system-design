// actions/adr.mjs — ADR staging / acceptance and the decisions handoff (M2):
//   decisions write | adr stage | accept-adr.
// The architect subagent is write-scoped to docs/adrs/, so the engine owns the
// decisions.json handoff file and the proposed->accepted (G2) verb.

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { ok, errNoRequest, errNotRepo, errUsage, errSchema, errGate } from '../output.mjs';
import { validate } from '../jsonschema.mjs';
import { loadSchema } from '../schemas.mjs';
import { parse, stringify } from '../frontmatter.mjs';
import { load, save, isWorkflowRepo } from '../state.mjs';
import { requestPaths, adrPath, docsPaths, buildPreconditions } from '../paths.mjs';
import { applyTransition } from '../transition.mjs';
import { nextAdrId, RE } from '../ids.mjs';
import { buildGovernsIndex, saveGovernsIndex } from '../governs.mjs';
import { markArchStale } from '../arch.mjs';

function loadReq(root, id, opts) {
  if (!isWorkflowRepo(root)) throw errNotRepo();
  const { state } = load(root, opts);
  const req = state.requests[id];
  if (!req) throw errNoRequest(`request ${id} not found`, { id });
  return { state, req };
}

function readDqs(root, req, fromArg, pluginRoot) {
  const src = fromArg ? String(fromArg) : requestPaths(root, req.id).decisions;
  if (!existsSync(src)) throw errUsage(`decision-question-set not found: ${src}`);
  let dqs;
  try {
    dqs = JSON.parse(readFileSync(src, 'utf8'));
  } catch (e) {
    throw errSchema(`decisions JSON parse error: ${e.message}`);
  }
  const schema = loadSchema('decision-question-set', { pluginRoot });
  const { valid, errors } = validate(schema, dqs);
  if (!valid) throw errSchema(`decision-question-set invalid: ${errors.map((e) => `${e.pointer} ${e.message}`).join('; ')}`, { errors });
  if (dqs.request_id !== req.id) throw errSchema(`decisions request_id ${dqs.request_id} != ${req.id}`);
  return dqs;
}

// decisions write --req --from <dqs.json>  (persist + validate the handoff)
function handleDecisionsWrite(ctx) {
  const { root, opts } = ctx;
  const id = ctx.values.req;
  if (!id) throw errUsage('decisions write requires --req');
  const { req } = loadReq(root, id, opts);
  const dqs = readDqs(root, req, ctx.values.from, ctx.pluginRoot);
  const dest = requestPaths(root, id).decisions;
  writeFileSync(dest, JSON.stringify(dqs, null, 2) + '\n');
  return ok({ req: id, path: dest, questions: dqs.questions.length }, `wrote ${dest} (${dqs.questions.length} question(s)).`);
}

// adr stage --request --from <dqs.json>  (register staged ADRs + SPECCED->ADR_PROPOSED)
function handleAdrStage(ctx) {
  const { root, opts } = ctx;
  const id = ctx.values.request;
  if (!id) throw errUsage('adr stage requires --request');
  const { state, req } = loadReq(root, id, opts);
  const dqs = readDqs(root, req, ctx.values.from, ctx.pluginRoot);
  const adrSchema = loadSchema('adr.frontmatter', { pluginRoot: ctx.pluginRoot });

  const stagedIds = [...new Set(dqs.questions.map((q) => q.staged_adr_id))];
  const staged = [];
  for (const adrId of stagedIds) {
    const file = adrPath(root, adrId);
    if (!existsSync(file)) throw errSchema(`staged ADR file missing: ${file} (architect must write it first)`);
    const { data } = parse(readFileSync(file, 'utf8'));
    const { valid, errors } = validate(adrSchema, data);
    if (!valid) throw errSchema(`${adrId} frontmatter invalid: ${errors.map((e) => `${e.pointer} ${e.message}`).join('; ')}`);
    if (data.status !== 'proposed') throw errSchema(`${adrId} must be status:proposed to stage (is ${data.status})`);
    if (!req.adrs.some((a) => a.id === adrId)) {
      req.adrs.push({ id: adrId, status: 'proposed', governs: data.governs ?? [], title: data.title, acceptedAt: null });
    }
    staged.push(adrId);
  }

  const preconditions = buildPreconditions(root);
  const result = applyTransition(req, 'ADR_PROPOSED', { preconditions, by: 'engine', note: `staged ${staged.length} ADR(s)`, clock: opts.clock });
  if (result.changed) req.awaiting = null;
  save(root, state, opts);
  return ok({ req: id, staged, status: req.status }, `staged ${staged.length} ADR(s): ${staged.join(', ')} -> ${req.status}`);
}

// Flip a staged ADR (proposed -> accepted|rejected) in state AND its markdown.
function flipAdr(root, req, adrId, newStatus, opts) {
  const entry = req.adrs.find((a) => a.id === adrId);
  if (!entry) throw errGate(`ADR ${adrId} is not staged on ${req.id}`, { adr: adrId });
  if (entry.status !== 'proposed') throw errGate(`ADR ${adrId} is ${entry.status}, not proposed`, { adr: adrId });
  entry.status = newStatus;
  if (newStatus === 'accepted') entry.acceptedAt = opts.clock ? opts.clock() : new Date().toISOString();
  const file = adrPath(root, adrId);
  if (existsSync(file)) {
    const doc = parse(readFileSync(file, 'utf8'));
    doc.data.status = newStatus;
    writeFileSync(file, stringify(doc));
  }
  return entry;
}

// accept-adr --req --adr  (the G2 verb: proposed -> accepted)
function handleAcceptAdr(ctx) {
  const { root, opts } = ctx;
  const id = ctx.values.req;
  const adrId = ctx.values.adr;
  if (!id) throw errUsage('accept-adr requires --req');
  if (!adrId) throw errUsage('accept-adr requires --adr');
  const { state, req } = loadReq(root, id, opts);
  flipAdr(root, req, adrId, 'accepted', opts);
  save(root, state, opts);
  saveGovernsIndex(root, buildGovernsIndex(root, state, opts.clock)); // keep the gate's index current
  markArchStale(root); // accepted-ADR set changed -> ARCHITECTURE must be regenerated before DONE
  const remaining = req.adrs.filter((a) => a.status === 'proposed').length;
  // Surface the staleness now, where it is introduced, instead of letting it ambush the
  // final `engine verify`. (The DONE gate still hard-blocks until `arch-sync` runs.)
  return ok(
    { req: id, adr: adrId, status: 'accepted', proposedRemaining: remaining, architectureStale: true },
    `accepted ${adrId} (${remaining} ADR(s) still proposed). ARCHITECTURE.md is now stale — run \`engine arch-sync\` before DONE.`,
  );
}

// decide --id --adr --verdict accept|reject|modify [--note]  (records a per-ADR
// verdict; transitions are the skill's job). accept reuses the G2 flip.
function handleDecide(ctx) {
  const { root, opts } = ctx;
  const id = ctx.values.id;
  const adrId = ctx.values.adr;
  const verdict = ctx.values.verdict;
  if (!id) throw errUsage('decide requires --id');
  if (!adrId) throw errUsage('decide requires --adr');
  if (!['accept', 'reject', 'modify'].includes(verdict)) throw errUsage('decide requires --verdict accept|reject|modify');
  const { state, req } = loadReq(root, id, opts);
  const entry = req.adrs.find((a) => a.id === adrId);
  if (!entry) throw errGate(`ADR ${adrId} is not staged on ${id}`, { adr: adrId });

  if (verdict === 'accept') flipAdr(root, req, adrId, 'accepted', opts);
  else if (verdict === 'reject') flipAdr(root, req, adrId, 'rejected', opts);
  // modify: leave proposed; the /sd:decide command routes the request to REVISING_ADR.
  save(root, state, opts);
  saveGovernsIndex(root, buildGovernsIndex(root, state, opts.clock));
  const stale = verdict !== 'modify';
  if (stale) markArchStale(root);
  const remaining = req.adrs.filter((a) => a.status === 'proposed').length;
  const note = stale ? ' ARCHITECTURE.md is now stale — run `engine arch-sync` before DONE.' : '';
  return ok(
    { req: id, adr: adrId, verdict, status: entry.status, proposedRemaining: remaining, architectureStale: stale },
    `${adrId}: ${verdict} -> ${entry.status} (${remaining} still proposed).${note}`,
  );
}

// adr next [--count N]  (read-only: reserve the next gap-aware ADR ids for the
// architect, considering BOTH staged state and any docs/adrs/*.md files on disk)
function handleAdrNext(ctx) {
  const { root, opts } = ctx;
  if (!isWorkflowRepo(root)) throw errNotRepo();
  const count = ctx.values.count ? Number(ctx.values.count) : 1;
  if (!Number.isInteger(count) || count < 1 || count > 50) throw errUsage('--count must be 1..50');
  const { state } = load(root, opts);
  const known = new Set();
  for (const r of Object.values(state.requests)) for (const a of r.adrs) known.add(a.id);
  const adrsDir = docsPaths(root).adrsDir;
  if (existsSync(adrsDir)) {
    for (const f of readdirSync(adrsDir)) {
      const m = /^(adr-\d{4})\.md$/.exec(f);
      if (m && RE.adr.test(m[1])) known.add(m[1]);
    }
  }
  const ids = [];
  const pool = new Set(known);
  for (let i = 0; i < count; i++) {
    const id = nextAdrId(pool);
    ids.push(id);
    pool.add(id);
  }
  return ok({ ids, count }, ids.join('\n'));
}

export const adrCommands = {
  'adr next': {
    summary: 'reserve the next gap-aware ADR id(s) (read-only)',
    options: { count: { type: 'string' } },
    handler: handleAdrNext,
  },
  'decisions write': {
    summary: 'persist + validate the architect DecisionQuestionSet handoff',
    options: { req: { type: 'string' }, from: { type: 'string' } },
    handler: handleDecisionsWrite,
  },
  'adr stage': {
    summary: 'register staged ADRs from the DQS and advance to ADR_PROPOSED',
    options: { request: { type: 'string' }, from: { type: 'string' } },
    handler: handleAdrStage,
  },
  'accept-adr': {
    summary: 'the G2 verb: flip a proposed ADR to accepted',
    options: { req: { type: 'string' }, adr: { type: 'string' } },
    handler: handleAcceptAdr,
  },
  decide: {
    summary: 'record a per-ADR verdict (accept|reject|modify)',
    options: { id: { type: 'string' }, adr: { type: 'string' }, verdict: { type: 'string' }, note: { type: 'string' } },
    handler: handleDecide,
  },
};
