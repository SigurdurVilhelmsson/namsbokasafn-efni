/**
 * Migration 057: the suggestion view's editing record (G1.23 spec §7; PR1 Task 4).
 *
 * suggestion_rejections: one row per suggestion an editor rejected. A rejection hides that group
 * for every editor, so it is keyed on the suggestion's place (book, chapter, module, segment,
 * occurrence) and its op id, not on the person; rejected_by only says who did it.
 *
 * suggestion_left_open: one row per suggestion still open when a finishing act closed its segment
 * (a stadfesta-mt acceptance, or an approval). finishing_act / finishing_kind / finishing_id name
 * that act and its row; shown_at_finish records whether the editor was shown the suggestion then.
 *
 * segment_edits.accepted_suggestions: JSON [{opId, occurrence}] recording which ops a pending edit
 * took. NULL means none.
 *
 * Nothing in this migration writes a row: PR2 does.
 *
 * None of the new objects has a FOREIGN KEY: a user or an edit row can be deleted later, and a
 * foreign key violation in a migration that runs on every start would stop the server booting.
 * rejected_by, closed_by and finishing_id are plain integers.
 *
 * The two CREATE TABLEs and the ALTER TABLE run in ONE transaction (SQLite allows ADD COLUMN
 * inside one), so a failure leaves nothing half-applied. The ALTER runs only when
 * PRAGMA table_info(segment_edits) lacks the column, so a second start is a no-op.
 *
 * Never throws (CLAUDE.md § Tech Stack, migration 048): migrationRunner calls up() on every start,
 * and a throw would stop the server booting. /api/health's checks.schema reports a failure
 * (server/lib/schemaHealth.js).
 */
function migrate(db) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS suggestion_rejections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL, chapter INTEGER NOT NULL, module_id TEXT NOT NULL,
        segment_id TEXT NOT NULL, occurrence INTEGER NOT NULL CHECK (occurrence >= 0),
        op_id TEXT NOT NULL, ruling_id TEXT NOT NULL, run_id TEXT,
        rejected_by INTEGER NOT NULL, rejected_at_ms INTEGER NOT NULL CHECK (rejected_at_ms > 0),
        UNIQUE (book, chapter, module_id, segment_id, occurrence, op_id)
      );
      CREATE TABLE IF NOT EXISTS suggestion_left_open (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL, chapter INTEGER NOT NULL, module_id TEXT NOT NULL,
        segment_id TEXT NOT NULL, occurrence INTEGER NOT NULL CHECK (occurrence >= 0),
        op_id TEXT NOT NULL, ruling_id TEXT NOT NULL, run_id TEXT,
        finishing_act TEXT NOT NULL CHECK (finishing_act IN ('stadfesta-mt', 'approval')),
        finishing_kind TEXT NOT NULL CHECK (finishing_kind IN ('segment_acceptance', 'segment_edit')),
        finishing_id INTEGER NOT NULL,
        closed_by INTEGER NOT NULL, closed_at_ms INTEGER NOT NULL CHECK (closed_at_ms > 0),
        shown_at_finish INTEGER NOT NULL CHECK (shown_at_finish IN (0, 1)),
        UNIQUE (book, chapter, module_id, segment_id, occurrence, op_id)
      );
    `);
    const has = db
      .prepare('PRAGMA table_info(segment_edits)')
      .all()
      .some((c) => c.name === 'accepted_suggestions');
    if (!has) {
      // JSON [{opId, occurrence}]; NULL = none
      db.exec('ALTER TABLE segment_edits ADD COLUMN accepted_suggestions TEXT');
    }
  })();
}

module.exports = {
  name: '057-suggestion-view',
  up(db) {
    try {
      migrate(db);
    } catch (err) {
      console.warn(
        `[057] MIGRATION COULD NOT COMPLETE — ${err.code || err.name}: ${err.message}. NOTHING WAS APPLIED: ` +
          'both tables and the segment_edits column are created in one transaction, rolled back on ' +
          'failure. While they are missing, nothing can record a rejected or left-open suggestion, and ' +
          '/api/health reports checks.schema not ok. It re-attempts on every server start. NOT THROWN ' +
          'ON PURPOSE: throwing here would stop this server starting at all.'
      );
    }
  },
};
