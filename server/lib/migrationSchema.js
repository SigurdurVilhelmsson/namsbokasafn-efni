/**
 * Shared helpers for idempotent migrations.
 */

/**
 * CREATE INDEX only if every indexed column still exists on the table.
 *
 * `runAllMigrations()` re-applies every migration on each boot (by design —
 * migrations use CREATE ... IF NOT EXISTS). But `CREATE INDEX IF NOT EXISTS`
 * guards only the index *name*, not its columns: an early migration that indexes
 * a column a later migration drops/renames throws "no such column" on re-run
 * (e.g. 032 dropped terminology_discussions.term_id; 022 renamed
 * users.github_id). This skips such an index cleanly on re-run while still
 * letting a genuinely bad table/column reference surface — it does not blanket-
 * swallow errors.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} indexName
 * @param {string} table
 * @param {string[]} columns - columns the index is built on
 */
function createIndexIfColumnsExist(db, indexName, table, columns) {
  const present = new Set(
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((c) => c.name)
  );
  if (columns.every((c) => present.has(c))) {
    db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table} (${columns.join(', ')});`);
  }
}

/** Whether a TABLE of that name exists (a view does not count). */
function tableExists(db, name) {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
  );
}

/**
 * Whether the legacy tables are retired: 021 dropped edit_history and pending_reviews, and 032
 * replaced terminology_terms and terminology_imports with the terminology_headwords tables. 032
 * runs after 021, and no later migration drops terminology_headwords, so its presence means both
 * retirements have run (register §C250, every-boot churn).
 *
 * Before this guard, every boot recreated those tables (002, 004) only for 021, 026, 028 and 032
 * to redo work on them and drop them again, logging it as if each were applied anew; and each
 * restart reopened 026's crash window. A fresh database still creates them on its first boot.
 */
function legacyTablesRetired(db) {
  return tableExists(db, 'terminology_headwords');
}

module.exports = { createIndexIfColumnsExist, tableExists, legacyTablesRetired };
