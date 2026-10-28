// server/__tests__/snapshotRulingStores.test.js
//
// Skerfur plan SD3 (amended 2026-10-24): at the S tag, snapshot every place a chemistry ruling
// lives, read-only, so the approved-term baseline counts every ruling dated before S whether or
// not it has reached production yet. The raw stores are kept, so SD3's two counts can be
// recomputed from the snapshot under whatever definition SD3 settles on.
//
// freshMigratedDb(): every real migration, no hand-copied DDL. It registers chemistry and
// seeds its domain priorities.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { snapshotRulingStores } = require('../scripts/snapshot-ruling-stores');

const BOOK = 'efnafraedi-2e';
let db;

const houseStyle = {
  domain: 'chemistry',
  source: 'server/lib/houseStyleTerms.js',
  terms: [
    { en: ['Celsius'], is: 'Celsíus', ruled: '2026-09-04 [USER]' },
    { en: ['buffer', 'buffer solution'], is: 'stuðpúði', ruled: '2026-09-21 [USER]' },
  ],
};

const compiled = {
  compiledAt: '2026-10-11',
  repoHead: 'b23a1f4df',
  counts: { stage1: 2, before: 1 },
  stage1: [
    { en: 'Buffer', enNorm: 'buffer', is: 'stuðpúði', proposedMechanism: 'none' },
    {
      en: 'microscopic domain',
      enNorm: 'microscopic domain',
      is: 'smásæja sviðið',
      proposedMechanism: 'record-only',
    },
  ],
  before: [{ en: 'Celsius', enNorm: 'celsius', is: 'Celsíus', kind: 'entry' }],
};

function run(overrides = {}) {
  return snapshotRulingStores(db, {
    book: BOOK,
    houseStyle,
    compiled,
    compiledSha256: 'a'.repeat(64),
    repoHead: '0123456789abcdef',
    takenAt: '2026-11-01T00:00:00Z',
    ...overrides,
  });
}

beforeEach(() => {
  ({ db } = freshMigratedDb());
  const bookId = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(BOOK).id;
  const conceptId = db
    .prepare(`INSERT INTO concept (domain, collection) VALUES ('chemistry', 'test')`)
    .run().lastInsertRowid;
  db.prepare(
    `INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'en', 'atom', 0, 'test')`
  ).run(conceptId);
  const isTerm = db
    .prepare(
      `INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', 'frumeind', 0, 'test')`
    )
    .run(conceptId).lastInsertRowid;
  db.prepare(
    `INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?, 2, 'atom', ?)`
  ).run(bookId, isTerm);
});

afterEach(() => {
  db.close();
});

describe('snapshot-ruling-stores', () => {
  it("reads the book's preference rows with the term each one chooses", () => {
    const s = run();
    expect(s.stores.preferences.rows).toEqual([
      { chapter: 2, english: 'atom', term: 'frumeind', lang: 'is', domain: 'chemistry' },
    ]);
  });

  it('keeps every house-style entry with its ruling', () => {
    expect(run().stores.houseStyle.entries).toHaveLength(2);
  });

  it("keeps the compiled set's sha256 as given, beside its counts", () => {
    expect(run().stores.compiled.sha256).toBe('a'.repeat(64));
  });

  // A migrated database already holds the house-style concepts (minted on boot), so the
  // fixture's own two terms are picked out by their source.
  it("reads the concept model in the book's domains", () => {
    const terms = run().stores.conceptModel.terms;
    const fixture = terms.filter((t) => t.source === 'test').map((t) => t.text);
    expect(fixture.sort()).toEqual(['atom', 'frumeind']);
  });

  // The union SD3's recommendation counts: a headword with a recorded ruling in ANY store.
  it('counts a headword once across stores, whatever its case', () => {
    // celsius (house style + before), buffer / buffer solution (house style; Buffer in stage 1),
    // microscopic domain (stage 1, record-only), atom (preference)
    expect(run().derived.rulingHeadwords.count).toBe(5);
  });

  it('records that no store holds a committee confirmation yet', () => {
    expect(run().derived.committeeConfirmed.count).toBe(0);
  });

  it('writes nothing', () => {
    const before = db.prepare('SELECT total_changes() AS n').get().n;
    run();
    expect(db.prepare('SELECT total_changes() AS n').get().n).toBe(before);
  });

  it('refuses a book the server has not registered', () => {
    expect(() => run({ book: 'no-such-book' })).toThrow(/not registered/);
  });

  // Measured 2026-10-24: run on a database from before migration 047, the first version died
  // on a raw SqliteError. Name what is missing instead.
  it('names the missing table on a database that is not migrated', () => {
    db.exec('DROP TABLE book_domain_priority');
    expect(() => run()).toThrow(/missing table book_domain_priority/);
  });
});
