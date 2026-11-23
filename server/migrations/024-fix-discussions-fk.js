/**
 * Migration 024: Fix terminology_discussions foreign key
 *
 * The terminology_discussions table has a FK referencing "terminology_terms_old"
 * (a table that was renamed back to terminology_terms during migration 020).
 * SQLite doesn't update FK references on table rename, so dispute/discuss
 * operations fail with "no such table: main.terminology_terms_old".
 *
 * Fix: Recreate the table with the correct FK reference.
 */

module.exports = {
  id: '024-fix-discussions-fk',

  up(db) {
    // Check if the bug exists — if FK already points to terminology_terms, skip
    const tableInfo = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='terminology_discussions'"
      )
      .get();

    if (!tableInfo) {
      // Table doesn't exist at all — nothing to fix
      return;
    }

    if (!tableInfo.sql.includes('terminology_terms_old')) {
      // FK is already correct
      console.log('Migration 024: terminology_discussions FK already correct');
      return;
    }

    console.log('Applying migration 024: Fixing terminology_discussions FK...');

    // ONE transaction, and a leftover terminology_discussions_new dropped first (register §C250). This rebuild was one
    // multi-statement exec with no transaction: a crash before the RENAME left terminology_discussions_new behind, and
    // the next start's CREATE threw "already exists", which migrationRunner counts as skipped, so the
    // rebuild never finished. Now a crash leaves all or nothing, and a database an older crash already
    // stranded finishes on its next start. The DROP is reached only while terminology_discussions itself still
    // exists (the early returns above), so it can never remove the only copy of the rows.
    db.transaction(() => {
      db.exec('DROP TABLE IF EXISTS terminology_discussions_new');
      db.exec(`
      -- Preserve existing data
      CREATE TABLE terminology_discussions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        comment TEXT NOT NULL,
        proposed_translation TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (term_id) REFERENCES terminology_terms(id) ON DELETE CASCADE
      );

      INSERT INTO terminology_discussions_new
        SELECT * FROM terminology_discussions;

      DROP TABLE terminology_discussions;

      ALTER TABLE terminology_discussions_new RENAME TO terminology_discussions;

      CREATE INDEX IF NOT EXISTS idx_terminology_discussions_term
        ON terminology_discussions(term_id);
    `);
    })();

    console.log('Migration 024: Fixed terminology_discussions FK');
  },
};
