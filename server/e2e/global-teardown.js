// @ts-check
// The MT edit-lock first-edit hook (segmentEditorService / acceptanceService ->
// writeMtLock) fires when a writer spec saves against a module whose MT output
// exists on disk. Each run seeds a fresh DB, so "first edit" fires every run --
// for the committed fixture book AND for the REAL efnafraedi-2e modules that
// ux-phase2.spec.js and segment-editor.spec.js write to.
//
// Sweep this run's markers so the git tree is left clean, and -- the part that
// matters -- leave any marker that predates the run alone: that is a real
// editorial lock, and clobbering an edited baseline is what the marker exists to
// prevent. The snapshot comes from global-setup.js and is accepted only when its
// run token matches ours, so a stale file from an earlier run cannot masquerade
// as this run's baseline. No match => null => sweep the fixture book only.
//
// The fixture book is still swept unconditionally, which preserves this hook's
// original cleanup of markers stranded by a previous ABORTED run (teardown does
// not execute on a hard kill, but the next completed run cleans up).
const path = require('path');
const sweep = require('./helpers/mt-lock-sweep.js');

/**
 * @param {unknown} _config Playwright's FullConfig (unused; it passes exactly one arg).
 * @param {{booksDir?: string, snapshotFile?: string, projectRoot?: string}} [overrides] Test seam.
 * @returns {Promise<{removed: string[], kept: string[], failed: string[]}>}
 */
module.exports = async (_config, overrides = {}) => {
  const projectRoot = overrides.projectRoot || path.join(__dirname, '..', '..');
  const booksDir = overrides.booksDir || path.join(projectRoot, 'books');
  const snapshotFile = overrides.snapshotFile || sweep.snapshotPathFor(projectRoot);

  const token = process.env[sweep.RUN_TOKEN_ENV];
  const snapshot = sweep.loadSnapshot(snapshotFile, token);
  if (snapshot === null) {
    console.warn(
      '[mt-lock] no snapshot for THIS run — sweeping the fixture book only. ' +
        'Check that playwright.config.js still declares globalSetup.'
    );
  }
  const result = sweep.sweepStrayLocks(booksDir, snapshot);
  delete process.env[sweep.RUN_TOKEN_ENV];

  if (result.removed.length) {
    console.log(
      `[mt-lock] swept ${result.removed.length} stray marker(s): ${result.removed.join(', ')}`
    );
  }
  if (result.kept.length) {
    console.log(
      `[mt-lock] kept ${result.kept.length} pre-existing marker(s): ${result.kept.join(', ')}`
    );
  }
  if (result.failed.length) {
    console.warn(
      `[mt-lock] FAILED to remove ${result.failed.length} marker(s): ${result.failed.join(', ')}`
    );
  }
  return result;
};
