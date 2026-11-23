/**
 * Migration 014: Add source tracking columns to registered_books
 *
 * Tracks which commit was fetched, when, and from which repo.
 * Populated by the download-source.js tool after book registration.
 */

module.exports = {
  name: '014-source-tracking',

  up(db) {
    // Register §C250. The runner re-runs this on every start and counts a "duplicate column" throw
    // as skipped, so three bare ALTERs that died after the first left the other two columns missing
    // for good, with no error anywhere. Two defences, for two different databases:
    //   - ONE TRANSACTION: a crash from now on leaves all three columns or none;
    //   - A GUARD PER COLUMN: a database ALREADY stranded (some columns present) gets the missing
    //     ones added, where a transaction alone would throw on the first ALTER and be skipped again.
    // Found by server/verification/migration-convergence/; pinned by migration014.test.js.
    const COLUMNS = [
      ['source_commit_hash', 'TEXT'],
      ['source_fetched_at', 'DATETIME'],
      ['source_repo', 'TEXT'],
    ];
    db.transaction(() => {
      const present = new Set(
        db
          .prepare('PRAGMA table_info(registered_books)')
          .all()
          .map((c) => c.name)
      );
      for (const [name, type] of COLUMNS) {
        if (!present.has(name)) db.exec(`ALTER TABLE registered_books ADD COLUMN ${name} ${type}`);
      }
    })();
  },

  down(_db) {
    // SQLite doesn't support DROP COLUMN easily; recreate table if needed
  },
};
