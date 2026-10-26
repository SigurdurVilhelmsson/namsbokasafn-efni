/**
 * records.js — the per-run record directory of an AI use.
 *
 * Design: docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md, Unit D.
 *
 * Layout (production root `books/<slug>/ai-review/`, committed with the layer per
 * [USER] 2026-10-26):
 *   runs/<runId>/run.json        what the run was: use, model, effort, max_tokens, prompts
 *                                and sha256, ruling set and sha256, SDK, anthropic-version
 *                                actually sent, harness commit, mode, cap
 *   runs/<runId>/requests.jsonl  custom_id, the key it stands for, the full request body
 *   runs/<runId>/responses.jsonl custom_id, key, the raw response, stop_reason, the model
 *                                that answered, usage, cost
 *   runs/<runId>/errors.jsonl    custom_id, key, the stage that failed, whitelisted error
 *   runs/<runId>/batch.json      batch mode only: the batch id and its reservation
 *   runs/<runId>/run-end.json    how the run ended
 *
 * 🔴 No API key or header is ever written. Callers never hand headers to a writer, and
 * every writer additionally refuses (throws, writes nothing) any record whose text
 * contains one of the secrets it was given — fail-closed, because these files are
 * committed to a public repository.
 */
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './config.js';

export const RECORD_FILES = Object.freeze({
  run: 'run.json',
  requests: 'requests.jsonl',
  responses: 'responses.jsonl',
  errors: 'errors.jsonl',
  batch: 'batch.json',
  runEnd: 'run-end.json',
});

/** The Message Batches API's custom_id pattern. */
export const CUSTOM_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const RECORD_NAME_RE = /^[a-z][a-z0-9-]*\.jsonl?$/;
const MIN_SECRET_LENGTH = 8;
const MAX_CUSTOM_ID_INDEX = 999_999;

/**
 * A sortable, filesystem-safe run id: UTC time to the second plus 8 random hex digits.
 * @param {Date} [now]
 * @returns {string} e.g. `20261026T223853Z-1a2b3c4d`
 */
export function mintRunId(now = new Date()) {
  const stamp = now
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[-:]/g, '');
  return `${stamp}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * The custom_id for the request at `index` in a run. Minted from the position, never
 * encoded from the key it stands for (requests.jsonl maps one to the other).
 * @param {number} index 0-based
 * @returns {string} e.g. `q000007`
 */
export function mintCustomId(index) {
  if (!Number.isSafeInteger(index) || index < 0 || index > MAX_CUSTOM_ID_INDEX) {
    throw new Error(`records: custom_id index out of range: ${String(index)}`);
  }
  return `q${String(index).padStart(6, '0')}`;
}

function assertRunId(runId) {
  if (typeof runId !== 'string' || !RUN_ID_RE.test(runId)) {
    throw new Error(`records: not a run id: ${JSON.stringify(runId)}`);
  }
}

/** @param {string} recordsDir @param {string} runId @returns {string} */
export function runDirFor(recordsDir, runId) {
  assertRunId(runId);
  return path.join(recordsDir, 'runs', runId);
}

/**
 * Create `runs/<runId>/`, refusing one that already exists.
 * @param {string} recordsDir
 * @param {string} runId
 * @returns {string} the run directory
 */
export function createRunDir(recordsDir, runId) {
  const dir = runDirFor(recordsDir, runId);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  try {
    fs.mkdirSync(dir);
  } catch (e) {
    if (e.code === 'EEXIST') throw new Error(`records: run directory exists: ${dir}`);
    throw e;
  }
  return dir;
}

/**
 * Open an existing `runs/<runId>/`.
 * @param {string} recordsDir
 * @param {string} runId
 * @returns {string} the run directory
 */
export function openRunDir(recordsDir, runId) {
  const dir = runDirFor(recordsDir, runId);
  if (!fs.existsSync(dir)) throw new Error(`records: no run directory ${dir}`);
  return dir;
}

/**
 * Throw if `text` contains any secret. The message names no secret.
 * @param {string} text
 * @param {string[]} secrets
 * @param {string} where
 */
export function assertNoSecrets(text, secrets, where) {
  for (const s of secrets) {
    if (text.includes(s)) {
      throw new Error(`records: refusing to write ${where}: it contains a secret`);
    }
  }
}

/**
 * A writer bound to one directory and a set of secrets it must never write.
 * @param {{ dir: string, secrets?: Array<string|null|undefined> }} args
 */
export function createRecordWriter({ dir, secrets = [] }) {
  const guarded = secrets.filter((s) => s !== null && s !== undefined);
  for (const s of guarded) {
    if (typeof s !== 'string' || s.length < MIN_SECRET_LENGTH) {
      throw new Error('records: a secret shorter than 8 characters cannot be guarded reliably');
    }
  }
  const fileOf = (name) => {
    if (typeof name !== 'string' || !RECORD_NAME_RE.test(name)) {
      throw new Error(`records: not a record file name: ${JSON.stringify(name)}`);
    }
    return path.join(dir, name);
  };
  return {
    dir,
    /** Write a JSON record atomically (tmp + rename). */
    writeJson(name, obj) {
      const file = fileOf(name);
      const text = JSON.stringify(obj, null, 2) + '\n';
      assertNoSecrets(text, guarded, name);
      const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
      fs.writeFileSync(tmp, text);
      fs.renameSync(tmp, file);
    },
    /** Append one JSONL line. */
    appendJsonl(name, obj) {
      const file = fileOf(name);
      const text = JSON.stringify(obj) + '\n';
      assertNoSecrets(text, guarded, name);
      fs.appendFileSync(file, text);
    },
    exists(name) {
      return fs.existsSync(fileOf(name));
    },
    readJson(name) {
      return JSON.parse(fs.readFileSync(fileOf(name), 'utf8'));
    },
    /** Read a JSONL file; absent is empty, a malformed line refuses. */
    readJsonl(name) {
      const file = fileOf(name);
      if (!fs.existsSync(file)) return [];
      return fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) => {
          if (line === '') return [];
          try {
            return [JSON.parse(line)];
          } catch {
            throw new Error(`records: malformed line ${i + 1} in ${file}; refusing`);
          }
        });
    },
  };
}

/**
 * The harness's commit: `git rev-parse HEAD` at the repo root, or null when git fails.
 * @param {{ cwd?: string, exec?: typeof execFileSync }} [opts]
 * @returns {string|null}
 */
export function harnessCommit({ cwd = REPO_ROOT, exec = execFileSync } = {}) {
  try {
    const out = String(
      exec('git', ['rev-parse', 'HEAD'], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    ).trim();
    return /^[0-9a-f]{40}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

/**
 * Whether `tools/ai-review/` differs from HEAD (then the recorded commit does not fully
 * describe the code that ran), or null when git fails.
 * @param {{ cwd?: string, exec?: typeof execFileSync }} [opts]
 * @returns {boolean|null}
 */
export function harnessDirty({ cwd = REPO_ROOT, exec = execFileSync } = {}) {
  try {
    const out = String(
      exec('git', ['status', '--porcelain', '--', 'tools/ai-review'], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    );
    return out.trim() !== '';
  } catch {
    return null;
  }
}
