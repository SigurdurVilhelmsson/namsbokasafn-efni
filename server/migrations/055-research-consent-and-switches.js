/**
 * Migration 055: the consent record, the loss ledger and the per-book switch table (G1.1 + G1.2
 * spec §5.11, §5.13, §5.14; PR3).
 *
 * research_consent (§5.14): one row per consent decision of an editor, 'consented' or 'declined',
 * with the hash of the consent text shown and the times of giving, withdrawal and finished
 * deletion. user_id has NO FOREIGN KEY, on purpose: a user can be hard-deleted with cascade, and
 * this record must outlive the user it proves something about.
 *
 * research_capture_losses (§5.11): one row per capture that did not reach the research file, by
 * day and error class. A 'consent-unknown' loss has no interval (the consent lookup itself
 * failed); every other class has one.
 *
 * book_switch_events (§5.13): the history of each per-book switch; the latest row per
 * (book, switch_name) is the switch's value, and the screen reads it.
 *
 * Why these live in sessions.db: the consent gate must keep working while the research file is
 * down, and the screen reads the switch. The research file's tables are NOT created here:
 * freshMigratedDb applies every file in this directory to sessions.db (§5.1).
 *
 * Every table and index is created in one transaction, so a failure leaves none of them.
 *
 * Never throws (CLAUDE.md § Tech Stack, migration 048): migrationRunner calls up() on every start,
 * and a throw would stop the server booting. /api/health's checks.schema reports a failure
 * (server/lib/schemaHealth.js).
 */
function migrate(db) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS research_consent (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,                       -- users.id, deliberately no FOREIGN KEY (spec §5.14)
        decision TEXT NOT NULL CHECK (decision IN ('consented', 'declined')),
        interval_id INTEGER CHECK (decision = 'consented' OR interval_id IS NULL),
        consent_text_version TEXT NOT NULL,
        consent_text_sha256 TEXT NOT NULL
          CHECK (length(consent_text_sha256) = 64 AND consent_text_sha256 NOT GLOB '*[^0-9a-f]*'),
        given_at_ms INTEGER NOT NULL,
        withdrawn_at_ms INTEGER,
        deletion_done_at_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_research_consent_user ON research_consent (user_id, id);
      CREATE TABLE IF NOT EXISTS research_capture_losses (
        interval_id INTEGER,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        loss_day TEXT NOT NULL CHECK (loss_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        error_class TEXT NOT NULL
          CHECK (error_class IN ('unavailable', 'busy', 'constraint', 'consent-unknown', 'other')),
        client_action_id TEXT,
        CHECK ((error_class = 'consent-unknown') = (interval_id IS NULL))
      );
      CREATE INDEX IF NOT EXISTS idx_research_capture_losses_interval
        ON research_capture_losses (interval_id, client_action_id);
      CREATE TABLE IF NOT EXISTS book_switch_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        switch_name TEXT NOT NULL,
        value INTEGER NOT NULL CHECK (value IN (0, 1)),
        switched_at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_book_switch_events_lookup ON book_switch_events (book, switch_name, id);
    `);
  })();
}

module.exports = {
  name: '055-research-consent-and-switches',
  up(db) {
    try {
      migrate(db);
    } catch (err) {
      console.warn(
        `[055] MIGRATION COULD NOT COMPLETE — ${err.code || err.name}: ${err.message}. NOTHING WAS APPLIED: ` +
          'all three tables are created in one transaction, rolled back on failure. While they are missing, ' +
          'consent decisions cannot be recorded and record writes consent-unknown losses, and ' +
          '/api/health reports checks.schema and checks.research_db not ok. It re-attempts on every server ' +
          'start. NOT THROWN ON PURPOSE: throwing here would stop this server starting at all.'
      );
    }
  },
};
