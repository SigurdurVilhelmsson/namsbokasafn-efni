/**
 * Migration 015: Rename efnafraedi → efnafraedi-2e and remove liffraedi
 *
 * Updates all 14 tables that store book slugs as text columns.
 * Also deletes the liffraedi book and its cascading references.
 */

module.exports = {
  name: '015-rename-book-slugs',

  up(db) {
    const rename = db.transaction(() => {
      // --- Rename efnafraedi → efnafraedi-2e across all slug-bearing tables ---

      // registered_books.slug (the canonical source)
      db.prepare(
        `UPDATE registered_books SET slug = 'efnafraedi-2e' WHERE slug = 'efnafraedi'`
      ).run();

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

      // --- Remove liffraedi (no pipeline content, safe to delete) ---

      // Get liffraedi book ID for FK-based cleanup
      const row = db.prepare(`SELECT id FROM registered_books WHERE slug = 'liffraedi'`).get();

      if (row) {
        const bookId = row.id;

        // Clean up FK-referenced tables
        for (const table of ['book_chapters', 'book_sections', 'terminology_terms']) {
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
