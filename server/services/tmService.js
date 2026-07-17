/**
 * tmService — keep the per-book TMX translation memory current.
 *
 * After approved edits are applied to 03-faithful-translation/, the TMX in
 * books/<book>/tm/ is stale. This service regenerates it by running the
 * tools/generate-tm.js CLI. Regeneration is:
 *   - debounced per book, so rapid successive applies (several modules
 *     published in quick succession) coalesce into a single run; and
 *   - fire-and-forget, so it can never break or slow the apply path (failures
 *     are logged, never thrown).
 *
 * The 2h git-backup cron already pushes books/, so a regenerated TMX reaches
 * git without any extra step.
 */
const { spawn } = require('child_process');
const path = require('path');
const log = require('../lib/logger');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const GENERATE_TM = path.join(PROJECT_ROOT, 'tools', 'generate-tm.js');
const DEBOUNCE_MS = 5000;

/**
 * Default runner: spawn the generate-tm.js CLI for a whole book.
 * Resolves with `{ code, stderr }`; rejects only on a spawn error.
 *
 * @param {string} book
 * @returns {Promise<{code: number, stderr: string}>}
 */
function defaultRunner(book) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [GENERATE_TM, '--book', book], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    let stderr = '';
    if (child.stderr) child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

let runner = defaultRunner;

/**
 * Regenerate the TMX for a book now. Never throws — logs and returns the exit
 * code (or null if the process failed to spawn).
 *
 * @param {string} book
 * @returns {Promise<number|null>}
 */
async function regenerateTm(book) {
  try {
    const { code, stderr } = await runner(book);
    if (code === 0) {
      log.info({ book }, 'TM regenerated');
    } else {
      log.warn(
        { book, code, stderr: stderr ? stderr.slice(0, 500) : undefined },
        'TM regeneration exited non-zero'
      );
    }
    return code;
  } catch (err) {
    log.error({ err, book }, 'TM regeneration failed to spawn');
    return null;
  }
}

const timers = new Map();

/**
 * Schedule a debounced, fire-and-forget TM regeneration for a book. Rapid calls
 * for the same book coalesce into a single run.
 *
 * @param {string} book
 * @param {{ delay?: number }} [opts]
 * @returns {NodeJS.Timeout}
 */
function scheduleTmRegen(book, { delay = DEBOUNCE_MS } = {}) {
  const existing = timers.get(book);
  if (existing) clearTimeout(existing);

  const t = setTimeout(() => {
    timers.delete(book);
    regenerateTm(book);
  }, delay);
  if (typeof t.unref === 'function') t.unref();
  timers.set(book, t);
  return t;
}

/** @internal Test-only: inject a runner. Pass nothing to restore the default. */
function _setRunner(fn) {
  runner = fn || defaultRunner;
}

/** @internal Test-only: books with a pending debounced regen. */
function _pendingBooks() {
  return [...timers.keys()];
}

module.exports = { regenerateTm, scheduleTmRegen, _setRunner, _pendingBooks };
