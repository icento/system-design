// actions/plan.mjs — PLAN structural checking (M4): plan-check. Reads SPEC + PLAN,
// validates the PLAN frontmatter, and refuses to advance on REQ-without-step,
// step-without-test, or dangling satisfies. The adversarial G3 review verdict is
// validated by validate-doc and enforced by the PLAN_OK precondition.

import { existsSync, readFileSync } from 'node:fs';
import { ok, errNoRequest, errNotRepo, errGate, errSchema, errUsage } from '../output.mjs';
import { validate } from '../jsonschema.mjs';
import { loadSchema } from '../schemas.mjs';
import { parse } from '../frontmatter.mjs';
import { load, isWorkflowRepo } from '../state.mjs';
import { requestPaths } from '../paths.mjs';
import { computeMatrix, holeStrings } from '../traceability.mjs';

function handlePlanCheck(ctx) {
  const { root, opts } = ctx;
  if (!isWorkflowRepo(root)) throw errNotRepo();
  const id = ctx.values.id;
  if (!id) throw errUsage('plan-check requires --id');
  const { state } = load(root, opts);
  const req = state.requests[id];
  if (!req) throw errNoRequest(`request ${id} not found`, { id });

  const rp = requestPaths(root, id);
  if (!existsSync(rp.plan)) throw errGate('PLAN.md does not exist', { id });
  if (!existsSync(rp.spec)) throw errGate('SPEC.md does not exist (cannot check plan coverage)', { id });

  const plan = parse(readFileSync(rp.plan, 'utf8')).data;
  const planValidation = validate(loadSchema('plan.frontmatter', { pluginRoot: ctx.pluginRoot }), plan);
  if (!planValidation.valid) {
    throw errSchema(`PLAN invalid: ${planValidation.errors.map((e) => `${e.pointer} ${e.message}`).join('; ')}`, { errors: planValidation.errors });
  }

  const spec = parse(readFileSync(rp.spec, 'utf8')).data;
  const specRequirements = (spec.requirements ?? []).map((r) => r.id);
  const matrix = computeMatrix({ specRequirements, planSteps: plan.steps ?? [], testIndex: null });

  if (!matrix.complete) {
    throw errGate(`plan incomplete: ${holeStrings(matrix.holes).join('; ')}`, { holes: matrix.holes });
  }
  return ok({ id, steps: plan.steps.length, requirements: specRequirements.length, complete: true }, `plan OK: ${plan.steps.length} step(s) cover ${specRequirements.length} requirement(s).`);
}

export const planCommands = {
  'plan-check': {
    summary: 'verify every REQ has a step and every step has a test',
    options: { id: { type: 'string' } },
    handler: handlePlanCheck,
  },
};
