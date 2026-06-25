// actions/verify.mjs — verification + traceability subcommands (M5): verify, trace,
// step-done, gate-done. `verify`/`gate-done` are the DONE pre-gate: REQ->STEP->TEST
// must be complete and (M6) ARCHITECTURE must be fresh.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ok, errNoRequest, errNotRepo, errUsage, errGate } from '../output.mjs';
import { parse, stringify } from '../frontmatter.mjs';
import { load, isWorkflowRepo, statePaths } from '../state.mjs';
import { requestPaths, traceabilityResult, readQaVerdict } from '../paths.mjs';
import { stepId } from '../ids.mjs';

function loadReq(root, id, opts) {
  if (!isWorkflowRepo(root)) throw errNotRepo();
  const { state } = load(root, opts);
  const req = state.requests[id];
  if (!req) throw errNoRequest(`request ${id} not found`, { id });
  return { state, req };
}

const archStale = (root) => existsSync(statePaths(root).archStale);

function handleVerify(ctx) {
  const { root, opts } = ctx;
  const id = ctx.values.id;
  if (!id) throw errUsage('verify requires --id');
  const { req } = loadReq(root, id, opts);
  const trace = traceabilityResult(root, req);
  const stale = archStale(root);
  const okNow = trace.ok && !stale;
  const result = {
    id,
    ok: okNow,
    traceability: { complete: trace.ok, holes: trace.holes },
    architectureStale: stale,
  };
  if (!okNow) {
    const reasons = [...trace.holes];
    if (stale) reasons.push('ARCHITECTURE.md is stale — run `engine arch-sync` (no flags; --check only reports) to regenerate, then re-run verify');
    throw errGate(`verification failed: ${reasons.join('; ')}`, result);
  }
  return ok(result, `verified ${id}: traceability complete, architecture fresh.`);
}

function handleTrace(ctx) {
  const { root, opts } = ctx;
  const id = ctx.values.id;
  if (!id) throw errUsage('trace requires --id');
  const { req } = loadReq(root, id, opts);
  const { matrix } = traceabilityResult(root, req);
  const human = matrix.rows.length
    ? matrix.rows.map((r) => `  ${r.req} ${r.covered ? 'OK' : 'HOLE'} <- ${r.steps.join(', ') || '(no step)'}`).join('\n')
    : '  (no requirements)';
  return ok({ id, ...matrix }, `traceability for ${id}:\n${human}`);
}

function handleStepDone(ctx) {
  const { root, opts } = ctx;
  const id = ctx.values.id;
  const stepArg = ctx.values.step;
  if (!id) throw errUsage('step-done requires --id');
  if (!stepArg) throw errUsage('step-done requires --step (a number or STEP-NNN)');
  const { req } = loadReq(root, id, opts);
  void req;
  const planPath = requestPaths(root, id).plan;
  if (!existsSync(planPath)) throw errGate('PLAN.md does not exist', { id });
  const doc = parse(readFileSync(planPath, 'utf8'));
  const target = /^STEP-\d{3}$/.test(stepArg) ? stepArg : stepId(Number(stepArg));
  const step = (doc.data.steps ?? []).find((s) => s.id === target);
  if (!step) throw errNoRequest(`step ${target} not found in PLAN`, { step: target });
  step.status = 'done';
  writeFileSync(planPath, stringify(doc));
  const remaining = doc.data.steps.filter((s) => s.status !== 'done').length;
  return ok({ id, step: target, status: 'done', remaining }, `${target} done (${remaining} step(s) remaining).`);
}

// gate-done: the composite DONE precondition as a standalone, branchable check.
function handleGateDone(ctx) {
  const { root, opts } = ctx;
  const id = ctx.values.id;
  if (!id) throw errUsage('gate-done requires --id');
  const { req } = loadReq(root, id, opts);
  const trace = traceabilityResult(root, req);
  if (!trace.ok) throw errGate(`traceability incomplete: ${trace.holes.join('; ')}`, { holes: trace.holes });
  if (archStale(root)) throw errGate('ARCHITECTURE.md is stale; run `engine arch-sync` (no flags — --check only reports) before DONE', { stale: true });
  if (req.tier !== 'TRIVIAL') {
    const qa = readQaVerdict(root, req);
    if (!qa) throw errGate('qa/qa.verdict.json missing or invalid (run /sd:verify before DONE)', { qa: null });
    if (qa.overall !== 'PASS') throw errGate(`QA verdict is ${qa.overall}, not PASS`, { qa: qa.overall });
  }
  return ok({ id, ready: true }, `${id} is ready for DONE.`);
}

export const verifyCommands = {
  verify: { summary: 'check traceability + architecture freshness (DONE pre-gate)', options: { id: { type: 'string' } }, handler: handleVerify },
  trace: { summary: 'render the REQ->STEP->TEST matrix', options: { id: { type: 'string' } }, handler: handleTrace },
  'step-done': { summary: 'mark a PLAN step done', options: { id: { type: 'string' }, step: { type: 'string' } }, handler: handleStepDone },
  'gate-done': { summary: 'check whether a request may advance to DONE', options: { id: { type: 'string' } }, handler: handleGateDone },
};
