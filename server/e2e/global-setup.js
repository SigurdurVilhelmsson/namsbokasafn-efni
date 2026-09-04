// @ts-check
// Snapshot every MT edit-lock marker under books/ BEFORE the run, so teardown can
// tell "this run created it" (sweep) from "a human did" (keep). See
// helpers/mt-lock-sweep.js for why that distinction is the whole point, and why
// the snapshot carries a run token rather than just a list.
//
// If this hook is not wired in playwright.config.js, no token reaches the
// environment, teardown reads null, and it conservatively sweeps the fixture book
// only. server/__tests__/e2eMtLockSweep.test.js pins the wiring, because that
// silent downgrade is otherwise indistinguishable from the fix working.
const path = require('path');
const { execFileSync } = require('child_process');
const sweep = require('./helpers/mt-lock-sweep.js');

/**
 * booksDir-relative marker paths git does NOT track, or null if git cannot say.
 * Best-effort and warn-only: this never gates or deletes anything.
 */
function untrackedAmong(projectRoot, relPaths) {
  if (relPaths.length === 0) return [];
  try {
    const out = execFileSync('git', ['-C', projectRoot, 'ls-files', '-z', '--', 'books/'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const tracked = new Set(out.split('\0').filter(Boolean));
    return relPaths.filter((rel) => !tracked.has(`books/${rel}`));
  } catch {
    return null; // not a repo, git missing, temp dir — say nothing rather than guess
  }
}

/**
 * @param {unknown} _config Playwright's FullConfig (unused; it passes exactly one arg).
 * @param {{booksDir?: string, snapshotFile?: string, projectRoot?: string}} [overrides] Test seam.
 */
module.exports = async (_config, overrides = {}) => {
  const projectRoot = overrides.projectRoot || path.join(__dirname, '..', '..');
  const booksDir = overrides.booksDir || path.join(projectRoot, 'books');
  const snapshotFile = overrides.snapshotFile || sweep.snapshotPathFor(projectRoot);

  let before;
  try {
    before = sweep.listLockFiles(booksDir);
  } catch (err) {
    // Could not enumerate => we must not later claim a marker is new. Leave no
    // snapshot; teardown will fail safe. (listLockFiles throws only here, on the
    // books dir itself — a book without 02-mt-output is ordinary.)
    console.warn(
      `[mt-lock] could not enumerate ${booksDir}: ${err.message} — teardown will fail safe`
    );
    return { before: null, token: null };
  }

  // An ABORTED run (hard kill) leaves a real-book marker behind; the next run's
  // snapshot would then adopt it as "pre-existing" and protect it forever. We do
  // not delete it — it may equally be a genuine editorial lock, and the two are
  // indistinguishable from disk. We SAY SO, which is the non-destructive half.
  const preExistingRealBook = before.filter((rel) => !sweep.isFixturePath(rel));
  const untracked = untrackedAmong(projectRoot, preExistingRealBook);
  if (untracked && untracked.length) {
    console.warn(
      `[mt-lock] ${untracked.length} UNTRACKED pre-existing marker(s) in a real book — ` +
        `these will be KEPT, not swept. If one is residue from an aborted E2E run it must be ` +
        `removed by hand, or that module is silently skipped by the next re-MT: ${untracked.join(', ')}`
    );
  }

  const token = sweep.mintRunToken();
  try {
    sweep.saveSnapshot(snapshotFile, before, token);
    process.env[sweep.RUN_TOKEN_ENV] = token;
  } catch (err) {
    // Best-effort: a missing snapshot makes teardown conservative, never destructive.
    delete process.env[sweep.RUN_TOKEN_ENV];
    console.warn(`[mt-lock] could not write lock snapshot: ${err.message}`);
    return { before, token: null };
  }
  return { before, token };
};
