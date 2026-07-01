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

module.exports = { createIndexIfColumnsExist };
