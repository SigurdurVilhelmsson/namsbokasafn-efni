// server/__tests__/migrationsRealTree.test.js
/**
 * Spec §10's real-tree assertion: "every registered book has a
 * book_domain_priority row — the failure mode this design exists to remove is a
 * book silently scoped to nothing."
 *
 * ⚠️ Built by running EVERY migration against an EMPTY database, not by seeding
 * a fixture. migration046.test.js seeds registered_books with exactly the slugs
 * the priority map contains, so its "a book scoped to nothing is the bug"
 * assertion is self-fulfilling: the fixture IS the map (register §C36 finding 3).
 *
 * ⚠️ Deliberately does NOT call runAllMigrations(). That function takes no db
 * argument — it resolves DB_PATH at module load from resolveDbPath() — so
 * driving it means setting process.env.SESSIONS_DB_PATH before the require and
 * never restoring it. With vitest's fileParallelism disabled, that is exactly
 * the shared-state mutation CLAUDE.md warns can affect later files. Requiring
 * the migration modules directly is deterministic and touches no global.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { BOOK_DOMAIN_PRIORITY, DOMAIN_SET } = require('../lib/domains');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const freshDb = freshMigratedDb; // same shape: { db, errors, applied }

describe('the migration set applies cleanly to an empty database', () => {
  it('reports no errors', () => {
    const { db, errors } = freshDb();
    expect(errors).toEqual([]);
    db.close();
  });
});

describe('a fresh clone, built by the migrations themselves', () => {
  it('gives every REGISTERED book in the map a domain priority row', () => {
    const { db } = freshDb();
    const scopedToNothing = db
      .prepare('SELECT id, slug FROM registered_books')
      .all()
      .filter((b) => BOOK_DOMAIN_PRIORITY[b.slug])
      .filter(
        (b) =>
          db.prepare('SELECT COUNT(*) c FROM book_domain_priority WHERE book_id=?').get(b.id).c ===
          0
      )
      .map((b) => b.slug);
    expect(scopedToNothing).toEqual([]);
    db.close();
  });

  it('registers EVERY mapped book — a fresh clone leaves none behind', () => {
    const { db } = freshDb();
    const slugs = new Set(
      db
        .prepare('SELECT slug FROM registered_books')
        .all()
        .map((r) => r.slug)
    );
    const absent = Object.keys(BOOK_DOMAIN_PRIORITY).filter((s) => !slugs.has(s));

    // ⚠️ THIS ASSERTION INVERTED ON 2026-08-11, AND THE INVERSION IS THE POINT.
    // It used to pin `absent` EQUAL to ['efnafraedi-2e','liffraedi-2e',
    // 'orverufraedi','stjornufraedi'] — deliberately recording a state its own
    // comment said was NOT correct, so that fixing §C35 would turn it red and
    // force a considered update rather than letting the improvement pass
    // unnoticed. Migration 049 is that fix, so the handshake is now collected:
    // the pin becomes `[]` and stays a live detector instead of a memorial.
    //
    // §C35 was TWO defects: 019-register-new-books.js omits the NOT NULL
    // `registered_by` that 003 declares (INSERT OR IGNORE swallows the
    // violation, so its two rows silently vanished), and efnafraedi-2e +
    // stjornufraedi were registered by no migration at all. 019 is NOT edited —
    // migrations are append-only; 049 supersedes it.
    //
    // ⚠️ WHY THIS MATTERS MORE THAN IT LOOKS (§C51): since §C36 B4b-1 the
    // matcher is fail-CLOSED, so an unregistered book matches NOTHING. A fresh
    // install or a rebuild-from-migrations disaster recovery would have served
    // an empty terminology panel for four of six books, silently.
    expect(absent).toEqual([]);
    // Presence asserted directly too, not only via the absent-list shape: a
    // future migration that dropped a registration while also dropping the book
    // from BOOK_DOMAIN_PRIORITY would leave `absent` empty and say nothing.
    expect([...slugs].filter((s) => BOOK_DOMAIN_PRIORITY[s]).sort()).toEqual(
      Object.keys(BOOK_DOMAIN_PRIORITY).sort()
    );
    db.close();
  });

  it('every seeded domain is one of the seven', () => {
    const { db } = freshDb();
    const bad = db
      .prepare('SELECT DISTINCT domain FROM book_domain_priority')
      .all()
      .map((r) => r.domain)
      .filter((d) => !DOMAIN_SET.has(d));
    expect(bad).toEqual([]);
    db.close();
  });

  it('positions are dense and start at 1 for every book that has any', () => {
    const { db } = freshDb();
    for (const b of db.prepare('SELECT DISTINCT book_id FROM book_domain_priority').all()) {
      const pos = db
        .prepare('SELECT position FROM book_domain_priority WHERE book_id=? ORDER BY position')
        .all(b.book_id)
        .map((r) => r.position);
      expect(pos, `book_id ${b.book_id}`).toEqual(pos.map((_, i) => i + 1));
    }
    db.close();
  });
});
