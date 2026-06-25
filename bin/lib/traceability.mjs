// traceability.mjs — the REQ -> STEP -> TEST matrix and its holes. Used by
// plan-check (structural, at PLANNED) and by verify/the DONE gate (with a resolved
// test index, at VERIFYING). Pure: callers supply parsed inputs.
//
// v1 honest scope: a test reference is `path::name`. The matrix checks existence
// of a declared/resolvable reference, NOT that the test actually exercises the REQ
// — that judgment is the qa-verifier's job.

// computeMatrix({ specRequirements, planSteps, testIndex })
//   specRequirements: string[] of REQ ids declared in the SPEC
//   planSteps: [{ id, satisfies:[REQ], tests:[ref], status }]
//   testIndex: Set<ref> of resolvable test refs, or null to skip resolution
//              (a dangling ref is only a hole for a step that is `done`)
export function computeMatrix({ specRequirements = [], planSteps = [], testIndex = null }) {
  const reqSet = new Set(specRequirements);
  const coverByReq = new Map(specRequirements.map((r) => [r, []]));

  const stepWithoutTest = [];
  const danglingSatisfies = [];
  const danglingTestRef = [];
  const stepNotDone = []; // only meaningful at the DONE gate (testIndex provided)

  for (const step of planSteps) {
    if (!step.tests || step.tests.length === 0) stepWithoutTest.push(step.id);
    for (const r of step.satisfies ?? []) {
      if (!reqSet.has(r)) danglingSatisfies.push({ step: step.id, req: r });
      else coverByReq.get(r).push(step.id);
    }
    if (testIndex) {
      // A dangling test ref is only a hole for a `done` step (per the contract above):
      // a not-yet-done step whose test file isn't written yet is flagged via stepNotDone,
      // not as a missing-test ref.
      if (step.status !== 'done') stepNotDone.push(step.id);
      else {
        for (const t of step.tests ?? []) {
          if (!testIndex.has(t)) danglingTestRef.push({ step: step.id, testRef: t });
        }
      }
    }
  }

  const reqWithoutStep = specRequirements.filter((r) => coverByReq.get(r).length === 0);

  // covered: REQ has >=1 step AND (no test index, or each satisfying step's tests
  // are all resolvable). At plan-check time (no index) covered == has-a-step.
  const rows = specRequirements.map((req) => {
    const steps = coverByReq.get(req);
    let covered = steps.length > 0;
    if (covered && testIndex) {
      covered = steps.every((sid) => {
        const step = planSteps.find((s) => s.id === sid);
        return (step.tests ?? []).length > 0 && (step.tests ?? []).every((t) => testIndex.has(t));
      });
    }
    return { req, steps, covered };
  });

  const holes = { reqWithoutStep, stepWithoutTest, danglingSatisfies, danglingTestRef, stepNotDone };
  const complete =
    reqWithoutStep.length === 0 &&
    stepWithoutTest.length === 0 &&
    danglingSatisfies.length === 0 &&
    danglingTestRef.length === 0 &&
    stepNotDone.length === 0;

  return { rows, holes, complete };
}

// Flatten holes into human strings for EGATE output.
export function holeStrings(holes) {
  const out = [];
  for (const r of holes.reqWithoutStep) out.push(`${r} has no plan step`);
  for (const s of holes.stepWithoutTest) out.push(`${s} has no test`);
  for (const d of holes.danglingSatisfies) out.push(`${d.step} satisfies unknown ${d.req}`);
  for (const d of holes.danglingTestRef) out.push(`${d.step} references missing test ${d.testRef}`);
  for (const s of holes.stepNotDone ?? []) out.push(`${s} is not done`);
  return out;
}
