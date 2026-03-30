/**
 * Migration 033: Fix organic chemistry slug (underscore → hyphen)
 *
 * The book was registered via the admin UI with slug 'lifraen_efnafraedi'
 * (underscore), but the canonical slug used in the filesystem and hardcoded
 * defaults is 'lifraen-efnafraedi' (hyphen). This mismatch causes the book
 * to appear twice in dropdown menus — once from the hardcoded default and
 * once from the DB row.
 *
 * Updates the slug across all tables that store it as a text reference.
 */

module.exports = {
  name: '033-fix-organic-chemistry-slug',

  up(db) {
    const oldSlug = 'lifraen_efnafraedi';
    const newSlug = 'lifraen-efnafraedi';

    const row = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(oldSlug);
    if (!row) return; // Nothing to fix

    const fix = db.transaction(() => {
      // Canonical source
      db.prepare('UPDATE registered_books SET slug = ? WHERE slug = ?').run(newSlug, oldSlug);

      // Tables with column "book" (text slug)
      for (const table of [
        'segment_edits',
        'module_reviews',
        'edit_history',
        'pending_reviews',
        'feedback',
        'analytics_events',
        'chapter_assignments',
        'localization_edits',
      ]) {
        db.prepare(`UPDATE ${table} SET book = ? WHERE book = ?`).run(newSlug, oldSlug);
      }

      // Tables with column "book_slug" (text slug)
      for (const table of [
        'chapter_generated_files',
        'chapter_generation_log',
        'user_book_access',
        'user_chapter_assignments',
      ]) {
        db.prepare(`UPDATE ${table} SET book_slug = ? WHERE book_slug = ?`).run(newSlug, oldSlug);
      }
    });

    fix();
  },
};
