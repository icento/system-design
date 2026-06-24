// actions/governance.mjs — the governs reverse-index, override audit trail, and
// per-request config (M5). These feed the implement gate.

import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { ok, errNoRequest, errNotRepo, errUsage } from '../output.mjs';
import { load, save, isWorkflowRepo } from '../state.mjs';
import { requestPaths } from '../paths.mjs';
import { buildGovernsIndex, saveGovernsIndex, readGovernsIndex, governedBy } from '../governs.mjs';
import { overrideId, isAdrId } from '../ids.mjs';

function loadReq(root, id, opts) {
  if (!isWorkflowRepo(root)) throw errNotRepo();
  const { state } = load(root, opts);
  const req = state.requests[id];
  if (!req) throw errNoRequest(`request ${id} not found`, { id });
  return { state, req };
}

// sync-index: rebuild docs/.governs-index.json from accepted ADRs.
function handleSyncIndex(ctx) {
  const { root, opts } = ctx;
  if (!isWorkflowRepo(root)) throw errNotRepo();
  const { state } = load(root, opts);
  const index = buildGovernsIndex(root, state, opts.clock);
  const path = saveGovernsIndex(root, index);
  return ok({ path, entries: index.entries.length, globs: index.globIndex.length }, `governs-index: ${index.entries.length} accepted ADR(s), ${index.globIndex.length} glob(s).`);
}

// governs --path <p>: which accepted ADRs govern a path.
function handleGoverns(ctx) {
  const { root } = ctx;
  if (!isWorkflowRepo(root)) throw errNotRepo();
  const path = ctx.values.path;
  if (!path) throw errUsage('governs requires --path');
  const index = readGovernsIndex(root);
  const hits = governedBy(index, path);
  return ok(
    { path, governed: hits.length > 0, adrs: hits.map((h) => ({ id: h.adr, glob: h.glob, status: 'accepted' })) },
    hits.length ? `${path} governed by ${hits.map((h) => h.adr).join(', ')}` : `${path} is not governed`,
  );
}

// override add --req --path|--glob --reason --scope once|session|request [--adr]
function handleOverrideAdd(ctx) {
  const { root, opts } = ctx;
  const id = ctx.values.req;
  if (!id) throw errUsage('override add requires --req');
  const glob = ctx.values.glob ?? null;
  const path = ctx.values.path ?? null;
  if (!glob && !path) throw errUsage('override add requires --path or --glob');
  const reason = ctx.values.reason;
  if (!reason) throw errUsage('override add requires --reason');
  const scope = ctx.values.scope ?? 'once';
  if (!['once', 'session', 'request'].includes(scope)) throw errUsage('--scope must be once|session|request');
  const adr = ctx.values.adr ?? null;
  if (adr && !isAdrId(adr)) throw errUsage(`invalid --adr ${adr}`);

  const { state, req } = loadReq(root, id, opts);
  const n = (req.overrides ?? []).length + 1;
  const now = opts.clock ? opts.clock() : new Date().toISOString();
  const by = ctx.values.by || process.env.SD_USER || process.env.USER || 'unknown';
  const entry = { id: overrideId(n), glob, path, adr, reason: String(reason), by, ts: now, scope, consumedAt: null };
  req.overrides.push(entry);
  save(root, state, opts);

  // Append to the canonical audit log.
  const rp = requestPaths(root, id);
  if (!existsSync(rp.qaDir)) mkdirSync(rp.qaDir, { recursive: true });
  appendFileSync(rp.overridesLog, `${now}\t${entry.id}\t${by}\t${scope}\t${glob ?? path}\t${adr ?? '-'}\t${reason}\n`);

  return ok({ req: id, override: entry.id, scope }, `override ${entry.id} added (${scope}) for ${glob ?? path}.`);
}

// config set --id <key> <value>
function handleConfigSet(ctx) {
  const { root, opts } = ctx;
  const id = ctx.values.id;
  if (!id) throw errUsage('config set requires --id');
  const [key, value] = ctx.positionals;
  if (!key || value === undefined) throw errUsage('config set <key> <value> --id <req>');
  const { state, req } = loadReq(root, id, opts);
  if (key === 'enforcement') {
    if (!['warn', 'deny'].includes(value)) throw errUsage('enforcement must be warn|deny');
    req.config.enforcement = value;
  } else if (key === 'tigerLintBlocking') {
    if (!['true', 'false'].includes(value)) throw errUsage('tigerLintBlocking must be true|false');
    req.config.tigerLintBlocking = value === 'true';
  } else {
    throw errUsage(`unknown config key "${key}" (enforcement|tigerLintBlocking)`);
  }
  save(root, state, opts);
  return ok({ id, key, value: req.config[key] }, `${id} config ${key} = ${req.config[key]}`);
}

export const governanceCommands = {
  'sync-index': { summary: 'rebuild the accepted-ADR governs index', options: {}, handler: handleSyncIndex },
  governs: { summary: 'query which accepted ADRs govern a path', options: { path: { type: 'string' } }, handler: handleGoverns },
  'override add': {
    summary: 'add an audited edit override (scope once|session|request)',
    options: { req: { type: 'string' }, path: { type: 'string' }, glob: { type: 'string' }, reason: { type: 'string' }, scope: { type: 'string' }, adr: { type: 'string' }, by: { type: 'string' } },
    handler: handleOverrideAdd,
  },
  'config set': {
    summary: 'set per-request config (enforcement|tigerLintBlocking)',
    options: { id: { type: 'string' } },
    handler: handleConfigSet,
  },
};
