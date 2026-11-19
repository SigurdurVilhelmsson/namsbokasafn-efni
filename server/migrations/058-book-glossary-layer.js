/**
 * Migration 058: the book glossary layer's tables (spec 2026-11-19-book-glossary-layer-design).
 *
 * book_glossary_exclusion: one row per headword (concept_id 0 = the whole headword) or single concept
 * a book withholds from what it resolves. match_key is the headword's match key (the exact text for a
 * symbol-shaped headword, nocaseKey otherwise). idordabanki_id and icelandic record what was excluded.
 *
 * book_glossary_entry: one row per concept the book adds, keyed on the concept's id.
 *
 * book_glossary_change: the append-only history; every layer change carries who, when, why, source.
 *
 * Nothing in this migration writes a row. None of the tables has a FOREIGN KEY: a book or concept
 * can be deleted later, and a foreign key violation in a migration that runs on every start would
 * stop the server booting. All DDL is idempotent (IF NOT EXISTS), in ONE transaction.
 *
 * Never throws (CLAUDE.md § Tech Stack, migration 048): migrationRunner calls up() on every start,
 * and a throw would stop the server booting. /api/health's checks.schema reports a failure.
 */
function migrate(db) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS book_glossary_exclusion (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL,
        english TEXT NOT NULL,
        match_key TEXT NOT NULL,
        concept_id INTEGER NOT NULL DEFAULT 0 CHECK (concept_id >= 0),
        idordabanki_id INTEGER,
        icelandic TEXT,
        reason TEXT NOT NULL, source TEXT NOT NULL,
        created_by TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE (book_id, match_key, concept_id)
      );
      CREATE TABLE IF NOT EXISTS book_glossary_entry (
        concept_id INTEGER PRIMARY KEY,
        book_id INTEGER NOT NULL,
        reason TEXT NOT NULL, source TEXT NOT NULL,
        created_by TEXT NOT NULL, created_at TEXT NOT NULL,
        updated_by TEXT, updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_book_glossary_entry_book ON book_glossary_entry(book_id);
      CREATE TABLE IF NOT EXISTS book_glossary_change (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL,
        at TEXT NOT NULL, by TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('exclude','unexclude','entry-add','entry-change','entry-remove')),
        english TEXT NOT NULL,
        before_json TEXT, after_json TEXT,
        reason TEXT NOT NULL, source TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_book_glossary_change_book ON book_glossary_change(book_id, id);
    `);
  })();
}

module.exports = {
  name: '058-book-glossary-layer',
  up(db) {
    try {
      migrate(db);
    } catch (err) {
      console.warn(
        `[058] MIGRATION COULD NOT COMPLETE — ${err.code || err.name}: ${err.message}. NOTHING WAS APPLIED: ` +
          'the three tables and their indexes are created in one transaction, rolled back on failure. ' +
          'While they are missing, no book can record an exclusion, an entry or a change, and ' +
          '/api/health reports checks.schema not ok. It re-attempts on every server start. NOT THROWN ' +
          'ON PURPOSE: throwing here would stop this server starting at all.'
      );
    }
  },
};
