// actions/arch.mjs — generate/refresh docs/ARCHITECTURE.md from accepted ADRs and
// gate DONE on its freshness (M6). `arch-sync` regenerates; `arch-sync --check`
// reports staleness without writing (exit 6 when stale).

import { writeFileSync } from 'node:fs';
import { ok, errNotRepo, errIllegal } from '../output.mjs';
import { load, isWorkflowRepo, statePaths } from '../state.mjs';
import { docsPaths } from '../paths.mjs';
import { generateArchitecture, archSourceHash, recordedHash, clearArchStale } from '../arch.mjs';

function handleArchSync(ctx) {
  const { root, opts } = ctx;
  if (!isWorkflowRepo(root)) throw errNotRepo();
  const { state } = load(root, opts);
  const frozenClock = ctx.values['frozen-clock'] === true;

  if (ctx.values.check === true) {
    const current = archSourceHash(root, state);
    const recorded = recordedHash(root);
    if (recorded !== current) {
      throw errIllegal('ARCHITECTURE.md is stale (accepted ADRs changed); run `arch-sync`', { stale: true, recorded, current });
    }
    return ok({ stale: false, hash: current }, 'ARCHITECTURE.md is fresh.');
  }

  const { text, sourceHash, adrCount } = generateArchitecture(root, state, { frozenClock, clock: opts.clock });
  writeFileSync(docsPaths(root).architecture, text);
  writeFileSync(statePaths(root).archHash, sourceHash + '\n');
  clearArchStale(root);
  return ok(
    { action: 'regenerate-architecture', adrs: adrCount, hash: sourceHash, path: docsPaths(root).architecture },
    `wrote ARCHITECTURE.md (${adrCount} accepted ADR(s)).`,
  );
}

export const archCommands = {
  'arch-sync': {
    summary: 'regenerate ARCHITECTURE.md from accepted ADRs (--check for staleness only)',
    options: { check: { type: 'boolean' }, 'frozen-clock': { type: 'boolean' } },
    handler: handleArchSync,
  },
};
