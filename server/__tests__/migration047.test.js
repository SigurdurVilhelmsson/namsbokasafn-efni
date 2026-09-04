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
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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

/**
 * §C119 — 047 must be able to tell a NO-OP from a REVERT, and must say so.
 *
 * The enforcement itself is unchanged and correct. What was missing is that it
 * ran blind, so the 2026-08-31 trim vanished in 102 seconds with no error, no
 * log line and no gate. These pin the reporting, not the enforcement.
 */
describe('migration 047 reports what its enforcement overwrote (§C119)', () => {
  let statusPath, tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm047-'));
    statusPath = path.join(tmpRoot, 'pipeline-output', 'status.json');
    migration047._resetBootState();
  });
  afterEach(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

  const readStatus = () => JSON.parse(fs.readFileSync(statusPath, 'utf8'));

  it('reports nothing reverted when it only seeds a fresh book', () => {
    registerChemistry();
    const r = migration047.up(db, { statusPath });
    expect(r.reverted).toEqual([]);
  });

  it('writes a status file even on a clean run, so a stale alarm cannot linger', () => {
    registerChemistry();
    migration047.up(db, { statusPath });
    expect(readStatus().reverted).toEqual([]);
  });

  // THE INCIDENT, reproduced: a hand-made trim, then a boot.
  it('REPORTS the revert when a hand-trimmed list is overwritten', () => {
    registerChemistry();
    migration047.up(db, { statusPath }); // seed
    db.prepare("DELETE FROM book_domain_priority WHERE book_id=1 AND domain<>'chemistry'").run();
    migration047._resetBootState();
    const r = migration047.up(db, { statusPath });
    expect(r.reverted).toEqual([
      { slug: 'efnafraedi-2e', before: ['chemistry'], after: [...BOOK_DOMAIN_PRIORITY['efnafraedi-2e']] },
    ]);
  });

  it('persists that revert where the health check will find it', () => {
    registerChemistry();
    migration047.up(db, { statusPath });
    db.prepare("DELETE FROM book_domain_priority WHERE book_id=1 AND domain<>'chemistry'").run();
    migration047._resetBootState();
    migration047.up(db, { statusPath, now: '2026-08-31T06:29:00.000Z' });
    expect(readStatus()).toEqual({
      ran: '2026-08-31T06:29:00.000Z',
      reverted: [
        { slug: 'efnafraedi-2e', before: ['chemistry'], after: [...BOOK_DOMAIN_PRIORITY['efnafraedi-2e']] },
      ],
    });
  });

  // 047 RUNS TWICE PER BOOT (migrationRunner, then 049). Without accumulation
  // the second, clean call rewrites the file with an empty list and the alarm
  // that the first call raised is GONE — the guard would delete its own finding.
  // REAL accumulation: two DIFFERENT books revert on two different calls and
  // BOTH must survive. The weaker "revert then clean, expect length 1" is
  // satisfied by `bootReverted = [c]`, which accumulates nothing — measured:
  // that mutant survived the whole file until this test existed.
  it('ACCUMULATES reverts across calls, so an earlier book is not dropped', () => {
    // Derive the second book from the map rather than naming a domain: an
    // earlier version deleted `domain<>'chemistry'` for lifraen-efnafraedi and
    // broke the moment §C119 scoped that book to chemistry only, because the
    // DELETE then removed nothing and there was no revert to accumulate. A
    // test that hard-codes another module's DATA breaks on a data change and
    // says nothing about the behaviour it is meant to pin.
    const second = Object.keys(BOOK_DOMAIN_PRIORITY).find(
      (slug) => slug !== 'efnafraedi-2e' && BOOK_DOMAIN_PRIORITY[slug].length > 1
    );
    db.prepare('INSERT INTO registered_books (id, slug) VALUES (2, ?)').run(second);
    registerChemistry();
    migration047.up(db, { statusPath }); // seed both
    migration047._resetBootState();

    // Drop the LAST row of each: an overwrite regardless of what the lists hold.
    const dropLast = (bookId) =>
      db
        .prepare(
          'DELETE FROM book_domain_priority WHERE book_id=? AND position=' +
            '(SELECT MAX(position) FROM book_domain_priority WHERE book_id=?)'
        )
        .run(bookId, bookId);

    dropLast(1);
    migration047.up(db, { statusPath }); // chemistry reverted
    dropLast(2);
    migration047.up(db, { statusPath }); // the second book reverted, on a LATER call

    expect(readStatus().reverted.map((r) => r.slug).sort()).toEqual(
      ['efnafraedi-2e', second].sort()
    );
  });

  it('a second clean call in the same boot does NOT erase the first call alarm', () => {
    registerChemistry();
    migration047.up(db, { statusPath });
    db.prepare("DELETE FROM book_domain_priority WHERE book_id=1 AND domain<>'chemistry'").run();
    migration047._resetBootState();
    migration047.up(db, { statusPath }); // reverts — raises the alarm
    migration047.up(db, { statusPath }); // clean — must not erase it
    expect(readStatus().reverted).toHaveLength(1);
  });

  // A REORDER is a change: position decides which domain wins a contested
  // headword, so swapping two rows is not cosmetic.
  it('reports a reorder as a revert', () => {
    registerChemistry();
    migration047.up(db, { statusPath });
    db.prepare('UPDATE book_domain_priority SET position = 99 WHERE book_id=1 AND domain=?')
      .run(BOOK_DOMAIN_PRIORITY['efnafraedi-2e'][0]);
    migration047._resetBootState();
    expect(migration047.up(db, { statusPath }).reverted).toHaveLength(1);
  });

  // A migration must NEVER throw: migrationRunner calls up() on every start and
  // failLoudOnMigrationErrors exit(1)s, so a reporting failure would be a server
  // that never boots again.
  it('still reconciles, and does not throw, when the status file cannot be written', () => {
    registerChemistry();
    const blocked = path.join(tmpRoot, 'a-file');
    fs.writeFileSync(blocked, 'x');
    expect(() => migration047.up(db, { statusPath: path.join(blocked, 'nope.json') })).not.toThrow();
    expect(domainsFor(1)).toEqual([...BOOK_DOMAIN_PRIORITY['efnafraedi-2e']]);
  });
});
