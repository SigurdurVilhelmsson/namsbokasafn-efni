/**
 * Migration 015: Rename efnafraedi → efnafraedi-2e and remove liffraedi
 *
 * Updates all 14 tables that store book slugs as text columns.
 * Also deletes the liffraedi book and its cascading references.
 */

/**
 * Fresh databases lack the legacy tables this data migration touches
 * (edit_history, pending_reviews, sessions_backup) — skip those.
 */
function tableExists(db, name) {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`).get(name);
}

/** The one-time rename efnafraedi → efnafraedi-2e, in registered_books and every slug column. */
function renameEfnafraedi(db) {
  // registered_books.slug (the canonical source)
  db.prepare(`UPDATE registered_books SET slug = 'efnafraedi-2e' WHERE slug = 'efnafraedi'`).run();

  // Update display title to include edition suffix
  db.prepare(
    `UPDATE registered_books SET title_is = 'Efnafræði 2e' WHERE slug = 'efnafraedi-2e' AND title_is = 'Efnafræði'`
  ).run();

  // Tables with column named "book"
  for (const table of [
    'segment_edits',
    'module_reviews',
    'edit_history',
    'pending_reviews',
    'feedback',
    'analytics_events',
    'chapter_assignments',
    'localization_edits',
    'sessions_backup',
  ]) {
    if (!tableExists(db, table)) continue;
    db.prepare(`UPDATE ${table} SET book = 'efnafraedi-2e' WHERE book = 'efnafraedi'`).run();
  }

  // Tables with column named "book_slug"
  for (const table of [
    'chapter_generated_files',
    'chapter_generation_log',
    'user_book_access',
    'user_chapter_assignments',
  ]) {
    db.prepare(
      `UPDATE ${table} SET book_slug = 'efnafraedi-2e' WHERE book_slug = 'efnafraedi'`
    ).run();
  }
}

/** Remove the historical liffraedi book (no pipeline content), which liffraedi-2e replaced. */
function removeLiffraedi(db) {
  // Get liffraedi book ID for FK-based cleanup
  const row = db.prepare(`SELECT id FROM registered_books WHERE slug = 'liffraedi'`).get();
  if (!row) return;
  const bookId = row.id;

  // Clean up FK-referenced tables
  for (const table of ['book_chapters', 'book_sections', 'terminology_terms']) {
    // terminology_terms is retired by 032 and no longer recreated on later boots (§C250):
    // a DELETE on it would throw "no such table" and wedge the boot.
    if (!tableExists(db, table)) continue;
    db.prepare(`DELETE FROM ${table} WHERE book_id = ?`).run(bookId);
  }

  // Clean up slug-referenced tables
  for (const table of [
    'segment_edits',
    'module_reviews',
    'edit_history',
    'pending_reviews',
    'feedback',
    'analytics_events',
    'chapter_assignments',
    'localization_edits',
    'sessions_backup',
  ]) {
    if (!tableExists(db, table)) continue;
    db.prepare(`DELETE FROM ${table} WHERE book = 'liffraedi'`).run();
  }

  for (const table of [
    'chapter_generated_files',
    'chapter_generation_log',
    'user_book_access',
    'user_chapter_assignments',
  ]) {
    db.prepare(`DELETE FROM ${table} WHERE book_slug = 'liffraedi'`).run();
  }

  // Finally delete the book itself
  db.prepare(`DELETE FROM registered_books WHERE id = ?`).run(bookId);
}

module.exports = {
  name: '015-rename-book-slugs',

  up(db) {
    const rename = db.transaction(() => {
      // --- Rename efnafraedi → efnafraedi-2e across all slug-bearing tables ---
      // ONLY while efnafraedi-2e does not exist yet (register §C250). This was a one-time rename, but
      // migrationRunner re-runs it on every boot: once efnafraedi-2e exists, a newly registered
      // `efnafraedi` (a valid slug) made this UPDATE hit UNIQUE(registered_books.slug), an error the
      // runner does not skip: that start failed (failLoudOnMigrationErrors exits), and since the runner
      // carries on past a failed migration, 016 then merged the new book into efnafraedi-2e and deleted
      // it in the same boot; the next start was clean, the book gone. Moving the new book's rows onto
      // efnafraedi-2e would be wrong too, so the slug-column moves are skipped with it.
      // ⚠️ That also ends 015's every-boot move of STRAY rows tagged book / book_slug = 'efnafraedi'
      // (no such book registered, e.g. a feedback row) onto efnafraedi-2e: once efnafraedi-2e exists
      // they now keep their tag.
      const renameDone = Boolean(
        db.prepare(`SELECT 1 FROM registered_books WHERE slug = 'efnafraedi-2e'`).get()
      );
      if (!renameDone) renameEfnafraedi(db);

      // --- Remove liffraedi (no pipeline content, safe to delete) ---
      // ONLY while liffraedi-2e does not exist yet (register §C250): re-run on every boot, the removal
      // deleted any book an admin later registered as `liffraedi`, with its chapters and sections. A
      // fresh database never registers `liffraedi` (only 049 registers liffraedi-2e: 019's INSERT OR IGNORE is dropped, registered_by being NOT NULL), so once
      // liffraedi-2e exists such a row is a deliberate new book.
      const removalDone = Boolean(
        db.prepare("SELECT 1 FROM registered_books WHERE slug = 'liffraedi-2e'").get()
      );
      if (!removalDone) removeLiffraedi(db);
    });

    rename();
  },

  down(db) {
    const rollback = db.transaction(() => {
      // Reverse the rename
      db.prepare(
        `UPDATE registered_books SET slug = 'efnafraedi' WHERE slug = 'efnafraedi-2e'`
      ).run();

      for (const table of [
        'segment_edits',
        'module_reviews',
        'edit_history',
        'pending_reviews',
        'feedback',
        'analytics_events',
        'chapter_assignments',
        'localization_edits',
        'sessions_backup',
      ]) {
        db.prepare(`UPDATE ${table} SET book = 'efnafraedi' WHERE book = 'efnafraedi-2e'`).run();
      }

      for (const table of [
        'chapter_generated_files',
        'chapter_generation_log',
        'user_book_access',
        'user_chapter_assignments',
      ]) {
        db.prepare(
          `UPDATE ${table} SET book_slug = 'efnafraedi' WHERE book_slug = 'efnafraedi-2e'`
        ).run();
      }

      // Note: liffraedi deletion is not reversed — it will be re-imported as liffraedi2e
    });

    rollback();
  },
};
