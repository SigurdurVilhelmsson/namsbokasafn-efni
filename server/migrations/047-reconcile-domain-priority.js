/**
 * Migration 047: reconcile each book's domain fallback order.
 *
 * ⚠️ THIS IS ENFORCEMENT, NOT A ONE-TIME SEED — and that is deliberate.
 * `migrationRunner` calls every migration's `up()` unconditionally on every
 * server start (there is no applied-migrations gate for the modern pattern), so
 * this runs on every boot. Migration 046 relied on that with INSERT OR REPLACE,
 * which keeps existing rows correct but can never REMOVE one: shortening a
 * book's list left the dropped domain sitting at its old `position`, still
 * voting in every ORDER BY position consumer, forever. (Register §C36 finding 2.)
 *
 * Deleting the book's rows before re-inserting fixes that and stays idempotent.
 *
 * ⚠️ 046 IS SHIPPED AND IS NOT EDITED — migrations are append-only. It still
 * runs first on every boot; 047 runs after it and wins.
 *
 * ⚠️ 047 owns the map FOR THE BOOKS IT NAMES. It iterates
 * Object.entries(BOOK_DOMAIN_PRIORITY), so a book DELETED from that map is not
 * cleared here — 046 re-seeds it on the next boot from its own frozen PRIORITIES
 * and these rows survive, describing a book the map no longer mentions. Absence
 * from the map means "not managed here", not "remove its rows". Closing that
 * properly is a Part B design item (a guard against removal-while-registered);
 * a blanket clear would leave a registered book scoped to nothing, which is the
 * bug spec §10 exists to prevent.
 *
 * ⚠️ MEASURED 2026-08-08: nothing writes book_domain_priority except migration
 * 046 and tests — no route, no service, no admin control. The every-boot
 * re-assert is therefore correct today. **If the table is ever made
 * user-writable, this must be revisited**, because the same repeated execution
 * that removes an orphan would silently revert an editorial reorder. That is a
 * Part C decision; it is recorded in the register, not settled here.
 *
 * ⚠️ Only books named in BOOK_DOMAIN_PRIORITY are touched. A book with rows but
 * no entry in the map — the E2E fixture book, say — is left alone rather than
 * cleared, because "not in the map" means "not managed here", not "stale".
 *
 * ⚠️ A book absent from registered_books is skipped, not an error — and on a
 * FRESH CLONE that is most of them. Measured against a database built by running
 * every migration over an empty file: only `lifraen-efnafraedi` and
 * `edlisfraedi-2e` are registered, because `019-register-new-books.js` omits the
 * NOT NULL `registered_by` column that `003` declares and INSERT OR IGNORE
 * silently discards its two rows (§C35), while `029` supplies it and succeeds.
 * `efnafraedi-2e` and `stjornufraedi` are registered by no migration at all.
 * They pick up their rows on the next boot after the admin route registers them.
 * Fixing §C35 is a separate item; migrationsRealTree.test.js makes the state
 * visible rather than asserting a fixture back to itself.
 */
const { BOOK_DOMAIN_PRIORITY } = require('../lib/domains');

module.exports = {
  name: '047-reconcile-domain-priority',

  up(db) {
    const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?');
    const clear = db.prepare('DELETE FROM book_domain_priority WHERE book_id = ?');
    const ins = db.prepare(
      'INSERT INTO book_domain_priority (book_id, domain, position) VALUES (?,?,?)'
    );
    const run = db.transaction(() => {
      for (const [slug, domains] of Object.entries(BOOK_DOMAIN_PRIORITY)) {
        const row = book.get(slug);
        if (!row) continue; // a book not registered on this box is not an error
        clear.run(row.id);
        domains.forEach((domain, i) => ins.run(row.id, domain, i + 1));
      }
    });
    run();
  },
};
