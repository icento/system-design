// tier.mjs — tier classification heuristics and glob matching.
//
// Tiers gate cost: TRIVIAL (CHANGELOG line only), STANDARD (SPEC+PLAN, optional
// ADRs), DEEP (full machine + traceability). Classification is a *recommendation*;
// the human/skill applies it. Auto-escalation to DEEP (M5) reuses the same signals.

export const TIERS = ['TRIVIAL', 'STANDARD', 'DEEP'];

// Recommend a tier from intake signals. Returns { tier, reasons[] }.
//   touchesAdr / addsDep  -> hard DEEP signals (architecture is in play)
//   files                 -> rough size signal
//   hint                  -> caller's prior belief (TRIVIAL|STANDARD|DEEP)
export function classifyTier({ touchesAdr = false, addsDep = false, files, hint } = {}) {
  const reasons = [];
  let tier = 'STANDARD';

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

  if (reasons.length === 0) reasons.push('default STANDARD');
  return { tier, reasons };
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
