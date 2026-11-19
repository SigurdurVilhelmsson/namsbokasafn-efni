// server/__tests__/bookGlossaryWrite.test.js
/**
 * The book glossary layer's write API (spec 2026-11-19-book-glossary-layer-design §5.1-§5.2),
 * on a fresh migrated DB with efnafraedi-2e's real domain chain (chemistry > physics > biology).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { matchKey } = require('../lib/conceptResolver');
const { addExclusion, addEntry } = require('../lib/bookGlossaryLayer');
const { countImportedConcepts, countImportedTerms } = require('../lib/houseStyleTerms');

const BOOK = 'efnafraedi-2e';
let db;
let bookId;

function addPair(domain, english, icelandic, idordabankiId = null) {
  const id = Number(
    db
      .prepare('INSERT INTO concept (domain, idordabanki_id) VALUES (?, ?)')
      .run(domain, idordabankiId).lastInsertRowid
  );
  const ins = db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,1,'test')"
  );
  ins.run(id, 'en', english);
  ins.run(id, 'is', icelandic);
  return id;
}
const count = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
const history = () => db.prepare('SELECT * FROM book_glossary_change ORDER BY id').all();
const base = {
  book: BOOK,
  reason: 'because',
  source: 'test',
  by: 'tester',
  at: '2026-11-19T00:00:00.000Z',
};

beforeAll(() => {
  db = freshMigratedDb().db;
  bookId = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(BOOK).id;
});
afterAll(() => db.close());
beforeEach(() => {
  for (const t of [
    'book_glossary_exclusion',
    'book_glossary_entry',
    'book_glossary_change',
    'book_term_preference',
    'concept_term',
    'concept',
  ]) {
    db.exec(`DELETE FROM ${t}`);
  }
});

describe('matchKey', () => {
  it('keeps SI exact', () => expect(matchKey('SI')).toBe('SI'));
  it('keeps Si exact', () => expect(matchKey('Si')).toBe('Si'));
  it('keeps Co and CO apart', () => expect(matchKey('Co')).not.toBe(matchKey('CO')));
  it('folds Function and function together', () =>
    expect(matchKey('Function')).toBe(matchKey('function')));
});

describe('addExclusion', () => {
  it('whole headword: one row, concept_id 0, one history row with action exclude', () => {
    const r = addExclusion(db, { ...base, english: 'Function' });
    expect(r.status).toBe('added');
    const rows = db.prepare('SELECT * FROM book_glossary_exclusion').all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ concept_id: 0, match_key: 'function', book_id: bookId });
    const h = history();
    expect(h).toHaveLength(1);
    expect(h[0].action).toBe('exclude');
  });

  it('of one concept records its idordabanki_id and Icelandic in the row, not in the history', () => {
    const id = addPair('physics', 'geometry', 'rúmfræði', 777);
    addExclusion(db, { ...base, english: 'geometry', conceptId: id });
    const row = db.prepare('SELECT * FROM book_glossary_exclusion').get();
    expect(row).toMatchObject({ concept_id: id, idordabanki_id: 777, icelandic: 'rúmfræði' });
    const after = JSON.parse(history()[0].after_json);
    expect(after).toEqual({ english: 'geometry', conceptId: id, idordabankiId: 777 });
    expect('icelandic' in after).toBe(false);
  });

  it('twice returns already and writes no second history row', () => {
    const a = addExclusion(db, { ...base, english: 'Function' });
    const b = addExclusion(db, { ...base, english: 'function' });
    expect(b).toEqual({ status: 'already', id: a.id });
    expect(history()).toHaveLength(1);
  });

  it('refuses a concept that does not carry the English', () => {
    const id = addPair('physics', 'geometry', 'rúmfræði');
    expect(() => addExclusion(db, { ...base, english: 'banana', conceptId: id })).toThrow(
      expect.objectContaining({ code: 'LAYER_REFUSED' })
    );
    expect(count('book_glossary_exclusion')).toBe(0);
  });

  it('whole headword refuses when a book entry claims the headword', () => {
    addEntry(db, { ...base, english: ['geometry'], icelandic: 'lögun' });
    expect(() => addExclusion(db, { ...base, english: 'geometry' })).toThrow(/conflict/);
  });
});

describe('addEntry', () => {
  it('creates a chemistry-domain book-layer concept with en forms and is term, and an entry row', () => {
    const r = addEntry(db, {
      ...base,
      english: ['standard cell potential', 'standard cell potentials'],
      icelandic: 'staðalíspenna',
    });
    expect(r.status).toBe('added');
    const c = db.prepare('SELECT * FROM concept WHERE id = ?').get(r.conceptId);
    expect(c).toMatchObject({
      domain: 'chemistry',
      collection: 'book-layer',
      idordabanki_id: null,
    });
    const terms = db
      .prepare(
        'SELECT lang, text, rank, source FROM concept_term WHERE concept_id = ? ORDER BY lang, text'
      )
      .all(r.conceptId);
    expect(terms).toEqual([
      { lang: 'en', text: 'standard cell potential', rank: 1, source: 'book-layer' },
      { lang: 'en', text: 'standard cell potentials', rank: 1, source: 'book-layer' },
      { lang: 'is', text: 'staðalíspenna', rank: 1, source: 'book-layer' },
    ]);
    expect(db.prepare('SELECT * FROM book_glossary_entry').get()).toMatchObject({
      concept_id: r.conceptId,
      book_id: bookId,
    });
    const h = history();
    expect(h).toHaveLength(1);
    expect(h[0].action).toBe('entry-add');
    expect(JSON.parse(h[0].after_json)).toEqual({
      english: ['standard cell potential', 'standard cell potentials'],
      icelandic: 'staðalíspenna',
      replaces: [],
    });
  });

  it('with replaces also excludes the replaced concept for the headword', () => {
    const physicsId = addPair('physics', 'geometry', 'rúmfræði');
    addEntry(db, { ...base, english: ['geometry'], icelandic: 'lögun', replaces: [physicsId] });
    const ex = db.prepare('SELECT english, concept_id FROM book_glossary_exclusion').all();
    expect(ex).toEqual([{ english: 'geometry', concept_id: physicsId }]);
  });

  it('refuses a replaces concept that carries none of the English forms', () => {
    const id = addPair('physics', 'banana', 'banani');
    expect(() =>
      addEntry(db, { ...base, english: ['geometry'], icelandic: 'lögun', replaces: [id] })
    ).toThrow(expect.objectContaining({ code: 'LAYER_REFUSED' }));
    expect(count('concept')).toBe(1);
  });

  it('refuses a form a whole-headword exclusion holds', () => {
    addExclusion(db, { ...base, english: 'geometry' });
    const before = [
      count('concept'),
      count('concept_term'),
      count('book_glossary_entry'),
      count('book_glossary_change'),
    ];
    expect(() => addEntry(db, { ...base, english: ['Geometry'], icelandic: 'lögun' })).toThrow(
      expect.objectContaining({ code: 'LAYER_REFUSED' })
    );
    expect([
      count('concept'),
      count('concept_term'),
      count('book_glossary_entry'),
      count('book_glossary_change'),
    ]).toEqual(before);
  });

  it('refuses a form with a book_term_preference row', () => {
    const id = addPair('physics', 'geometry', 'rúmfræði');
    const termId = db
      .prepare("SELECT id FROM concept_term WHERE concept_id = ? AND lang='en'")
      .get(id).id;
    db.prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?,?,?,?)'
    ).run(bookId, 0, 'geometry', termId);
    const before = [
      count('concept'),
      count('concept_term'),
      count('book_glossary_entry'),
      count('book_glossary_change'),
    ];
    expect(() => addEntry(db, { ...base, english: ['geometry'], icelandic: 'lögun' })).toThrow(
      expect.objectContaining({ code: 'LAYER_REFUSED' })
    );
    expect([
      count('concept'),
      count('concept_term'),
      count('book_glossary_entry'),
      count('book_glossary_change'),
    ]).toEqual(before);
  });

  it('identical twice returns already', () => {
    const a = addEntry(db, { ...base, english: ['geometry'], icelandic: 'lögun' });
    const b = addEntry(db, { ...base, english: ['geometry'], icelandic: 'lögun' });
    expect(b).toEqual({ status: 'already', conceptId: a.conceptId });
    expect(count('book_glossary_entry')).toBe(1);
    expect(history()).toHaveLength(1);
  });

  it('identical with replaces twice returns already', () => {
    const physicsId = addPair('physics', 'geometry', 'rúmfræði');
    const args = { ...base, english: ['geometry'], icelandic: 'lögun', replaces: [physicsId] };
    const a = addEntry(db, args);
    const b = addEntry(db, args);
    expect(b).toEqual({ status: 'already', conceptId: a.conceptId });
    expect(count('book_glossary_exclusion')).toBe(1);
  });

  it('over an existing entry with a replacement not yet excluded refuses and writes nothing', () => {
    const physicsId = addPair('physics', 'geometry', 'rúmfræði');
    addEntry(db, { ...base, english: ['geometry'], icelandic: 'lögun' });
    const before = [count('book_glossary_exclusion'), count('book_glossary_change')];
    let err;
    try {
      addEntry(db, { ...base, english: ['geometry'], icelandic: 'lögun', replaces: [physicsId] });
    } catch (e) {
      err = e;
    }
    expect(err.code).toBe('LAYER_REFUSED');
    expect(err.message).toContain(String(physicsId));
    expect([count('book_glossary_exclusion'), count('book_glossary_change')]).toEqual(before);
  });

  it('with the same form and other Icelandic refuses', () => {
    addEntry(db, { ...base, english: ['geometry'], icelandic: 'lögun' });
    expect(() => addEntry(db, { ...base, english: ['geometry'], icelandic: 'form' })).toThrow(
      expect.objectContaining({ code: 'LAYER_REFUSED' })
    );
  });
});

describe('import counts', () => {
  it('countImportedConcepts and countImportedTerms do not count book-layer rows', () => {
    addPair('chemistry', 'x', 'y');
    const before = [countImportedConcepts(db), countImportedTerms(db)];
    addEntry(db, { ...base, english: ['geometry'], icelandic: 'lögun' });
    expect([countImportedConcepts(db), countImportedTerms(db)]).toEqual(before);
  });
});
