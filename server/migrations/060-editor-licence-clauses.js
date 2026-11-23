/**
 * Migration 060: editor_licence_clauses, the record that an editor signed the licence clause (G1.13 spec §6.4).
 *
 * One row each time an admin records a signature date for an account. The table is append-only (a trigger refuses
 * UPDATE; a wrong entry is removed by an admin, with a logged reason, and re-recorded) and is classified `keep` in
 * server/lib/editorialRetentionScope.js: no retention step ever changes or deletes it, because the clause is the
 * licence evidence for the editor's work, which outlives the editing records.
 *
 * user_id names users.id and has deliberately no FOREIGN KEY (spec §6.4): the evidence must survive the deletion of
 * the account row, and with foreign keys on, a constraint would either block that deletion or cascade the evidence away.
 * recorded_by is the recording admin's username (spec §10 call 12).
 *
 * Never throws (CLAUDE.md § Tech Stack, migration 048): migrationRunner calls up() on every start, and a throw would
 * stop the server booting. /api/health's checks.schema reports a failure (server/lib/schemaHealth.js).
 */
function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS editor_licence_clauses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      signed_on TEXT NOT NULL CHECK (signed_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      recorded_by TEXT NOT NULL,
      recorded_at_ms INTEGER NOT NULL CHECK (recorded_at_ms > 0)
    );
    CREATE INDEX IF NOT EXISTS idx_editor_licence_clauses_user ON editor_licence_clauses (user_id, id);
    CREATE TRIGGER IF NOT EXISTS editor_licence_clauses_append_only BEFORE UPDATE ON editor_licence_clauses
    BEGIN SELECT RAISE(ABORT, 'editor_licence_clauses is append-only'); END;
  `);
}

module.exports = {
  name: '060-editor-licence-clauses',
  up(db) {
    try {
      migrate(db);
    } catch (err) {
      console.warn(
        `[060] MIGRATION COULD NOT COMPLETE — ${err.code || err.name}: ${err.message}. NOTHING WAS APPLIED. While ` +
          'editor_licence_clauses is missing, the users page cannot record or show a licence clause, and ' +
          '/api/health reports checks.schema not ok. It re-attempts on every server start. NOT THROWN ON ' +
          'PURPOSE: throwing here would stop this server starting at all.'
      );
    }
  },
};
