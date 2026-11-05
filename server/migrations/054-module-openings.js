/**
 * Migration 054: the opening record (G1.1 + G1.2 spec §5.5; PR2).
 *
 * module_openings: one row per (book, chapter, module_id), written once, at the module's first serve to a user who
 * holds a user_chapter_assignments row for that chapter (server/services/moduleOpenings.js). The chapter is in the
 * key because chapter-metadata is one module id for 21 chapters; appendices are -1. NO user column (R3): who opened
 * a unit is research data, captured only as PR3's module-opened event, for a consenting editor. opened_at_ms is read
 * on the server only (spec §11). inflight_count is how many snapshot rows the opening wrote.
 *
 * module_opening_inflight: the G1.23 §6.3a snapshot, the served segments that held an in-flight edit (pending, or
 * approved and not applied) from any editor at that serve. occurrence -1 means every occurrence of the id, because
 * rows made before G1.1 carry no occurrence. The foreign key refuses a snapshot row without its opening; foreign keys
 * are ON in this build (CLAUDE.md § Tech Stack), so ON DELETE CASCADE is live and a later retention rule (G1.15)
 * deletes an opening and its snapshot in one statement.
 *
 * Never throws (CLAUDE.md § Tech Stack, migration 048): migrationRunner calls up() on every start, and a throw would
 * stop the server booting. Both tables are created in one transaction, so a failure leaves neither, and /api/health's
 * checks.schema names the missing table (server/lib/schemaHealth.js).
 */
function migrate(db) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS module_openings (
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        opened_at_ms INTEGER NOT NULL CHECK (opened_at_ms > 0),
        inflight_count INTEGER NOT NULL CHECK (inflight_count >= 0),
        PRIMARY KEY (book, chapter, module_id)
      );
      CREATE TABLE IF NOT EXISTS module_opening_inflight (
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        segment_id TEXT NOT NULL,
        occurrence INTEGER NOT NULL CHECK (occurrence >= -1),
        PRIMARY KEY (book, chapter, module_id, segment_id, occurrence),
        FOREIGN KEY (book, chapter, module_id)
          REFERENCES module_openings (book, chapter, module_id) ON DELETE CASCADE
      );
    `);
  })();
}

module.exports = {
  name: '054-module-openings',
  up(db) {
    try {
      migrate(db);
    } catch (err) {
      console.warn(
        `[054] MIGRATION COULD NOT COMPLETE — ${err.code || err.name}: ${err.message}. NOTHING WAS APPLIED: ` +
          'both tables are created in one transaction, rolled back on failure. While module_openings is missing, ' +
          'a chemistry serve by an editor who holds an assignment row answers 503 OPENING_UNRECORDED (no unit ' +
          'opens unrecorded), every other serve is answered as before, and /api/health reports checks.schema not ' +
          'ok. It re-attempts on every server start. NOT THROWN ON PURPOSE: throwing here would stop this server ' +
          'starting at all.'
      );
    }
  },
};
