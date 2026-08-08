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
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { BOOK_DOMAIN_PRIORITY, DOMAIN_SET } = require('../lib/domains');

function freshDb() {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-clone-')), 'sessions.db');
  const db = new Database(p);
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}-.*\.js$/.test(f))
    .sort(); // zero-padded, so lexical order IS migration order
  const errors = [];
  for (const f of files) {
    try {
      require(path.join(dir, f)).up(db);
    } catch (e) {
      errors.push(`${f}: ${e.message}`);
    }
  }
  return { db, errors, applied: files.length };
}

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

  it('records which mapped books a fresh clone does NOT register', () => {
    const { db } = freshDb();
    const slugs = new Set(
      db
        .prepare('SELECT slug FROM registered_books')
        .all()
        .map((r) => r.slug)
    );
    const absent = Object.keys(BOOK_DOMAIN_PRIORITY).filter((s) => !slugs.has(s));

    // ⚠️ NOT an assertion that this is correct — it is NOT. §C35:
    // 019-register-new-books.js omits the NOT NULL registered_by column that 003
    // declares, and INSERT OR IGNORE silently discards its two rows, while 029
    // supplies it and succeeds; efnafraedi-2e and stjornufraedi are registered
    // by no migration at all. Pinned so that FIXING §C35 turns this red and
    // forces the list to be updated deliberately, rather than the improvement
    // passing unnoticed. If this fails, read the diff before touching the list.
    expect(absent.sort()).toEqual(
      ['efnafraedi-2e', 'liffraedi-2e', 'orverufraedi', 'stjornufraedi'].sort()
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
