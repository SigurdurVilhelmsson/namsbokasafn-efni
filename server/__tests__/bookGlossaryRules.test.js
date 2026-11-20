// server/__tests__/bookGlossaryRules.test.js
/**
 * The shared predicates (bookGlossaryRules) and the refusals they back on the layer's write API
 * (design §5.1, plan rulings P3/T2a/T2c), on a fresh migrated DB with efnafraedi-2e's chain.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { addExclusion, addEntry, REFUSALS } = require('../lib/bookGlossaryLayer');
const { dedupeForms, houseStyleInScope } = require('../lib/bookGlossaryRules');
const { HOUSE_STYLE_SOURCE } = require('../lib/houseStyleTerms');

const BOOK = 'efnafraedi-2e';
let db;
let bookId;
let houseId;

function addPair(domain, english, icelandic, collection = null) {
  const id = Number(
    db
      .prepare('INSERT INTO concept (domain, collection, idordabanki_id) VALUES (?, ?, NULL)')
      .run(domain, collection).lastInsertRowid
  );
  const ins = db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,1,'test')"
  );
  ins.run(id, 'en', english);
  ins.run(id, 'is', icelandic);
  return id;
}
const count = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
const snapshot = () =>
  [
    'concept',
    'concept_term',
    'book_glossary_entry',
    'book_glossary_exclusion',
    'book_glossary_change',
  ].map(count);
const termIdOf = (conceptId) =>
  db.prepare("SELECT id FROM concept_term WHERE concept_id = ? AND lang='en'").get(conceptId).id;
const prefer = (chapter, english, conceptId) =>
  db
    .prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?,?,?,?)'
    )
    .run(bookId, chapter, english, termIdOf(conceptId));
const base = {
  book: BOOK,
  reason: 'because',
  source: 'test',
  by: 'tester',
  at: '2026-11-20T00:00:00.000Z',
};
const refusalOf = (fn) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
};

beforeAll(() => {
  db = freshMigratedDb().db;
  bookId = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(BOOK).id;
});
afterAll(() => db.close());
beforeEach(() => {
  // Migration 051's own house-style rows go too: this file seeds the one it needs.
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
  houseId = addPair('chemistry', 'zhouse', 'zhús', HOUSE_STYLE_SOURCE);
});

describe('dedupeForms', () => {
  it('keeps the first spelling per match key', () => {
    expect(dedupeForms(['Geometry', 'geometry', 'SI', 'Si'])).toEqual(['Geometry', 'SI', 'Si']);
  });
});

describe('houseStyleInScope', () => {
  it('finds a house-style concept for chemistry and nothing for a book whose chain lacks its domain', () => {
    const phys = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get('stjornufraedi');
    expect(houseStyleInScope(db, bookId, 'zhouse')).toEqual([
      { conceptId: houseId, english: 'zhouse', icelandic: 'zhús' },
    ]);
    expect(houseStyleInScope(db, phys.id, 'zhouse')).toEqual([]);
  });
});

describe('REFUSALS', () => {
  it('names every refusal the layer can throw', () => {
    expect(Object.isFrozen(REFUSALS)).toBe(true);
    expect(REFUSALS).toContain('needs-confirm');
  });
});

describe('addEntry forms and house style', () => {
  it('dedupes forms: ["zgeo", "ZGEO"] writes one en term, and a re-run returns already', () => {
    const r = addEntry(db, { ...base, english: ['zgeo', 'ZGEO'], icelandic: 'zrúm' });
    expect(r.status).toBe('added');
    expect(
      db
        .prepare("SELECT COUNT(*) n FROM concept_term WHERE concept_id = ? AND lang='en'")
        .get(r.conceptId).n
    ).toBe(1);
    expect(addEntry(db, { ...base, english: ['zgeo', 'ZGEO'], icelandic: 'zrúm' }).status).toBe(
      'already'
    );
  });

  it('with an exact duplicate form does not reach SQLite', () => {
    const r = addEntry(db, { ...base, english: ['zgeo', 'zgeo'], icelandic: 'zrúm' });
    expect(r.status).toBe('added');
    expect(
      db
        .prepare("SELECT COUNT(*) n FROM concept_term WHERE concept_id = ? AND lang='en'")
        .get(r.conceptId).n
    ).toBe(1);
  });

  it('returns the history id as changeId', () => {
    const r = addEntry(db, { ...base, english: ['zgeo'], icelandic: 'zrúm' });
    const h = db.prepare('SELECT id FROM book_glossary_change WHERE action = ?').get('entry-add');
    expect(r.changeId).toBe(h.id);
  });

  it('an entry on a house-style headword is refused with needs-confirm and names the term', () => {
    const before = snapshot();
    const e = refusalOf(() => addEntry(db, { ...base, english: ['zhouse'], icelandic: 'x' }));
    expect(e).toMatchObject({ code: 'LAYER_REFUSED', refusal: 'needs-confirm' });
    expect(e.houseStyle[0].english).toBe('zhouse');
    expect(snapshot()).toEqual(before);
  });

  it('with confirmHouseStyle the entry is written and its history names the overridden term', () => {
    const r = addEntry(db, {
      ...base,
      english: ['zhouse'],
      icelandic: 'x',
      confirmHouseStyle: true,
    });
    expect(r.status).toBe('added');
    const h = db
      .prepare('SELECT after_json FROM book_glossary_change WHERE id = ?')
      .get(r.changeId);
    expect(JSON.parse(h.after_json).houseStyleOverride[0].conceptId).toBe(houseId);
  });
});

describe('addExclusion refusals', () => {
  it("refuses the book's own entry concept", () => {
    const own = addEntry(db, { ...base, english: ['zown'], icelandic: 'zeigin' });
    const before = count('book_glossary_exclusion');
    const e = refusalOf(() =>
      addExclusion(db, { ...base, english: 'zown', conceptId: own.conceptId })
    );
    expect(e).toMatchObject({ code: 'LAYER_REFUSED', refusal: 'own-entry' });
    expect(count('book_glossary_exclusion')).toBe(before);
  });

  it('refuses a whole-headword exclusion on a preferred headword', () => {
    const c = addPair('physics', 'zcell', 'zker');
    prefer(0, 'zcell', c);
    const e = refusalOf(() => addExclusion(db, { ...base, english: 'zcell' }));
    expect(e).toMatchObject({ code: 'LAYER_REFUSED', refusal: 'preference' });
    expect(count('book_term_preference')).toBe(1);
    expect(count('book_glossary_exclusion')).toBe(0);
  });

  it('refuses a single-concept exclusion of the preferred concept (other chapter, other case)', () => {
    const c = addPair('physics', 'zcell', 'zker');
    prefer(3, 'zcell', c);
    const e = refusalOf(() => addExclusion(db, { ...base, english: 'ZCell', conceptId: c }));
    expect(e).toMatchObject({ code: 'LAYER_REFUSED', refusal: 'preference' });
    expect(count('book_term_preference')).toBe(1);
    expect(count('book_glossary_exclusion')).toBe(0);
  });

  it('allows excluding a non-preferred concept on a preferred headword', () => {
    const preferred = addPair('physics', 'zcell', 'zker');
    const other = addPair('physics', 'zcell', 'zhólf');
    prefer(0, 'zcell', preferred);
    expect(addExclusion(db, { ...base, english: 'zcell', conceptId: other }).status).toBe('added');
  });

  it('excluding a house-style concept needs confirmation; excluding its headword whole does too', () => {
    const before = snapshot();
    expect(
      refusalOf(() => addExclusion(db, { ...base, english: 'zhouse', conceptId: houseId }))
    ).toMatchObject({ refusal: 'needs-confirm' });
    expect(refusalOf(() => addExclusion(db, { ...base, english: 'zhouse' }))).toMatchObject({
      refusal: 'needs-confirm',
    });
    expect(snapshot()).toEqual(before);
    const r = addExclusion(db, {
      ...base,
      english: 'zhouse',
      conceptId: houseId,
      confirmHouseStyle: true,
    });
    expect(r.status).toBe('added');
    const h = db
      .prepare('SELECT after_json FROM book_glossary_change WHERE id = ?')
      .get(r.changeId);
    expect(JSON.parse(h.after_json).houseStyleOverride[0].conceptId).toBe(houseId);
  });

  it('an already-identical exclusion returns already before any new refusal', () => {
    const c = addPair('physics', 'zcell', 'zker');
    const first = addExclusion(db, { ...base, english: 'zcell', conceptId: c });
    prefer(0, 'zcell', c);
    expect(addExclusion(db, { ...base, english: 'zcell', conceptId: c })).toEqual({
      status: 'already',
      id: first.id,
    });
  });
});

describe('lookup and write agree on house style', () => {
  it.each(['zhouse', 'zcell'])('%s', (english) => {
    addPair('physics', 'zcell', 'zker');
    const inScope = houseStyleInScope(db, bookId, english).length > 0;
    const e = refusalOf(() => addEntry(db, { ...base, english: [english], icelandic: 'x' }));
    expect(inScope).toBe(e !== null && e.refusal === 'needs-confirm');
  });
});
