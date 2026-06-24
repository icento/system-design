// governs.mjs — the accepted-ADR reverse index. The implement gate reads ONLY this
// cached sidecar (docs/.governs-index.json) + state, never re-walking docs/adrs/.
// Keyed off canonical accepted-ADR `governs[]`, so it survives request archival.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from './frontmatter.mjs';
import { adrPath, docsPaths } from './paths.mjs';
import { globMatches } from './tier.mjs';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// Build the index from accepted ADRs in state, reading governs/constraints from the
// canonical ADR markdown when present.
export function buildGovernsIndex(root, state, clock) {
  const entries = [];
  const globIndex = [];
  const seen = new Set();
  for (const req of Object.values(state.requests)) {
    for (const a of req.adrs ?? []) {
      if (a.status !== 'accepted' || seen.has(a.id)) continue;
      seen.add(a.id);
      let governs = a.governs ?? [];
      let constraints = { forbids: [], requires: [] };
      const file = adrPath(root, a.id);
      if (existsSync(file)) {
        const d = parse(readFileSync(file, 'utf8')).data;
        governs = d.governs ?? governs;
        constraints = { forbids: d.constraints?.forbids ?? [], requires: d.constraints?.requires ?? [] };
      }
      entries.push({ adr: a.id, status: 'accepted', governs, constraints });
      for (const glob of governs) globIndex.push({ glob, adr: a.id });
    }
  }
  entries.sort((x, y) => (x.adr < y.adr ? -1 : 1));
  globIndex.sort((x, y) => (x.glob === y.glob ? (x.adr < y.adr ? -1 : 1) : x.glob < y.glob ? -1 : 1));
  const acceptedSetHash = sha256(JSON.stringify(entries.map((e) => [e.adr, e.governs, e.constraints])));
  return {
    version: 1,
    builtAt: clock ? clock() : new Date().toISOString(),
    acceptedSetHash,
    entries,
    globIndex,
  };
}

export function indexPath(root) {
  return resolve(docsPaths(root).docs, '.governs-index.json');
}

export function saveGovernsIndex(root, index) {
  writeFileSync(indexPath(root), JSON.stringify(index, null, 2) + '\n');
  return indexPath(root);
}

export function readGovernsIndex(root) {
  const p = indexPath(root);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

// Which accepted ADRs govern `relPath`? Returns [{adr, glob, constraints}].
export function governedBy(index, relPath) {
  if (!index) return [];
  const hits = [];
  for (const { glob, adr } of index.globIndex) {
    if (globMatches(glob, relPath)) {
      const entry = index.entries.find((e) => e.adr === adr);
      hits.push({ adr, glob, constraints: entry?.constraints ?? { forbids: [], requires: [] } });
    }
  }
  return hits;
}
