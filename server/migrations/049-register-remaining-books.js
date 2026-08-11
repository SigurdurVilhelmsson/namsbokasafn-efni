/**
 * Migration 049: register the four books no migration ever registered.
 *
 * WHY (register §C51, and §C35 underneath it): on a database built by running
 * every migration over an empty file, `registered_books` contained exactly
 * `edlisfraedi-2e` and `lifraen-efnafraedi`. The other four were absent for TWO
 * different reasons:
 *   ① `019-register-new-books.js` inserts (slug, title_is, status) but `003`
 *      declares `registered_by TEXT NOT NULL`. **INSERT OR IGNORE swallows the
 *      NOT NULL violation** — no exception, no row — so `liffraedi-2e` and
 *      `orverufraedi` silently vanished. `029-register-preview-books.js` has the
 *      same shape WITH `registered_by` and succeeded, which is why exactly two
 *      books existed. That asymmetry is §C35.
 *   ② `efnafraedi-2e` and `stjornufraedi` were registered by **no migration at
 *      all** — only by an admin clicking through `bookRegistration.js`.
 *
 * ⚠️ 019 IS NOT EDITED. Migrations are append-only; this one supersedes it.
 *
 * 🔴 WHY THIS STOPPED BEING COSMETIC. Before §C36 B4b-1 the matcher was
 * fail-OPEN: an unregistered book still got every match, merely with
 * `isPrimary: false`. B4b-1 made it fail-CLOSED — `buildScope` returns
 * `{unscoped:'unregistered'}` and every hit is dropped. So on any freshly
 * migrated database the editor's terminology panel returned **zero matches for
 * four of six books, silently**, including the flagship chemistry one. That is
 * every new dev box, every E2E run before `seed-fixture.js` compensated, and —
 * the one that matters — **any disaster recovery that rebuilds from migrations
 * rather than restoring `sessions.db`**. Production itself was measured clear
 * (all six registered by an admin, long ago), which set the severity but does
 * not remove the exposure.
 *
 * ⚠️ TITLES ARE PRODUCTION'S, READ READ-ONLY FROM THE LIVE BOX 2026-08-11 — not
 * invented here. A fresh install must not disagree with prod about a book's
 * displayed name. `INSERT OR IGNORE` never rewrites an existing row, so this
 * cannot overwrite what an admin already typed; the titles matter only where the
 * row is new.
 *
 * ⚠️ `registered_by = 'system'` follows 029's idiom. Production's admin-created
 * rows carry a real user id and are left untouched.
 *
 * 🔴 THE ORDERING TRAP, AND WHY THIS MIGRATION ALSO TOUCHES PRIORITIES.
 * `migrationRunner` calls every `up()` IN ORDER on EVERY server start, so on the
 * first boot carrying 049, migrations 046 and 047 have **already run** — and both
 * skip books that were not registered at the time (`047`: "a book absent from
 * registered_books is skipped, not an error"). Registering here and stopping
 * would leave four books registered but scoped to NOTHING until the *next* boot,
 * which is precisely the failure spec §10 exists to prevent. So 049 re-runs 047's
 * reconcile after registering.
 *
 * ⚠️ IT CALLS 047 RATHER THAN COPYING ITS LOOP, DELIBERATELY. 047 is idempotent
 * by construction — its own header calls it "ENFORCEMENT, NOT A ONE-TIME SEED",
 * it clears and re-inserts each mapped book's rows, and it already runs on every
 * boot — so invoking it a second time within one boot is a no-op-shaped repeat,
 * not a second writer. Copying the loop would create a second owner of the
 * priority-seeding rule, which is how two sites drift apart and neither notices.
 * 047 is frozen (append-only), so this coupling cannot rot underneath us.
 *
 * ⚠️ NEVER THROW. `migrationRunner` runs `up()` unconditionally on every start and
 * `failLoudOnMigrationErrors` turns a collected error into `exit(1)` — a throw
 * here wedges the box permanently. `up()` below is nothing but the never-throw
 * boundary around the whole unit, per 048's worked example: a guard placed around
 * the interesting line instead of the whole unit is exactly how migration 048's
 * cause ⑤ escaped.
 */
const reconcileDomainPriority = require('./047-reconcile-domain-priority');
const { BOOK_DOMAIN_PRIORITY } = require('../lib/domains');

/**
 * slug → title_is, both taken from production 2026-08-11.
 * `efnafraedi-2e`'s title also matches what `015-rename-book-slugs.js` sets.
 */
const BOOKS = [
  ['efnafraedi-2e', 'Efnafræði 2e'],
  ['liffraedi-2e', 'Líffræði 2e'],
  ['orverufraedi', 'Örverufræði'],
  ['stjornufraedi', 'Stjörnufræði'],
];

/**
 * The whole migration. Separated from `up()` for one reason: so `up()` can be
 * nothing but the never-throw boundary and no future edit can land a statement
 * accidentally outside it.
 */
function migrate(db) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO registered_books (slug, title_is, registered_by, status) VALUES (?, ?, 'system', 'active')"
  );
  const present = db.prepare('SELECT 1 FROM registered_books WHERE slug = ?');

  const added = [];
  const run = db.transaction(() => {
    for (const [slug, title] of BOOKS) {
      if (present.get(slug)) continue; // already registered — leave the row alone
      const res = insert.run(slug, title);
      if (res.changes > 0) added.push(slug);
    }
  });
  run();

  // ⚠️ VERIFY BY READING THE TABLE BACK, NOT BY TRUSTING `changes`. The defect
  // this migration exists to fix was invisible for exactly that reason: an
  // `INSERT OR IGNORE` that violates NOT NULL reports **no error and no row**,
  // and `changes === 0` is indistinguishable from "it was already there". A
  // migration that repeats 019's idiom without measuring its own outcome could
  // repeat 019's silence. This is the control that makes the fix checkable on
  // the box it ran on.
  const stillMissing = BOOKS.map(([slug]) => slug).filter((slug) => !present.get(slug));
  if (stillMissing.length) {
    console.warn(
      `[049] REGISTRATION DID NOT TAKE — ${stillMissing.join(', ')} still absent from ` +
        'registered_books after INSERT OR IGNORE. That statement suppresses NOT NULL and ' +
        'UNIQUE violations silently (register §C35), so this is a real fault, not a no-op: ' +
        'since §C36 B4b-1 the matcher is fail-closed, so these books will match NOTHING and ' +
        'their terminology panel will look empty rather than broken. Inspect the table shape ' +
        'against migration 003 and re-run. NOT THROWN: a throw here would stop this server ' +
        'booting at all.'
    );
  }

  if (added.length === 0) return; // steady state (production, and every later boot)

  // Newly registered books have no book_domain_priority rows: 046 and 047 both
  // ran EARLIER in this same boot and skipped them. Re-run 047's enforcement.
  reconcileDomainPriority.up(db);

  const scopedToNothing = added.filter(
    (slug) =>
      BOOK_DOMAIN_PRIORITY[slug] &&
      db
        .prepare(
          'SELECT COUNT(*) c FROM book_domain_priority p JOIN registered_books b ON b.id = p.book_id WHERE b.slug = ?'
        )
        .get(slug).c === 0
  );

  console.warn(
    `[049] registered ${added.length} book(s) absent from registered_books: ${added.join(', ')}. ` +
      'Domain priorities re-seeded via 047. (§C51/§C35 — expected exactly once per database, ' +
      'on the first boot after this migration ships.)'
  );

  if (scopedToNothing.length) {
    console.warn(
      `[049] SCOPED TO NOTHING — ${scopedToNothing.join(', ')} registered but still have no ` +
        'book_domain_priority rows after re-running 047, though they ARE in ' +
        'BOOK_DOMAIN_PRIORITY. A registered book with no domain chain matches nothing under ' +
        'the fail-closed matcher, which is the exact failure this migration exists to remove. ' +
        'Investigate 047 before trusting the line above.'
    );
  }
}

module.exports = {
  name: '049-register-remaining-books',

  /** ⚠️ The never-throw boundary, and it is the whole of `up()` on purpose. */
  up(db) {
    try {
      migrate(db);
    } catch (err) {
      console.warn(
        `[049] MIGRATION COULD NOT COMPLETE — ${err.code || err.name}: ${err.message}. ` +
          'Nothing is lost: the registration runs inside a transaction and a prepare/DDL ' +
          'failure happens before anything is mutated. The consequence of this NOT completing ' +
          'is that up to four books stay unregistered, and since §C36 B4b-1 an unregistered ' +
          'book matches NOTHING — an empty terminology panel that looks like missing data ' +
          'rather than a fault. This migration re-attempts on the next server start. ' +
          'NOT THROWN ON PURPOSE: throwing here would stop this server booting at all.'
      );
    }
  },
};
