/**
 * Migration 046: seed each book's domain fallback order.
 *
 * Replaces book_subject_mapping's single primary_subject with an ORDERED list.
 * The first fallback entry is load-bearing: efnafraedi-2e's `biology` is what
 * returns pH, bond and carbon dioxide — 112 correct chemistry terms that the
 * old strict subject scope discarded for want of anywhere to fall back to.
 *
 * ⚠️ book_subject_mapping is NOT touched here. Part C removes it, once nothing
 * reads it.
 */
const PRIORITIES = {
  'efnafraedi-2e': ['chemistry', 'physics', 'biology'],
  'lifraen-efnafraedi': ['chemistry', 'biology', 'physics'],
  'liffraedi-2e': ['biology', 'anatomy-physiology', 'chemistry'],
  orverufraedi: ['biology', 'anatomy-physiology', 'chemistry'],
  'edlisfraedi-2e': ['physics', 'astronomy', 'mathematics', 'earth-science', 'chemistry'],
  stjornufraedi: ['astronomy', 'physics', 'earth-science', 'mathematics'],
};

module.exports = {
  name: '046-seed-domain-priority',

  up(db) {
    const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?');
    const ins = db.prepare(
      `INSERT OR REPLACE INTO book_domain_priority (book_id, domain, position) VALUES (?,?,?)`
    );
    const run = db.transaction(() => {
      for (const [slug, domains] of Object.entries(PRIORITIES)) {
        const row = book.get(slug);
        if (!row) continue; // a book not registered on this box is not an error
        domains.forEach((domain, i) => ins.run(row.id, domain, i + 1));
      }
    });
    run();
  },
};
