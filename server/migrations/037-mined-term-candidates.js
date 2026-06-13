/**
 * Migration 037: Mined term-decision candidates (Unit 3.5)
 *
 * When reviewers repeatedly change the same MT rendering of a phrase to the
 * same correction, that recurring correction is an undocumented term decision.
 * `termMiningService` mines approved segment edits for these and stores
 * candidates here for a head-editor to dismiss or promote into the glossary.
 *
 * Both forms are normalized Icelandic (mt_form = what MT produced,
 * corrected_form = what reviewers settled on). The English headword is NOT
 * stored — it's supplied by the human at promotion time (the mined signal is
 * IS→IS; auto-anchoring to EN is deliberately avoided). UNIQUE(book, mt_form,
 * corrected_form) makes re-mining idempotent (occurrences/last_seen updated).
 */

module.exports = {
  name: '037-mined-term-candidates',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mined_term_candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        mt_form TEXT NOT NULL,
        corrected_form TEXT NOT NULL,
        occurrences INTEGER NOT NULL DEFAULT 1,
        en_context TEXT,
        example_segment_id TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'dismissed', 'promoted')),
        promoted_headword_id INTEGER,
        first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(book, mt_form, corrected_form)
      );

      CREATE INDEX IF NOT EXISTS idx_mined_candidates_book_status
        ON mined_term_candidates(book, status);
    `);
  },

  down(db) {
    db.exec(`DROP TABLE IF EXISTS mined_term_candidates;`);
  },
};
