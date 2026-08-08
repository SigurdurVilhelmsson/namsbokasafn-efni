// server/lib/conceptResolver.js
'use strict';
/**
 * §C36 Part B1 — the terminology resolver.
 *
 * Spec: docs/superpowers/specs/2026-08-08-terminology-concept-model-part-b1-design.md
 *
 * ⚠️ INERT. Nothing calls this yet: B3 cuts the glossary export over, B4 the
 * editor. It reads only tables Part A created, which hold 0 rows on production.
 *
 * The split is the performance design. Everything per-(book, chapter) is hoisted
 * into a Scope built ONCE; resolveCandidates is then PURE, so the editor can call
 * it 47,568 times without reproducing §C24's event-loop block.
 *
 * `db` is always passed EXPLICITLY, never taken from terminologyService's
 * singleton — that keeps this module testable and free of ambient state.
 */

/**
 * Build the per-(book, chapter) scope.
 *
 * ⚠️ Returns WHICH fault, not a boolean (spec D3). 'unregistered' and
 * 'no-priorities' have different remedies — the admin route vs a migration — and
 * collapsing them repeats one level down the very failure D3 exists to prevent.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} bookSlug
 * @param {number} [chapter] 0 = book default · 1..n = chapter · -1 = appendices
 * @returns {{unscoped:'unregistered'}|{unscoped:'no-priorities'}|object}
 */
function buildScope(db, bookSlug, chapter = 0) {
  const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
  if (!book) return { unscoped: 'unregistered' };

  const prio = db
    .prepare(
      'SELECT domain, position FROM book_domain_priority WHERE book_id = ? ORDER BY position'
    )
    .all(book.id);
  if (prio.length === 0) return { unscoped: 'no-priorities' };

  return {
    bookId: book.id,
    chapter,
    positionOf: new Map(prio.map((r) => [r.domain, r.position])),
    preference: new Map(),
    unscoped: false,
  };
}

module.exports = { buildScope };
