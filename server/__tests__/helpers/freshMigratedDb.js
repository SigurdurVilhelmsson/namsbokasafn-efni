// server/__tests__/helpers/freshMigratedDb.js
/**
 * A database whose schema was built by running EVERY real migration against an
 * empty file. Extracted from migrationsRealTree.test.js (register §C36) so the
 * concept-model tests do not become a third hand-copied DDL.
 *
 * ⚠️ Deliberately does NOT call runAllMigrations(). That function takes no db
 * argument — it resolves DB_PATH at module load from resolveDbPath() — so driving
 * it means setting process.env.SESSIONS_DB_PATH before the require and never
 * restoring it. vitest runs with fileParallelism: false, so that shared-state
 * mutation would affect every LATER file in the run. Requiring the migration
 * modules directly is deterministic and touches no global.
 *
 * ⚠️ A temp FILE, not ':memory:' — some migrations inspect the database path.
 *
 * Plain CJS so ESM vitest files can load it via createRequire.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

// ⚠️ EVERY temp dir this helper creates is removed when the process exits. Without
// this, each call leaked a ~22 MB migrated database into /tmp: harmless per test,
// but the count rose from 5 to 27 per run as the concept suites grew, and a
// whole-branch reviewer measured 601 MB accumulated. Registered once, not per call,
// so the listener count cannot grow with the suite.
// ⚠️ TWO mechanisms, because the obvious one does not work where it matters. The exit
// hook alone was MEASURED to clean up correctly under plain `node` and NOT AT ALL under
// vitest — its workers are threads, and `process.on('exit')` never fires on thread
// teardown, so a run still grew /tmp by one dir per call. The age sweep is what actually
// bounds growth in the test suite; the exit hook is kept because it makes direct `node`
// usage tidy immediately.
const tempRoots = [];
let cleanupRegistered = false;
const STALE_MS = 60 * 60 * 1000;

/** Remove fresh-clone dirs from EARLIER runs. Age-based, so a live handle is never hit. */
function sweepStale() {
  const tmp = os.tmpdir();
  let entries;
  try {
    entries = fs.readdirSync(tmp);
  } catch {
    return;
  }
  const cutoff = Date.now() - STALE_MS;
  for (const name of entries) {
    if (!name.startsWith('fresh-clone-')) continue;
    const dir = path.join(tmp, name);
    try {
      if (fs.statSync(dir).mtimeMs < cutoff) fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best effort: tidying temp space must never fail a test run.
    }
  }
}

function registerCleanup() {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  sweepStale();
  process.on('exit', () => {
    for (const dir of tempRoots) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best effort: a leaked temp dir must never fail a test run.
      }
    }
  });
}

/**
 * @param {string} [migrationsDir] ⚠️ FOR THIS HELPER'S OWN TEST ONLY, and the
 *   default is the real directory. It exists so the throw-on-failure behaviour
 *   below can be pinned with a deliberately-broken migration in a temp dir,
 *   rather than by writing a stray `NNN-*.js` into `server/migrations/` — where
 *   a crashed test would leave it behind and break every later run, and where
 *   migrations are append-only by project rule. NO production or test caller
 *   passes it; do not use it to hand-pick a subset of migrations.
 */
function freshMigratedDb(migrationsDir) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-clone-'));
  tempRoots.push(tempRoot);
  registerCleanup();
  const dbPath = path.join(tempRoot, 'sessions.db');
  const db = new Database(dbPath);
  const dir = migrationsDir || path.join(__dirname, '..', '..', 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}-.*\.js$/.test(f))
    .sort(); // zero-padded, so lexical order IS migration order
  const errors = [];
  for (const f of files) {
    try {
      require(path.join(dir, f)).up(db);
    } catch (e) {
      errors.push(`${f}: ${e.message}`);
    }
  }
  // ⚠️ THROWS ON A FAILED MIGRATION — added by the whole-branch review,
  // 2026-08-09. Almost every caller destructures `{ db }` and DISCARDS `errors`
  // (conceptResolverScope.test.js, migration048.test.js, importConcepts.test.js
  // and a dozen more), so a migration that silently failed produced a database
  // with a MISSING TABLE and surfaced, several assertions later, as a baffling
  // downstream failure that names neither the migration nor the table. A
  // reviewer hit exactly that: one non-reproducible 9-test failure across 2
  // files that would not re-trigger in 12 re-runs.
  //
  // ⚠️ FIXED HERE, NOT AT EVERY CALL SITE. One edit, and it covers call sites
  // nobody has written yet — the alternative was ~30 `expect(errors).toEqual([])`
  // lines, each of which a future test can forget.
  //
  // `errors` is STILL RETURNED, unchanged, for compatibility: verify-b4a-gates.js
  // checks `built.errors.length` itself and freshMigratedDb.test.js asserts the
  // shape. Those checks are now unreachable-but-harmless, and they document the
  // contract at their own call sites.
  if (errors.length) {
    throw new Error(
      `freshMigratedDb(): ${errors.length} of ${files.length} migration(s) FAILED, so this ` +
        'database has an incomplete schema. Failing here rather than handing back a broken ' +
        'connection — a discarded `errors` array is how this surfaces as an unrelated ' +
        `assertion much later. Failures:\n  ${errors.join('\n  ')}`
    );
  }
  return { db, errors, applied: files.length, path: dbPath };
}

module.exports = freshMigratedDb;
