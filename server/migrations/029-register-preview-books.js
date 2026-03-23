module.exports = {
  name: '029-register-preview-books',
  up(db) {
    const insert = db.prepare(
      "INSERT OR IGNORE INTO registered_books (slug, title_is, status) VALUES (?, ?, 'active')"
    );
    insert.run('lifraen-efnafraedi', 'Lífræn efnafræði');
    insert.run('edlisfraedi-2e', 'Eðlisfræði 2e');
  },
};
