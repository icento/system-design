// state.mjs — the ONLY reader/writer of docs/.state.json. Guarantees:
//   * Atomic writes (write .state.tmp in the same dir, fsync, rename over .state.json).
//   * A .state.bak snapshot of the prior good state for recovery.
//   * Exclusive locking via .state.lock (stale locks auto-broken after a timeout).
//   * Schema validation BEFORE every write — invalid state is refused, leaving the
//     prior file intact (never persists invalid state).
//   * Crash recovery: a leftover .state.tmp or a corrupt .state.json falls back to
//     .state.bak.
// Every other component treats state as read-only and shells out to the engine.

import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  copyFileSync,
  unlinkSync,
  openSync,
  closeSync,
  fsyncSync,
  statSync,
  mkdirSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { validate } from './jsonschema.mjs';
import { loadSchema } from './schemas.mjs';
import { errState, errWrite, errNotRepo } from './output.mjs';

export const STATE_VERSION = 1;
const LOCK_STALE_MS = 60_000;

export function statePaths(root) {
  const dir = resolve(root, 'docs');
  return {
    dir,
    json: resolve(dir, '.state.json'),
    bak: resolve(dir, '.state.bak'),
    tmp: resolve(dir, '.state.tmp'),
    lock: resolve(dir, '.state.lock'),
    archHash: resolve(dir, '.arch-hash'),
    archStale: resolve(dir, '.architecture-stale'),
    governsIndex: resolve(dir, '.governs-index.json'),
  };
}

export function isWorkflowRepo(root) {
  return existsSync(statePaths(root).json);
}

export function clockNow() {
  return new Date().toISOString();
}

// Deterministic, stable JSON serialization for the state file (trailing newline).
function serialize(state) {
  return JSON.stringify(state, null, 2) + '\n';
}

function parseAndValidate(text, schema) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: `JSON parse error: ${e.message}` };
  }
  if (obj && typeof obj === 'object' && Number(obj.version) > STATE_VERSION) {
    return { ok: false, reason: `state version ${obj.version} is newer than supported ${STATE_VERSION}`, newer: true };
  }
  const { valid, errors } = validate(schema, obj);
  if (!valid) {
    return { ok: false, reason: `schema invalid: ${errors.map((e) => `${e.pointer} ${e.message}`).join('; ')}` };
  }
  return { ok: true, state: obj };
}

// Recover the canonical .state.json from a leftover .tmp or the .bak snapshot.
// Returns true if recovery happened. Best-effort; never throws.
function recoverInPlace(paths) {
  if (!existsSync(paths.json)) {
    if (existsSync(paths.tmp)) {
      try {
        renameSync(paths.tmp, paths.json);
        return true;
      } catch {
        /* fall through */
      }
    }
    if (existsSync(paths.bak)) {
      try {
        copyFileSync(paths.bak, paths.json);
        return true;
      } catch {
        /* fall through */
      }
    }
  }
  return false;
}

// Load + validate state. Falls back to .bak on corruption.
export function load(root, opts = {}) {
  const paths = statePaths(root);
  const schema = loadSchema('state', opts);
  recoverInPlace(paths);
  if (!existsSync(paths.json)) throw errNotRepo();

  const primary = parseAndValidate(readFileSync(paths.json, 'utf8'), schema);
  if (primary.ok) return { state: primary.state, paths };
  if (primary.newer) throw errState(primary.reason);

  // Primary bad: try the backup.
  if (existsSync(paths.bak)) {
    const backup = parseAndValidate(readFileSync(paths.bak, 'utf8'), schema);
    if (backup.ok) {
      // Restore the good backup over the corrupt primary.
      try {
        copyFileSync(paths.bak, paths.json);
      } catch {
        /* read-only restore still returns the good state */
      }
      return { state: backup.state, paths, recoveredFromBak: true };
    }
  }
  throw errState(`state corrupt and no valid backup: ${primary.reason}`);
}

// Acquire an exclusive lock; break a stale lock after LOCK_STALE_MS. Throws EWRITE
// on live contention.
function acquireLock(paths) {
  try {
    const fd = openSync(paths.lock, 'wx');
    writeFileSync(paths.lock, `${process.pid} ${Date.now()}\n`);
    return fd;
  } catch (e) {
    if (e.code !== 'EEXIST') throw errWrite(`cannot create lock: ${e.message}`);
    // Lock exists — break it only if stale.
    let stale = false;
    try {
      stale = Date.now() - statSync(paths.lock).mtimeMs > LOCK_STALE_MS;
    } catch {
      stale = true;
    }
    if (!stale) throw errWrite('state is locked by another process');
    try {
      unlinkSync(paths.lock);
    } catch {
      throw errWrite('failed to break stale lock');
    }
    const fd = openSync(paths.lock, 'wx');
    writeFileSync(paths.lock, `${process.pid} ${Date.now()}\n`);
    return fd;
  }
}

function releaseLock(paths, fd) {
  try {
    if (fd !== undefined) closeSync(fd);
  } catch {
    /* ignore */
  }
  try {
    if (existsSync(paths.lock)) unlinkSync(paths.lock);
  } catch {
    /* ignore */
  }
}

// Validate, then atomically persist state. Refuses to write invalid state (the
// prior file stays intact). Stamps updatedAt. `opts.clock` overrides the timestamp.
export function save(root, state, opts = {}) {
  const paths = statePaths(root);
  const schema = loadSchema('state', opts);
  if (!existsSync(paths.dir)) mkdirSync(paths.dir, { recursive: true });

  state.version = STATE_VERSION;
  state.updatedAt = opts.clock ? opts.clock() : clockNow();

  const { valid, errors } = validate(schema, state);
  if (!valid) {
    throw errState(`refusing to save invalid state: ${errors.map((e) => `${e.pointer} ${e.message}`).join('; ')}`);
  }

  const fd = acquireLock(paths);
  try {
    const text = serialize(state);
    // 1) write the new content to a temp file in the same dir and fsync it.
    const tfd = openSync(paths.tmp, 'w');
    try {
      writeFileSync(tfd, text);
      fsyncSync(tfd);
    } finally {
      closeSync(tfd);
    }
    // 2) snapshot the current good file as .bak.
    if (existsSync(paths.json)) {
      copyFileSync(paths.json, paths.bak);
    }
    // 3) atomic rename over the canonical file.
    renameSync(paths.tmp, paths.json);
  } catch (e) {
    // Clean up a partial temp; never leave a stray .tmp.
    try {
      if (existsSync(paths.tmp)) unlinkSync(paths.tmp);
    } catch {
      /* ignore */
    }
    if (e && e.code !== undefined && e.name === undefined) throw errWrite(`atomic write failed: ${e.message}`);
    throw e;
  } finally {
    releaseLock(paths, fd);
  }
  return paths;
}

// The initial empty state document.
export function emptyState(opts = {}) {
  const now = opts.clock ? opts.clock() : clockNow();
  return {
    version: STATE_VERSION,
    updatedAt: now,
    meta: { createdAt: now, tool: 'system-design', engineVersion: opts.engineVersion ?? '0.1.0' },
    requests: {},
  };
}

// Read a request record or throw ENOREQUEST-style (caller maps to errNoRequest).
export function getRequest(state, id) {
  return state.requests[id];
}
