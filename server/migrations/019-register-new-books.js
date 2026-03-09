/**
 * Migration 019: Register liffraedi-2e and orverufraedi
 *
 * Adds Biology 2e and Microbiology to the registered_books table
 * so they appear in editor dropdowns.
 */

module.exports = {
  name: '019-register-new-books',

  up(db) {
    const insert = db.prepare(
      "INSERT OR IGNORE INTO registered_books (slug, title_is, status) VALUES (?, ?, 'active')"
    );
    insert.run('liffraedi-2e', 'Líffræði 2e');
    insert.run('orverufraedi', 'Örverufræði');
  },
};
