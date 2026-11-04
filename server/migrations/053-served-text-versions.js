/**
 * Migration 053: served_text_versions and the G1.1 editing columns (spec §5.2, §5.8, §13).
 *
 * served_text_versions holds one row per distinct text the segment editor served as a segment's
 * base: book, chapter (-1 for appendices), module_id as the route names it (so `chapter-metadata`
 * for chapter metadata, which is why chapter is in the key), segment_id as served, occurrence (0
 * until G1.12), the sha256 of the served `en` and `is` strings, the layer they came from (the
 * loader's isSource: `mt-output` or `faithful`; `selected` is admitted now because the 10-10 plan
 * may switch the loader to selected MT, and a CHECK cannot be widened without a table rebuild), and
 * the exact served `en_text` and `is_text`. Every column is NOT NULL, because SQLite treats NULLs
 * as distinct in a unique index, and the unique key covers all eight identifying columns, layer
 * included: the same Icelandic served first as MT and later labelled faithful is two rows, so
 * whichever label came first does not win. Serving the same text again adds nothing. The row holds
 * no person and no time (R3).
 *
 * ⚠️ BOTH HASH CHECKS DEMAND 64 LOWERCASE HEX, NOT ONLY THE LENGTH. sha256Text (lib/servedText.js)
 * writes nothing else, and PR3's research schema refuses anything else, so a length-only CHECK would
 * let a direct writer store a version that every later research event on it loses as a constraint
 * failure.
 *
 * The editing rows gain what an edit or acceptance was made on and how the row was produced:
 *   segment_edits.served_version_id      the base the current text was made on
 *   segment_edits.occurrence             which occurrence of the segment id (spec §5.3)
 *   segment_edits.origin                 the write path the server stamps (spec §5.10)
 *   segment_edits.displayed_edit_id      the in-flight edit on screen when the text was saved,
 *                                        NULL when the base was shown
 *   segment_edits.displayed_edit_sha256  that edit's contentSha256, as the client echoed it
 *   segment_acceptances.served_version_id, segment_acceptances.occurrence  as above
 * The module route sends every row of both tables to every editor's browser through SELECT *, so
 * how an editor worked never goes here; researchBoundary.test.js holds the column allowlist.
 *
 * ⚠️ A FOREIGN KEY ON served_version_id, NONE ON displayed_edit_id. Foreign keys are ON in this
 * build (better-sqlite3 is compiled with SQLITE_DEFAULT_FOREIGN_KEYS=1; CLAUDE.md § Tech Stack), so
 * the reference is live: no code path deletes a served version, and a writer passing an id with no
 * row fails loud. A displayed edit, by contrast, is deleted by its author's withdraw
 * (segmentEditorService's identity save and deleteSegmentEdit), so a reference there would make a
 * withdraw fail. origin has no CHECK either: its reserved values (spec §5.10) would then need a
 * table rebuild, so its vocabulary is a constant pinned by a test instead.
 *
 * ⚠️ NULL ON EVERY OLDER ROW MEANS "MADE BEFORE G1.1", AND NOTHING IS BACKFILLED. Those rows were
 * made on an older MT (lib/applyHold.js), so any backfilled base would be false.
 *
 * ⚠️ NEVER THROWS (CLAUDE.md § Tech Stack; 048 and 052 are the shape). migrationRunner calls every
 * up() on every server start, and failLoudOnMigrationErrors turns a collected error into exit(1), so
 * a migration that throws stops the server starting at all. Every step runs in one transaction
 * inside one try: a failure anywhere rolls back every step and warns once, no half-added column set
 * is left behind, and the next start tries again. A swallowed failure leaves saves and accepts
 * failing on a missing column, which is why /api/health's checks.schema reports every table, column
 * and index this migration adds (spec §5.20).
 */

function addColumnIfMissing(db, table, column, decl) {
  const has = db.pragma(`table_info(${table})`).some((c) => c.name === column);
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}

/** The whole migration, kept apart so that up() is nothing but the never-throw boundary. */
function migrate(db) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS served_text_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        segment_id TEXT NOT NULL,
        occurrence INTEGER NOT NULL CHECK (occurrence >= 0),
        en_sha256 TEXT NOT NULL CHECK (length(en_sha256) = 64 AND en_sha256 NOT GLOB '*[^0-9a-f]*'),
        is_sha256 TEXT NOT NULL CHECK (length(is_sha256) = 64 AND is_sha256 NOT GLOB '*[^0-9a-f]*'),
        layer TEXT NOT NULL CHECK (layer IN ('mt-output', 'faithful', 'selected')),
        en_text TEXT NOT NULL,
        is_text TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_served_text_versions_key
        ON served_text_versions (book, chapter, module_id, segment_id, occurrence,
                                 en_sha256, is_sha256, layer);
    `);
    const ref = 'INTEGER REFERENCES served_text_versions(id)';
    addColumnIfMissing(db, 'segment_edits', 'served_version_id', ref);
    addColumnIfMissing(db, 'segment_edits', 'occurrence', 'INTEGER');
    addColumnIfMissing(db, 'segment_edits', 'origin', 'TEXT');
    addColumnIfMissing(db, 'segment_edits', 'displayed_edit_id', 'INTEGER');
    addColumnIfMissing(db, 'segment_edits', 'displayed_edit_sha256', 'TEXT');
    addColumnIfMissing(db, 'segment_acceptances', 'served_version_id', ref);
    addColumnIfMissing(db, 'segment_acceptances', 'occurrence', 'INTEGER');
  })();
}

module.exports = {
  name: '053-served-text-versions',

  up(db) {
    try {
      migrate(db);
    } catch (err) {
      console.warn(
        `[053] MIGRATION COULD NOT COMPLETE — ${err.code || err.name}: ${err.message}. NOTHING WAS ` +
          'APPLIED: every step is in one transaction, rolled back on failure. Saves and accepts will fail on a ' +
          'missing column until it completes, and /api/health reports checks.schema not ok. It re-attempts on ' +
          'every server start. NOT THROWN ON PURPOSE: throwing here would stop this server starting at all.'
      );
    }
  },
};
