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
 *
 * ⚠️ §C119 — IT NOW REPORTS WHAT IT OVERWROTE, AND THAT IS THE WHOLE ADDITION.
 * The enforcement above is unchanged and correct. What was missing is that it
 * ran BLIND: DELETE + re-INSERT unconditionally, so it could not tell "already
 * matches" from "I have just undone an operator's change". Measured 2026-08-31:
 * a hand-made trim of lifraen-efnafraedi to ["chemistry"] was live in a deploy's
 * own DB backup at 06:28:19 and gone in the cron backup at 06:30:01 — 102
 * seconds, one restart, no error, no log line, no gate — discovered days later
 * from a glossary that had silently doubled. The paragraph above PREDICTED it
 * ("would silently revert an editorial reorder"); a hand-run SQL statement IS
 * the user-writable case it warned about.
 *
 * The verdict goes to pipeline-output/.domain-priority-reconcile.json and is
 * surfaced by lib/domainPriorityHealth.js through /api/health, which
 * ./scripts/deploy.sh prints — the deploy being where the operator actually
 * stands. A log line at boot goes to journalctl, which nobody was reading.
 *
 * ⚠️ 047 RUNS TWICE PER BOOT: migrationRunner calls it, and 049 calls it again
 * after registering books. A second, clean call must not ERASE the first call's
 * alarm, so reverts ACCUMULATE per process and the file is rewritten with the
 * union. A fresh boot reloads this module and starts empty.
 *
 * ⚠️ THE WRITE IS BEST-EFFORT AND MUST STAY THAT WAY. migrationRunner calls up()
 * on every start and failLoudOnMigrationErrors exit(1)s on a collected error, so
 * a throw here is not a failed report — it is a server that never boots again.
 */
const fs = require('fs');
const path = require('path');
const { BOOK_DOMAIN_PRIORITY } = require('../lib/domains');
const { reconcileDiff } = require('../lib/domainPriorityReconcile');

const STATUS_PATH = path.join(
  __dirname, '..', '..', 'pipeline-output', '.domain-priority-reconcile.json'
);

/** Reverts seen so far in THIS process. See the twice-per-boot note above. */
let bootReverted = [];

module.exports = {
  name: '047-reconcile-domain-priority',

  /** Test seam: a fresh process starts empty, so only tests need this. */
  _resetBootState() {
    bootReverted = [];
  },

  /**
   * @param {import('better-sqlite3').Database} db
   * @param {{statusPath?: string, now?: string}} [opts] test seam
   * @returns {{reverted: Array<{slug:string, before:string[], after:string[]}>}}
   */
  up(db, opts = {}) {
    const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?');
    const clear = db.prepare('DELETE FROM book_domain_priority WHERE book_id = ?');
    const ins = db.prepare(
      'INSERT INTO book_domain_priority (book_id, domain, position) VALUES (?,?,?)'
    );
    const existing = db.prepare(
      'SELECT domain FROM book_domain_priority WHERE book_id = ? ORDER BY position'
    );

    const changed = [];
    const run = db.transaction(() => {
      for (const [slug, domains] of Object.entries(BOOK_DOMAIN_PRIORITY)) {
        const row = book.get(slug);
        if (!row) continue; // a book not registered on this box is not an error
        // Read BEFORE clearing: this is the only moment the operator's actual
        // state exists, and reading it is what makes a revert distinguishable
        // from a no-op. Order is semantic — `position` decides which domain
        // wins a contested headword — so a reorder counts as a change.
        const before = existing.all(row.id).map((r) => r.domain);
        const diff = reconcileDiff(before, domains);
        // Only an OVERWRITE is someone's work being undone; a seed is a book
        // being scoped for the first time and must not raise the alarm.
        if (diff.kind === 'overwrite') changed.push({ slug, before: diff.before, after: diff.after });
        clear.run(row.id);
        domains.forEach((domain, i) => ins.run(row.id, domain, i + 1));
      }
    });
    run();

    try {
      for (const c of changed) {
        if (!bootReverted.some((p) => p.slug === c.slug)) bootReverted.push(c);
      }
      const statusPath = opts.statusPath || STATUS_PATH;
      fs.mkdirSync(path.dirname(statusPath), { recursive: true });
      fs.writeFileSync(
        statusPath,
        JSON.stringify({ ran: opts.now || new Date().toISOString(), reverted: bootReverted }, null, 2) + '\n',
        'utf8'
      );
      if (changed.length) {
        console.warn(
          `[047] overwrote live book_domain_priority rows for ${changed.length} book(s): ` +
            changed.map((c) => `${c.slug} [${c.before.join(',')}] -> [${c.after.join(',')}]`).join('; ') +
            '. This table is re-asserted from server/lib/domains.js on EVERY boot — ' +
            'a deliberate change belongs there, not in SQL.'
        );
      }
    } catch {
      /* reporting is never allowed to wedge the boot */
    }

    return { reverted: changed };
  },
};
