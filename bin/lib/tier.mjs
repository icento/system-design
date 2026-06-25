// tier.mjs — tier classification heuristics and glob matching.
//
// Tiers gate cost: TRIVIAL (CHANGELOG line only), STANDARD (SPEC+PLAN, optional
// ADRs), DEEP (full machine + traceability). Classification is a *recommendation*;
// the human/skill applies it. Auto-escalation to DEEP (M5) reuses the same signals.

export const TIERS = ['TRIVIAL', 'STANDARD', 'DEEP'];

// The tier the intake SIGNALS alone recommend, ignoring any caller hint. This is the
// disciplined recommendation; the hint is a prior, not an override of it.
//   touchesAdr / addsDep  -> hard DEEP signals (architecture is in play)
//   files                 -> rough size signal
function signalTier({ touchesAdr = false, addsDep = false, files } = {}) {
  let tier = 'STANDARD';
  if (typeof files === 'number') {
    if (files <= 1) tier = 'TRIVIAL';
    else if (files > 5) tier = 'STANDARD';
  }
  if (touchesAdr || addsDep) tier = 'DEEP'; // hard DEEP signals win over size
  return tier;
}

// Recommend a tier from intake signals plus an optional caller hint. Returns
// { tier, reasons[], signalTier } where `signalTier` is the hint-free recommendation.
// The hint sets a baseline but never silently buries the signals: when it disagrees
// with `signalTier`, `reasons` says so (and hard DEEP signals still force DEEP), so a
// hint stops being a rubber stamp and the disagreement is surfaced to confirm.
export function classifyTier({ touchesAdr = false, addsDep = false, files, hint } = {}) {
  const reasons = [];
  let tier = 'STANDARD';
  const signal = signalTier({ touchesAdr, addsDep, files });

  if (hint && TIERS.includes(String(hint).toUpperCase())) {
    tier = String(hint).toUpperCase();
    reasons.push(`hint=${tier}`);
  }

  if (typeof files === 'number') {
    if (files <= 1 && tier !== 'DEEP') {
      tier = 'TRIVIAL';
      reasons.push(`few files (${files}) -> TRIVIAL`);
    } else if (files > 5) {
      tier = escalate(tier, 'STANDARD');
      reasons.push(`many files (${files}) -> >= STANDARD`);
    }
  }

  // Hard DEEP signals override everything below DEEP.
  if (touchesAdr) {
    tier = 'DEEP';
    reasons.push('edits an accepted-ADR-governed area -> DEEP');
  }
  if (addsDep) {
    tier = 'DEEP';
    reasons.push('adds a new dependency -> DEEP');
  }

  // Surface a hint that disagrees with the signal-based recommendation.
  const hintTier = hint && TIERS.includes(String(hint).toUpperCase()) ? String(hint).toUpperCase() : null;
  if (hintTier && hintTier !== signal) {
    reasons.push(`signals suggest ${signal}; hint says ${hintTier} — confirm`);
  }

  if (reasons.length === 0) reasons.push('default STANDARD');
  return { tier, reasons, signalTier: signal };
}

// Raise `tier` to at least `floor` (never lower).
function escalate(tier, floor) {
  return TIERS.indexOf(tier) >= TIERS.indexOf(floor) ? tier : floor;
}

// Glob -> RegExp. `**` crosses path separators (and `**/` is optional-prefix so
// `src/**/x` matches `src/x`); `*` stays within a segment; `?` is one non-slash char.
export function globToRegExp(glob) {
  let out = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        out += '(?:.*/)?';
        i += 3;
      } else {
        out += '.*';
        i += 2;
      }
    } else if (c === '*') {
      out += '[^/]*';
      i++;
    } else if (c === '?') {
      out += '[^/]';
      i++;
    } else {
      out += /[.+^${}()|[\]\\]/.test(c) ? '\\' + c : c;
      i++;
    }
  }
  return new RegExp('^' + out + '$');
}

export function globMatches(glob, path) {
  return globToRegExp(glob).test(path);
}
