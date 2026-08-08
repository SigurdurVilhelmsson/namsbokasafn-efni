// server/__tests__/migration047.test.js
/**
 * Migration 047 reconciles book_domain_priority, rather than only asserting it.
 *
 * Register §C36 finding 2: migrationRunner calls every migration's up()
 * unconditionally on every start, so 046's INSERT OR REPLACE is repeated
 * *enforcement*, not a one-time seed — and it can never REMOVE a row. A domain
 * dropped from a book's list kept its old `position` and kept influencing every
 * ORDER BY position consumer, forever.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration045 = require('../migrations/045-concept-model');
const migration046 = require('../migrations/046-seed-domain-priority');
const migration047 = require('../migrations/047-reconcile-domain-priority');
const { BOOK_DOMAIN_PRIORITY } = require('../lib/domains');

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE registered_books (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE);');
  migration045.up(db);
});
afterEach(() => db.close());

const registerChemistry = () =>
  db.prepare('INSERT INTO registered_books (id, slug) VALUES (1, ?)').run('efnafraedi-2e');

const domainsFor = (bookId) =>
  db
    .prepare('SELECT domain FROM book_domain_priority WHERE book_id=? ORDER BY position')
    .all(bookId)
    .map((r) => r.domain);

describe('migration 047 reconciles book_domain_priority', () => {
  it('seeds a registered book with its ordered domains', () => {
    registerChemistry();
    migration047.up(db);
    expect(domainsFor(1)).toEqual([...BOOK_DOMAIN_PRIORITY['efnafraedi-2e']]);
  });

  it('DELETES an orphaned domain that is no longer in the map', () => {
    registerChemistry();
    db.prepare('INSERT INTO book_domain_priority (book_id, domain, position) VALUES (1, ?, ?)').run(
      'astronomy',
      99
    );

    migration047.up(db);

    expect(domainsFor(1)).not.toContain('astronomy');
    expect(domainsFor(1)).toEqual([...BOOK_DOMAIN_PRIORITY['efnafraedi-2e']]);
  });

  it('cleans up after 046, which cannot remove what it once seeded', () => {
    registerChemistry();
    migration046.up(db);
    // A domain 046 seeded in some earlier release, since dropped from the map.
    db.prepare('INSERT INTO book_domain_priority (book_id, domain, position) VALUES (1, ?, ?)').run(
      'mathematics',
      4
    );
    expect(domainsFor(1)).toContain('mathematics');

    migration047.up(db);

    expect(domainsFor(1)).toEqual([...BOOK_DOMAIN_PRIORITY['efnafraedi-2e']]);
  });

  it('is idempotent across repeated boots', () => {
    registerChemistry();
    migration047.up(db);
    const first = db
      .prepare('SELECT book_id, domain, position FROM book_domain_priority ORDER BY position')
      .all();
    migration047.up(db);
    migration047.up(db);
    const third = db
      .prepare('SELECT book_id, domain, position FROM book_domain_priority ORDER BY position')
      .all();
    expect(third).toEqual(first);
  });

  it('positions are dense and start at 1', () => {
    registerChemistry();
    migration047.up(db);
    const pos = db
      .prepare('SELECT position FROM book_domain_priority WHERE book_id=1 ORDER BY position')
      .all()
      .map((r) => r.position);
    expect(pos).toEqual(pos.map((_, i) => i + 1));
  });

  it('leaves a book that is not registered on this box alone', () => {
    migration047.up(db);
    expect(db.prepare('SELECT COUNT(*) c FROM book_domain_priority').get().c).toBe(0);
  });

  it('does not touch another book while reconciling one', () => {
    registerChemistry();
    db.prepare('INSERT INTO registered_books (id, slug) VALUES (2, ?)').run('stjornufraedi');
    migration047.up(db);
    expect(domainsFor(2)).toEqual([...BOOK_DOMAIN_PRIORITY['stjornufraedi']]);
  });

  it('does not delete a row belonging to a book outside the map', () => {
    registerChemistry();
    db.prepare('INSERT INTO registered_books (id, slug) VALUES (9, ?)').run('__e2e-fixture__');
    db.prepare('INSERT INTO book_domain_priority (book_id, domain, position) VALUES (9, ?, ?)').run(
      'chemistry',
      1
    );

    migration047.up(db);

    // The fixture book is not in BOOK_DOMAIN_PRIORITY, so 047 must not touch it.
    expect(domainsFor(9)).toEqual(['chemistry']);
  });
});
