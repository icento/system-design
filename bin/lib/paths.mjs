// paths.mjs — canonical filesystem layout for a workflow repo, plus the builder
// that wires fs-backed precondition dependencies. The precondition predicates that
// arrive in later milestones (planReviewVerdict @ M4, traceabilityComplete @ M5,
// archStale @ M6) are merged in HERE — this is the single wiring point, so adding
// them never touches preconditions.mjs logic.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makePreconditions } from './preconditions.mjs';
import { parse } from './frontmatter.mjs';
import { computeMatrix, holeStrings } from './traceability.mjs';

export function docsPaths(root) {
  const docs = resolve(root, 'docs');
  return {
    docs,
    adrsDir: resolve(docs, 'adrs'),
    principlesDir: resolve(docs, 'principles'),
    specDir: resolve(docs, 'spec'),
    architecture: resolve(docs, 'ARCHITECTURE.md'),
    principlesIndex: resolve(docs, 'PRINCIPLES.md'),
    principlesConfig: resolve(docs, 'principles', 'principles.config.json'),
  };
}

export function requestsRoot(root) {
  return resolve(root, 'requests');
}

export function requestDir(root, id) {
  return resolve(requestsRoot(root), id);
}

export function requestPaths(root, id) {
  const dir = requestDir(root, id);
  const qa = resolve(dir, 'qa');
  return {
    dir,
    intake: resolve(dir, 'intake.md'),
    spec: resolve(dir, 'SPEC.md'),
    plan: resolve(dir, 'PLAN.md'),
    planReview: resolve(dir, 'plan-review.md'),
    decisions: resolve(dir, 'decisions.json'),
    qaDir: qa,
    overridesLog: resolve(qa, 'overrides.log'),
    planVerdict: resolve(qa, 'plan-review.verdict.json'),
    qaVerdict: resolve(qa, 'qa.verdict.json'),
    tigerLint: resolve(qa, 'tiger-lint.json'),
  };
}

const adrPath = (root, adrId) => resolve(docsPaths(root).adrsDir, `${adrId}.md`);
export { adrPath };

// Read the plan-review verdict JSON if present and well-formed. Returns
// { verdict, blockerCount } or null. (M4 writes this file.)
function readPlanReviewVerdict(root, req) {
  const p = requestPaths(root, req.id).planVerdict;
  if (!existsSync(p)) return null;
  try {
    const v = JSON.parse(readFileSync(p, 'utf8'));
    if (v && (v.verdict === 'PASS' || v.verdict === 'REVISE') && Number.isInteger(v.blockerCount)) {
      return { verdict: v.verdict, blockerCount: v.blockerCount };
    }
    return null;
  } catch {
    return null;
  }
}

// Resolve a set of `path::name` test refs to those that actually exist (file
// present AND the name appears in it — the v1 honest scope: existence + name grep).
export function resolveTestIndex(root, planSteps) {
  const refs = new Set(planSteps.flatMap((s) => s.tests ?? []));
  const index = new Set();
  for (const ref of refs) {
    const sep = ref.indexOf('::');
    const rel = sep === -1 ? ref : ref.slice(0, sep);
    const name = sep === -1 ? '' : ref.slice(sep + 2);
    const abs = resolve(root, rel);
    if (existsSync(abs)) {
      const content = readFileSync(abs, 'utf8');
      if (!name || content.includes(name)) index.add(ref);
    }
  }
  return index;
}

// The REQ->STEP->TEST traceability result for a request (fs-aware). Used by the
// DONE precondition and `engine verify`/`engine trace`.
export function traceabilityResult(root, req) {
  const rp = requestPaths(root, req.id);
  const spec = existsSync(rp.spec) ? parse(readFileSync(rp.spec, 'utf8')).data : { requirements: [] };
  const plan = existsSync(rp.plan) ? parse(readFileSync(rp.plan, 'utf8')).data : { steps: [] };
  const specRequirements = (spec.requirements ?? []).map((r) => r.id);
  const planSteps = plan.steps ?? [];
  const matrix = computeMatrix({ specRequirements, planSteps, testIndex: resolveTestIndex(root, planSteps) });
  return { ok: matrix.complete, holes: holeStrings(matrix.holes), matrix };
}

// Build the precondition set bound to a project root. Real traceabilityComplete is
// wired here (M5); archStale stays injected (M6) — pass it via `extra`.
export function buildPreconditions(root, extra = {}) {
  return makePreconditions({
    specExists: (req) => existsSync(requestPaths(root, req.id).spec),
    planExists: (req) => existsSync(requestPaths(root, req.id).plan),
    planReviewVerdict: (req) => readPlanReviewVerdict(root, req),
    traceabilityComplete: (req) => traceabilityResult(root, req),
    archStale: () => existsSync(resolve(docsPaths(root).docs, '.architecture-stale')),
    ...extra,
  });
}
