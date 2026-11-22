/**
 * Migration 059: retention_runs, the record of each retention step that finished (G1.15(b) spec §4.4; plan Task 3).
 *
 * The editorial retention script (server/scripts/editorial-retention.js) runs on every backup cycle. Each of its
 * three steps (`named`, `unnamed`, `consent`) is due once its date in server/lib/retentionDates.js has taken effect
 * and no row of its kind is here. A row is written only after the step changed its rows, compacted the file and
 * passed its structural verification, so a step that failed half way stays due and runs again on the next cycle.
 *
 * kind is UNIQUE: each step acts once. rows_changed is the step's total across every table, never a count per
 * person: how many rows one editor had is a measure of their volume, which the step exists to remove (the same
 * rule as research_deletions, migration 056). No person column, and no foreign key.
 *
 * Never throws (CLAUDE.md § Tech Stack, migration 048): migrationRunner calls up() on every start, and a throw would
 * stop the server booting. /api/health's checks.schema reports a failure (server/lib/schemaHealth.js).
 */
function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS retention_runs (
      kind TEXT NOT NULL UNIQUE CHECK (kind IN ('named', 'unnamed', 'consent')),
      done_at_ms INTEGER NOT NULL CHECK (done_at_ms > 0),
      rows_changed INTEGER NOT NULL CHECK (rows_changed >= 0)
    );
  `);
}

module.exports = {
  name: '059-retention-runs',
  up(db) {
    try {
      migrate(db);
    } catch (err) {
      console.warn(
        `[059] MIGRATION COULD NOT COMPLETE — ${err.code || err.name}: ${err.message}. NOTHING WAS APPLIED. While ` +
          'retention_runs is missing, the editorial retention script cannot record a step, so it refuses to act, ' +
          'and /api/health reports checks.schema not ok. It re-attempts on every server start. NOT THROWN ON ' +
          'PURPOSE: throwing here would stop this server starting at all.'
      );
    }
  },
};
