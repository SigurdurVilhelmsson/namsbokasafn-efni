/**
 * Migration 044: remap two books off subjects that carry no terminology.
 *
 * Migration 032 seeded `lifraen-efnafraedi → organic-chemistry` and
 * `orverufraedi → microbiology`. Measured on production 2026-08-07: **no
 * translation row anywhere carries either subject** — the only subjects with
 * data are biology (13,561), mathematics (9,137), physics (5,496) and
 * chemistry (709). Both books were therefore mapped to subjects that cannot
 * match anything.
 *
 * The consequences were silent in both directions. `exportBookGlossary`'s
 * subject scope is deliberately strict, so organic's glossary export produced
 * **0 terms** — which read as a shrink refusal rather than a mapping fault.
 * And `findTermsInSegments` resolves tiers through the book's subject, so
 * editors on both books saw an empty terminology panel with nothing to
 * indicate why. `orverufraedi` was worse hidden than organic: it has no
 * `glossary/` directory, so it never appears in the export at all and no
 * refusal, alarm or staleness clock could ever fire for it.
 *
 * Lead ruling 2026-08-07 (register §C14 ②): map each to the parent discipline
 * whose collection Árnastofnun actually maintains — the Icelandic Chemical
 * Society is responsible for all of chemistry, and microbiology's terminology
 * lives in the biology collection.
 *
 * ⚠️ This RE-ASSERTS on every boot, because migrations re-run. That is safe
 * today precisely because nothing else writes `book_subject_mapping`: the only
 * writers are 032's seed and the E2E fixture, and no API route sets a book's
 * subject. **If a runtime route to change a book's subject is ever added, this
 * migration must be revisited** — it would silently revert such a change on the
 * next restart. Pinned by the last test in `migration044.test.js`.
 *
 * Idempotent: an UPDATE to the value already present is a no-op, and a book
 * with no mapping row is simply not matched (this migration never INSERTs — a
 * book without a row is 032's business, not ours).
 */

const REMAPPINGS = [
  ['lifraen-efnafraedi', 'chemistry'],
  ['orverufraedi', 'biology'],
];

module.exports = {
  name: '044-remap-empty-subjects',

  up(db) {
    const remap = db.prepare(`
      UPDATE book_subject_mapping
         SET primary_subject = ?
       WHERE book_id = (SELECT id FROM registered_books WHERE slug = ?)
    `);

    for (const [slug, subject] of REMAPPINGS) {
      remap.run(subject, slug);
    }
  },
};
