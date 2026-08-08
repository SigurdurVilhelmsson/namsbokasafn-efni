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

function freshMigratedDb() {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-clone-')), 'sessions.db');
  const db = new Database(dbPath);
  const dir = path.join(__dirname, '..', '..', 'migrations');
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
  return { db, errors, applied: files.length, path: dbPath };
}

module.exports = freshMigratedDb;
