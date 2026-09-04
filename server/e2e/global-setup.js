// @ts-check
// Snapshot every MT edit-lock marker under books/ BEFORE the run, so teardown
// can tell "this run created it" (sweep) from "a human did" (keep). See
// helpers/mt-lock-sweep.js for why that distinction is the whole point.
//
// If this hook is not wired in playwright.config.js there is no snapshot, and
// teardown fail-safes to sweeping the fixture book only — i.e. silently back to
// the pre-fix behaviour. server/__tests__/e2eMtLockSweep.test.js pins the wiring.
const path = require('path');
const sweep = require('./helpers/mt-lock-sweep.js');

/**
 * @param {unknown} _config Playwright's FullConfig (unused).
 * @param {{booksDir?: string, snapshotFile?: string}} [overrides] Test seam.
 */
module.exports = async (_config, overrides = {}) => {
  const projectRoot = path.join(__dirname, '..', '..');
  const booksDir = overrides.booksDir || path.join(projectRoot, 'books');
  const snapshotFile = overrides.snapshotFile || sweep.snapshotPathFor(projectRoot);

  const before = sweep.listLockFiles(booksDir);
  try {
    sweep.saveSnapshot(snapshotFile, before);
  } catch (err) {
    // Best-effort: a missing snapshot makes teardown conservative, never destructive.
    console.warn(`[mt-lock] could not write lock snapshot: ${err.message}`);
  }
  return { before };
};
