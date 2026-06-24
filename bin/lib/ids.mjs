// ids.mjs — the frozen ID grammar and minting/cross-reference helpers.
//
//   req-NNNN          request            (NNNN = 4-digit, repo-global, gap-aware)
//   adr-NNNN          ADR                (repo-global, gap-aware)
//   REQ-NNNN-NN       requirement        (NNNN = owning request, NN = per-request)
//   STEP-NNN          plan step          (per-request)
//   (aposd|tiger|house)-<slug>   principle
//   <path>::<name>    test reference
//   ovr-N             override entry     (per-request, monotonic)

export const RE = Object.freeze({
  req: /^req-(\d{4})$/,
  adr: /^adr-(\d{4})$/,
  reqItem: /^REQ-(\d{4})-(\d{2})$/,
  step: /^STEP-(\d{3})$/,
  principle: /^(aposd|tiger|house)-[a-z0-9]+(-[a-z0-9]+)*$/,
  testRef: /^.+::.+$/,
  override: /^ovr-(\d+)$/,
});

export const isReqId = (s) => typeof s === 'string' && RE.req.test(s);
export const isAdrId = (s) => typeof s === 'string' && RE.adr.test(s);
export const isReqItemId = (s) => typeof s === 'string' && RE.reqItem.test(s);
export const isStepId = (s) => typeof s === 'string' && RE.step.test(s);
export const isPrincipleId = (s) => typeof s === 'string' && RE.principle.test(s);
export const isTestRef = (s) => typeof s === 'string' && RE.testRef.test(s);

const pad = (n, width) => String(n).padStart(width, '0');

export const reqId = (n) => `req-${pad(n, 4)}`;
export const adrId = (n) => `adr-${pad(n, 4)}`;
export const reqItemId = (owner, idx) => `REQ-${pad(owner, 4)}-${pad(idx, 2)}`;
export const stepId = (idx) => `STEP-${pad(idx, 3)}`;
export const overrideId = (n) => `ovr-${n}`;

// Numeric component extractors (return NaN on malformed input).
export const reqNum = (s) => {
  const m = RE.req.exec(s);
  return m ? Number(m[1]) : NaN;
};
export const adrNum = (s) => {
  const m = RE.adr.exec(s);
  return m ? Number(m[1]) : NaN;
};
// Owning request number embedded in a REQ-NNNN-NN id.
export const reqItemOwner = (s) => {
  const m = RE.reqItem.exec(s);
  return m ? Number(m[1]) : NaN;
};

// Gap-aware mint: max(existing numeric ids) + 1, so deleting/archiving a request
// never recycles an id. `existing` is any iterable of id strings.
function nextNum(existing, re) {
  let max = 0;
  for (const id of existing) {
    const m = re.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export const nextReqId = (existing) => reqId(nextNum(existing, RE.req));
export const nextAdrId = (existing) => adrId(nextNum(existing, RE.adr));

// Cross-reference check: every REQ-NNNN-NN under a request must name that request
// as its owner. Returns the list of offending requirement ids (empty == ok).
export function reqItemOwnershipViolations(ownerReqId, requirementIds) {
  const owner = reqNum(ownerReqId);
  const bad = [];
  for (const rid of requirementIds) {
    if (!isReqItemId(rid) || reqItemOwner(rid) !== owner) bad.push(rid);
  }
  return bad;
}
