/**
 * Migration 050: figure-text review state.
 *
 * WHY: a machine-translated FIGURE needs the same MT-preview -> Edited lifecycle
 * the text already has, but it cannot share the segment tables — figure text is
 * not in the CNXML at all; it lives inside a licensed PDF and is re-composed
 * into an image.
 *
 * ⚠️ WORKFLOW STATE ONLY. The editorial CONTENT lives in a committed sidecar at
 * books/<slug>/figure-text/<basename>.is.json, because sessions.db is gitignored
 * and covered only by the off-box backup. Same split as
 * applyApprovedEdits() -> 03-faithful-translation/.
 *
 * ⚠️ block_key is CONTENT-ADDRESSED ("Boiling|point|of water"), never positional.
 * Re-extraction renumbers positional auto-N ids, which would silently rebind an
 * editor's correction to a DIFFERENT label. Content addressing orphans the edit
 * instead, which is correct — changed English deserves a fresh look — and the
 * CLI names orphans rather than dropping them.
 */

/**
 * The whole migration. Separated from up() so that up() is nothing but the
 * never-throw boundary and no future edit can land outside it.
 */
function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS figure_review (
      book_id     INTEGER NOT NULL REFERENCES registered_books(id) ON DELETE CASCADE,
      chapter     INTEGER NOT NULL,
      module_id   TEXT    NOT NULL,
      basename    TEXT    NOT NULL,
      state       TEXT    NOT NULL DEFAULT 'mt-preview'
                  CHECK (state IN ('mt-preview','approved','flagged')),
      render_hash TEXT,
      flag_kind   TEXT CHECK (flag_kind IS NULL OR
                              flag_kind IN ('text','terminology','layout','other')),
      note        TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      PRIMARY KEY (book_id, basename)
    );
    CREATE INDEX IF NOT EXISTS idx_figure_review_module
      ON figure_review (book_id, chapter, module_id);

    CREATE TABLE IF NOT EXISTS figure_block_edit (
      book_id   INTEGER NOT NULL REFERENCES registered_books(id) ON DELETE CASCADE,
      basename  TEXT NOT NULL,
      block_key TEXT NOT NULL,
      is_text   TEXT NOT NULL,
      edited_by TEXT,
      edited_at TEXT,
      PRIMARY KEY (book_id, basename, block_key)
    );
  `);
}

module.exports = {
  // ⚠️ Shape verified against 049: `name` is the FULL filename stem and there is
  // no `version` field. Do not invent one.
  name: '050-figure-review',

  /** ⚠️ The never-throw boundary, and it is the whole of `up()` on purpose. */
  up(db) {
    try {
      migrate(db);
    } catch (err) {
      console.warn(
        `[050] MIGRATION COULD NOT COMPLETE — ${err.code || err.name}: ${err.message}. ` +
          'NOTHING WAS LOST: this migration only CREATEs tables, so a failure leaves the ' +
          'database exactly as it was and no figure review data can exist yet to lose. ' +
          'Figure review will be unavailable until this is fixed; every other feature is ' +
          'unaffected. It re-attempts on the next server start and keeps reporting until ' +
          'fixed. NOT THROWN ON PURPOSE: throwing here would stop this server booting.'
      );
    }
  },
};
