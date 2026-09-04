// @ts-check
// The MT edit-lock first-edit hook (segmentEditorService / acceptanceService →
// writeMtLock) fires when a writer spec saves against a module whose MT output
// exists on disk. Each run seeds a fresh DB, so "first edit" fires every run —
// for the committed fixture book AND for the REAL `efnafraedi-2e` modules that
// ux-phase2.spec.js and segment-editor.spec.js write to.
//
// Sweep this run's markers so the git tree is left clean, and — the part that
// matters — leave any marker that predates the run alone: that is a real
// editorial lock, and clobbering an edited baseline is what the marker exists to
// prevent. The pre-run snapshot comes from global-setup.js; without it we cannot
// prove authorship, so nothing outside the fixture book is touched.
//
// The fixture book is still swept unconditionally, which preserves this hook's
// original cleanup of markers stranded by a previous ABORTED run (teardown does
// not execute on a hard kill, but the next completed run cleans up).
const path = require('path');
const sweep = require('./helpers/mt-lock-sweep.js');

/**
 * @param {unknown} _config Playwright's FullConfig (unused).
 * @param {{booksDir?: string, snapshotFile?: string}} [overrides] Test seam.
 * @returns {Promise<{removed: string[], kept: string[]}>}
 */
module.exports = async (_config, overrides = {}) => {
  const projectRoot = path.join(__dirname, '..', '..');
  const booksDir = overrides.booksDir || path.join(projectRoot, 'books');
  const snapshotFile = overrides.snapshotFile || sweep.snapshotPathFor(projectRoot);

  const snapshot = sweep.loadSnapshot(snapshotFile);
  if (snapshot === null) {
    console.warn(
      '[mt-lock] no usable pre-run snapshot — sweeping the fixture book only. ' +
        'Check that playwright.config.js still declares globalSetup.'
    );
  }
  const result = sweep.sweepStrayLocks(booksDir, snapshot);
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
  return result;
};
