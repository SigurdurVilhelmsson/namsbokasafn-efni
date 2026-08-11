// server/__tests__/importConcepts.test.js
//
// ⚠️ Schema comes from freshMigratedDb() — every real migration, not a
// hand-enumerated 045-then-048. Whole-branch review (round 2) flagged the
// prior hand-enumeration as the SAME "green-but-lying" failure this task
// exists to fix, one level down: it would silently miss a future migration
// touching concept_term, registered_books, or book_term_preference unless
// someone remembered to add another `require`+`.up(db)` line by hand.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3'); // only for the bare-connection pragma check below
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { importConcepts } = require('../scripts/import-concepts');

let db;
beforeEach(() => {
  ({ db } = freshMigratedDb());
});
afterEach(() => db.close());

const payload = (entries, collection = 'EFNAFR') => ({ collection, entries });
const w = (fklanguage, word, extra = {}) => ({ fklanguage, word, ...extra });

describe('importConcepts', () => {
  it('creates one concept per entry', () => {
    const r = importConcepts(
      db,
      payload([
        { id: 1, words: [w('EN', 'atom'), w('IS', 'frumeind')] },
        { id: 2, words: [w('EN', 'bond'), w('IS', 'efnatengi')] },
      ])
    );
    expect(r.imported).toBe(2);
    expect(db.prepare('SELECT COUNT(*) n FROM concept').get().n).toBe(2);
  });

  it('keeps two entries sharing an English string APART — this is the whole point', () => {
    importConcepts(
      db,
      payload([{ id: 687862, words: [w('EN', 'cell'), w('IS', 'fruma')] }], 'LIFORD')
    );
    importConcepts(
      db,
      payload([{ id: 321691, words: [w('EN', 'cell'), w('IS', 'rafhlað')] }], 'EDLISFR')
    );
    const n = db
      .prepare(
        "SELECT COUNT(DISTINCT concept_id) n FROM concept_term WHERE lang='en' AND text='cell'"
      )
      .get().n;
    expect(n).toBe(2);
  });

  it('assigns the domain from the collection', () => {
    importConcepts(db, payload([{ id: 5, words: [w('IS', 'ediksgerla')] }], 'PODDUR'));
    expect(db.prepare('SELECT domain FROM concept').get().domain).toBe('biology');
  });

  it('imports a PODDUR entry with no English side', () => {
    const r = importConcepts(
      db,
      payload(
        [{ id: 7, words: [w('LA', 'Drosophila melanogaster'), w('IS', 'ediksgerla')] }],
        'PODDUR'
      )
    );
    expect(r.imported).toBe(1);
    expect(r.byLang.la).toBe(1);
    expect(r.byLang.en).toBe(0);
  });

  it('skips an entry with no Icelandic side and counts it', () => {
    const r = importConcepts(db, payload([{ id: 8, words: [w('EN', 'atom')] }]));
    expect(r.imported).toBe(0);
    expect(r.skippedNoIcelandic).toBe(1);
  });

  it('is idempotent — re-importing the same payload adds nothing', () => {
    const p = payload([{ id: 9, words: [w('EN', 'atom'), w('IS', 'frumeind')] }]);
    importConcepts(db, p);
    importConcepts(db, p);
    expect(db.prepare('SELECT COUNT(*) n FROM concept').get().n).toBe(1);
    expect(db.prepare('SELECT COUNT(*) n FROM concept_term').get().n).toBe(2);
  });

  it('rejects an unknown collection loudly rather than guessing a domain', () => {
    expect(() =>
      importConcepts(db, payload([{ id: 10, words: [w('IS', 'x')] }], 'NOSUCH'))
    ).toThrow(/NOSUCH/);
  });

  it('reports term counts by language', () => {
    const r = importConcepts(
      db,
      payload([
        { id: 11, words: [w('EN', 'atom', { synonyms: 'atomic unit' }), w('IS', 'frumeind')] },
      ])
    );
    expect(r.byLang).toEqual({ en: 2, is: 1, la: 0 });
  });

  it('dedupes a word that repeats its own head form as a synonym, instead of throwing on the UNIQUE constraint', () => {
    const r = importConcepts(
      db,
      payload([{ id: 20, words: [w('IS', 'frumeind', { synonyms: 'frumeind' })] }])
    );
    expect(r.imported).toBe(1);
    expect(
      db.prepare("SELECT COUNT(*) n FROM concept_term WHERE lang='is' AND text='frumeind'").get().n
    ).toBe(1);
  });

  it('re-importing the same idordabanki_id REPLACES stored terms rather than skipping them', () => {
    importConcepts(db, payload([{ id: 30, words: [w('EN', 'atom'), w('IS', 'frumeind')] }]));
    importConcepts(db, payload([{ id: 30, words: [w('EN', 'molecule'), w('IS', 'sameind')] }]));
    const conceptId = db.prepare('SELECT id FROM concept WHERE idordabanki_id = 30').get().id;
    const texts = db
      .prepare('SELECT text FROM concept_term WHERE concept_id = ?')
      .all(conceptId)
      .map((row) => row.text)
      .sort();
    expect(texts).toEqual(['molecule', 'sameind']);
  });
});

// ── register §C36 finding 1 ──────────────────────────────────────────────────
//
// Re-importing a collection to pick up an Árnastofnun update used to give every
// surviving term a fresh AUTOINCREMENT id, breaking every editor preference for
// that collection — with no count in the returned stats.
//
// ⚠️ Parameterised over the connection DEFAULT and over an explicit ON and OFF,
// deliberately — the point is that the behaviour must not depend on the pragma.
//
// `default` is the case production actually runs: every connection in this
// project is a bare `new Database(path)` with no pragma call. It is NOT the
// same as "SQLite's default" — better-sqlite3 is compiled with
// SQLITE_DEFAULT_FOREIGN_KEYS=1 (node_modules/better-sqlite3/deps/defines.gypi),
// so a bare connection reports foreign_keys = 1 and ON DELETE CASCADE fires.
// Register §C36 finding 1 describes the mechanism as a cascade delete, and that
// is correct.
//
// ⚠️ An earlier version of this comment asserted the opposite, on a measurement
// taken with the system `sqlite3` CLI — a different build, stock defaults, which
// reports 0. Right property, wrong instrument. The OFF row is kept because the
// import must not depend on the pragma being what we think it is, which is
// exactly the assumption that failed here.
describe('the connection default this project actually runs', () => {
  it('has foreign keys ON — better-sqlite3 is built with SQLITE_DEFAULT_FOREIGN_KEYS=1', () => {
    // Pinned as a fact, not assumed. Every connection in this project is a bare
    // `new Database(path)`; if a future better-sqlite3 build drops that compile
    // flag, ON DELETE CASCADE silently stops firing everywhere and this goes red
    // rather than the change passing unnoticed.
    const bare = new Database(':memory:');
    expect(bare.pragma('foreign_keys', { simple: true })).toBe(1);
    bare.close();
  });
});

describe.each([['default'], ['ON'], ['OFF']])(
  're-import keeps editor preferences intact (foreign_keys = %s)',
  (fk) => {
    const entry = { id: 991, words: [w('EN', 'atom'), w('IS', 'frumeind', { synonyms: 'atóm' })] };

    function seedPreference() {
      if (fk !== 'default') db.pragma(`foreign_keys = ${fk}`);
      importConcepts(db, payload([entry]));
      // title_is/registered_by are real NOT NULL columns (migration 003) —
      // absent from the old hand-rolled schema, which only ever declared id+slug.
      // ⚠️ NEITHER THE id NOR THE slug MAY BE ASSUMED FREE since 2026-08-11.
      // This inserted `id = 1` with slug efnafraedi-2e and then wrote the
      // preference against a literal `book_id = 1`. Migration 049 (§C51) now
      // registers all six books on any fresh migrate, so id 1 belongs to another
      // book AND the slug already exists — two UNIQUE collisions in one row.
      // Insert-or-ignore by slug and read the id back: what this fixture needs is
      // a book to hang a preference on, not a particular id.
      db.prepare(
        "INSERT OR IGNORE INTO registered_books (slug, title_is, registered_by) VALUES (?, 'Test Book', 'test')"
      ).run('efnafraedi-2e');
      const bookId = db
        .prepare("SELECT id FROM registered_books WHERE slug = 'efnafraedi-2e'")
        .get().id;
      const termId = db
        .prepare("SELECT id FROM concept_term WHERE lang='is' AND text='atóm'")
        .get().id;
      db.prepare(
        `INSERT INTO book_term_preference (book_id, chapter, english, term_id)
         VALUES (?, 0, 'atom', ?)`
      ).run(bookId, termId);
      return { termId };
    }

    const danglingCount = () =>
      db
        .prepare('SELECT term_id FROM book_term_preference')
        .all()
        .filter((p) => !db.prepare('SELECT 1 FROM concept_term WHERE id = ?').get(p.term_id))
        .length;

    it('leaves the preference pointing at a term that still exists', () => {
      const { termId } = seedPreference();
      const stats = importConcepts(db, payload([entry]));

      expect(db.prepare('SELECT COUNT(*) c FROM book_term_preference').get().c).toBe(1);
      expect(db.prepare('SELECT term_id FROM book_term_preference').get().term_id).toBe(termId);
      expect(danglingCount()).toBe(0);
      expect(stats.preferencesDropped).toBe(0);
      expect(stats.prunedTerms).toBe(0);
    });

    it('keeps every term id stable across an identical re-import', () => {
      seedPreference();
      const before = db.prepare('SELECT id, lang, text FROM concept_term ORDER BY id').all();
      importConcepts(db, payload([entry]));
      const after = db.prepare('SELECT id, lang, text FROM concept_term ORDER BY id').all();
      expect(after).toEqual(before);
    });

    it('prunes a term WITHDRAWN upstream, and reports the preference it cost', () => {
      seedPreference();
      // Árnastofnun drops the synonym: 'atóm' is genuinely gone.
      const stats = importConcepts(
        db,
        payload([{ id: 991, words: [w('EN', 'atom'), w('IS', 'frumeind')] }])
      );

      expect(stats.prunedTerms).toBe(1);
      expect(stats.preferencesDropped).toBe(1);
      // Asserted under BOTH pragmas: under OFF nothing removes this for you, so
      // the import must delete it explicitly rather than trust a cascade that
      // never fires in production.
      expect(db.prepare('SELECT COUNT(*) c FROM book_term_preference').get().c).toBe(0);
      expect(danglingCount()).toBe(0);
    });

    it('counts an unchanged term as updated, not as newly inserted', () => {
      seedPreference();
      const stats = importConcepts(db, payload([entry]));
      expect(stats.updatedTerms).toBe(3); // atom, frumeind, atóm
    });
  }
);
