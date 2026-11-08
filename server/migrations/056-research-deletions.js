/**
 * Migration 056: the deletion record and the derived-dataset record (G1.1 + G1.2 spec §5.15,
 * §5.20; PR4).
 *
 * research_deletions (§5.15): one row per finished deletion: a withdrawal (one consent interval)
 * or the retention date (every research row; no interval). It is written only when the rows were
 * deleted, the file compacted, the byte scan found nothing and research-exports/ was emptied.
 *
 * It holds NO row count: how many rows an editor had is a measure of their volume, which is what
 * the deletion exists to remove. It holds NO person: the interval id is the proof's link to
 * research_consent, which outlives it (§5.14), and the consent row names the user.
 *
 * research_derived_datasets (§5.15): the record of the derived dataset the retention date must
 * never destroy the only copy of. It lives in sessions.db because it must survive the deletion it
 * guards. Nothing here writes it: G1.5's step does.
 *
 * Neither table has a FOREIGN KEY: the records are deleted together a stated period after the
 * retention date (G1.15), and research_consent carries no foreign key either (migration 055).
 *
 * Both tables are created in one transaction, so a failure leaves neither.
 *
 * Never throws (CLAUDE.md § Tech Stack, migration 048): migrationRunner calls up() on every start,
 * and a throw would stop the server booting. /api/health's checks.schema reports a failure
 * (server/lib/schemaHealth.js).
 */
function migrate(db) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS research_deletions (
        kind TEXT NOT NULL CHECK (kind IN ('withdrawal', 'retention')),
        interval_id INTEGER,                              -- the consent interval; plain integer, no FOREIGN KEY
        done_at_ms INTEGER NOT NULL CHECK (done_at_ms > 0),
        verified INTEGER NOT NULL CHECK (verified IN (0, 1)),
        CHECK ((kind = 'withdrawal') = (interval_id IS NOT NULL))
      );
      CREATE TABLE IF NOT EXISTS research_derived_datasets (
        path TEXT NOT NULL CHECK (length(path) > 0),
        sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
        created_day TEXT NOT NULL CHECK (created_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
      );
    `);
  })();
}

module.exports = {
  name: '056-research-deletions',
  up(db) {
    try {
      migrate(db);
    } catch (err) {
      console.warn(
        `[056] MIGRATION COULD NOT COMPLETE — ${err.code || err.name}: ${err.message}. NOTHING WAS APPLIED: ` +
          'both tables are created in one transaction, rolled back on failure. While they are missing, both ' +
          'deletion scripts exit non-zero, so every withdrawn interval stays due and the research backup ' +
          'takes no copy, and /api/health reports checks.schema not ok. It re-attempts on every server ' +
          'start. NOT THROWN ON PURPOSE: throwing here would stop this server starting at all.'
      );
    }
  },
};
