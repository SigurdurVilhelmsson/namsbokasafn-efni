// server/__tests__/bookGlossaryOperations.test.js
/**
 * The layer's stage-2 operations (design §5.1): removeExclusion, changeEntry, removeEntry, and
 * historyFor (plan ruling P10), on a fresh migrated DB with efnafraedi-2e's real domain chain.
 *
 * A refusal is asserted twice: its code, and that no row of the layer, the concept model or the
 * preference table changed (a whole-row snapshot, so an UPDATE that should not have run is seen
 * too, not only an insert or a delete).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { buildScope, resolve } = require('../lib/conceptResolver');
const {
  addExclusion,
  addEntry,
  removeExclusion,
  changeEntry,
  removeEntry,
  historyFor,
} = require('../lib/bookGlossaryLayer');
const { HOUSE_STYLE_SOURCE } = require('../lib/houseStyleTerms');

const BOOK = 'efnafraedi-2e';
const OTHER = 'edlisfraedi-2e';
const LATER = '2026-11-21T00:00:00.000Z';
const TABLES = [
  'concept',
  'concept_term',
  'book_glossary_entry',
  'book_glossary_exclusion',
  'book_glossary_change',
  'book_term_preference',
];
let db;
let bookId;

/** One concept; `en` may be a string or a list. */
function concept(domain, en, is, collection = null, idordabankiId = null) {
  const id = Number(
    db
      .prepare('INSERT INTO concept (domain, collection, idordabanki_id) VALUES (?, ?, ?)')
      .run(domain, collection, idordabankiId).lastInsertRowid
  );
  const ins = db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,1,'test')"
  );
  for (const e of [].concat(en)) ins.run(id, 'en', e);
  ins.run(id, 'is', is);
  return id;
}
const count = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
const snapshot = () =>
  Object.fromEntries(TABLES.map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
const history = () => db.prepare('SELECT * FROM book_glossary_change ORDER BY id').all();
const lastHistory = () => history().at(-1);
const enOf = (conceptId) =>
  db
    .prepare("SELECT text FROM concept_term WHERE concept_id = ? AND lang = 'en' ORDER BY rank, id")
    .all(conceptId)
    .map((r) => r.text);
const isTermOf = (conceptId) =>
  db
    .prepare(
      "SELECT id, text, inflections FROM concept_term WHERE concept_id = ? AND lang = 'is' ORDER BY rank, id LIMIT 1"
    )
    .get(conceptId);
const setInflections = (conceptId, list) =>
  db
    .prepare("UPDATE concept_term SET inflections = ? WHERE concept_id = ? AND lang = 'is'")
    .run(JSON.stringify(list), conceptId);
/** A book preference on `english`, pointing at a term id (the Icelandic term an editor chose). */
const preferOn = (english, termId) =>
  db
    .prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?,0,?,?)'
    )
    .run(bookId, english, termId);
/** A fresh scope on every call, so each answer sees the layer as it is now. */
const resolution = (english) => resolve(buildScope(db, BOOK, 0), english);
const winnerOf = (english) => resolution(english).winner;
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
  // Migration 051's own house-style rows go too: a test that needs one seeds it.
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

describe('removeExclusion', () => {
  it('removeExclusion writes unexclude with before and after, and the concept is visible again', () => {
    const old = concept('chemistry', 'zcell', 'zfruma', null, 777);
    const { id } = addExclusion(db, { ...base, english: 'zcell', conceptId: old });
    expect(winnerOf('zcell')).toBeNull(); // control: the exclusion hides it

    const r = removeExclusion(db, { ...base, exclusionId: id });
    const h = lastHistory();
    expect(r).toEqual({ status: 'removed', changeId: h.id });
    expect(h).toMatchObject({ action: 'unexclude', english: 'zcell', by: 'tester' });
    expect(JSON.parse(h.before_json)).toEqual({
      english: 'zcell',
      conceptId: old,
      idordabankiId: 777,
    });
    expect(JSON.parse(h.after_json)).toEqual({ english: 'zcell', conceptId: old, excluded: false });
    expect(count('book_glossary_exclusion')).toBe(0);
    expect(winnerOf('zcell').conceptId).toBe(old);
  });

  it("removeExclusion of a replacement's exclusion leaves the entry (the entry becomes an add)", () => {
    const old = concept('chemistry', 'zcell', 'zfruma');
    const e = addEntry(db, { ...base, english: ['zcell'], icelandic: 'zsella', replaces: [old] });
    const ex = db.prepare('SELECT id FROM book_glossary_exclusion WHERE concept_id = ?').get(old);
    // control: while the exclusion stands, the old concept is not offered at all
    expect(resolution('zcell').alsoInScope.map((c) => c.conceptId)).not.toContain(old);

    removeExclusion(db, { ...base, exclusionId: ex.id });
    const r = resolution('zcell');
    expect(count('book_glossary_entry')).toBe(1);
    expect(r.winner.conceptId).toBe(e.conceptId);
    expect(r.alsoInScope.map((c) => c.conceptId)).toContain(old);
  });

  it("removeExclusion refuses another book's exclusion id", () => {
    const old = concept('chemistry', 'zcell', 'zfruma');
    const { id } = addExclusion(db, { ...base, book: OTHER, english: 'zcell', conceptId: old });
    const before = snapshot();
    const err = refusalOf(() => removeExclusion(db, { ...base, exclusionId: id }));
    expect(err).toMatchObject({ code: 'LAYER_REFUSED', refusal: 'not-found' });
    expect(snapshot()).toEqual(before);
    // control: the id is real, and its own book can remove it
    expect(removeExclusion(db, { ...base, book: OTHER, exclusionId: id }).status).toBe('removed');
  });
});

describe('changeEntry', () => {
  it('changeEntry with a new Icelandic clears inflections and keeps the old list in before_json', () => {
    const e = addEntry(db, { ...base, english: ['zcell'], icelandic: 'zsella' });
    setInflections(e.conceptId, ['zbeyging1']);

    const r = changeEntry(db, {
      ...base,
      by: 'editor2',
      at: LATER,
      conceptId: e.conceptId,
      icelandic: 'zfruma',
    });
    const h = lastHistory();
    expect(r).toEqual({
      status: 'changed',
      conceptId: e.conceptId,
      icelandicChanged: true,
      changeId: h.id,
    });
    expect(isTermOf(e.conceptId)).toMatchObject({ text: 'zfruma', inflections: null });
    expect(h).toMatchObject({ action: 'entry-change', english: 'zcell', by: 'editor2', at: LATER });
    expect(JSON.parse(h.before_json)).toEqual({
      english: ['zcell'],
      icelandic: 'zsella',
      inflections: ['zbeyging1'],
    });
    expect(JSON.parse(h.after_json)).toEqual({ english: ['zcell'], icelandic: 'zfruma' });
    expect(
      db.prepare('SELECT * FROM book_glossary_entry WHERE concept_id = ?').get(e.conceptId)
    ).toMatchObject({ updated_by: 'editor2', updated_at: LATER });
  });

  it('changeEntry adds and removes forms', () => {
    const e = addEntry(db, { ...base, english: ['zcella', 'zcellb'], icelandic: 'zsella' });
    expect(winnerOf('zcella').conceptId).toBe(e.conceptId); // control
    expect(winnerOf('zcellc')).toBeNull(); // control

    const r = changeEntry(db, { ...base, conceptId: e.conceptId, forms: ['zcellb', 'zcellc'] });
    expect(r).toMatchObject({ status: 'changed', icelandicChanged: false });
    expect([...enOf(e.conceptId)].sort()).toEqual(['zcellb', 'zcellc']);
    expect(winnerOf('zcella')).toBeNull();
    expect(winnerOf('zcellc').conceptId).toBe(e.conceptId);
    const h = lastHistory();
    expect(h.english).toBe('zcellb');
    expect(JSON.parse(h.before_json).english).toEqual(['zcella', 'zcellb']);
    expect(JSON.parse(h.after_json)).toEqual({
      english: ['zcellb', 'zcellc'],
      icelandic: 'zsella',
    });
  });

  it('changeEntry refuses a form another entry of the book claims (T3f)', () => {
    const a = addEntry(db, { ...base, english: ['za'], icelandic: 'zá' });
    addEntry(db, { ...base, english: ['zb'], icelandic: 'zbé' });
    const before = snapshot();
    const err = refusalOf(() =>
      changeEntry(db, { ...base, conceptId: a.conceptId, forms: ['za', 'zb'] })
    );
    expect(err).toMatchObject({ code: 'LAYER_REFUSED', refusal: 'entry-conflict' });
    expect(snapshot()).toEqual(before);
  });

  it('changeEntry refuses a new form excluded as a whole headword or preferred for the book', () => {
    const e = addEntry(db, { ...base, english: ['za'], icelandic: 'zá' });
    addExclusion(db, { ...base, english: 'zwhole' });
    const other = concept('chemistry', 'zpref', 'zval');
    preferOn('zpref', isTermOf(other).id);
    const before = snapshot();
    expect(
      refusalOf(() => changeEntry(db, { ...base, conceptId: e.conceptId, forms: ['za', 'zwhole'] }))
    ).toMatchObject({ code: 'LAYER_REFUSED', refusal: 'excluded-headword' });
    expect(
      refusalOf(() => changeEntry(db, { ...base, conceptId: e.conceptId, forms: ['za', 'zpref'] }))
    ).toMatchObject({ code: 'LAYER_REFUSED', refusal: 'preference' });
    expect(snapshot()).toEqual(before);
  });

  it('changeEntry refuses a new Icelandic when a preference points at it (P3)', () => {
    const e = addEntry(db, { ...base, english: ['zcell'], icelandic: 'zsella' });
    setInflections(e.conceptId, ['zbeyging1']);
    const termId = isTermOf(e.conceptId).id;
    preferOn('zcell', termId);
    const before = snapshot();

    const err = refusalOf(() =>
      changeEntry(db, { ...base, conceptId: e.conceptId, icelandic: 'zfruma' })
    );
    expect(err).toMatchObject({ code: 'LAYER_REFUSED', refusal: 'preference' });
    // the snapshot covers the Icelandic text, its inflections, the history and the preference row
    expect(snapshot()).toEqual(before);
    expect(db.prepare('SELECT term_id FROM book_term_preference').all()).toEqual([
      { term_id: termId },
    ]);

    // P3 covers the Icelandic only: a forms-only change goes through, and the preference stays
    expect(
      changeEntry(db, { ...base, conceptId: e.conceptId, forms: ['zcell', 'zcells'] }).status
    ).toBe('changed');
    expect(db.prepare('SELECT term_id FROM book_term_preference').all()).toEqual([
      { term_id: termId },
    ]);
  });

  it('changeEntry with nothing different returns unchanged and writes no history row', () => {
    const e = addEntry(db, { ...base, english: ['zcella', 'zcellb'], icelandic: 'zsella' });
    const before = snapshot();
    // the same forms in another order are the same set
    const r = changeEntry(db, {
      ...base,
      conceptId: e.conceptId,
      icelandic: 'zsella',
      forms: ['zcellb', 'zcella'],
    });
    expect(r).toEqual({
      status: 'unchanged',
      conceptId: e.conceptId,
      icelandicChanged: false,
      changeId: null,
    });
    expect(snapshot()).toEqual(before);
  });

  it('changeEntry refuses forms that dedupe to nothing, and an empty Icelandic, as invalid', () => {
    const e = addEntry(db, { ...base, english: ['zcell'], icelandic: 'zsella' });
    const before = snapshot();
    expect(
      refusalOf(() => changeEntry(db, { ...base, conceptId: e.conceptId, forms: [] }))
    ).toMatchObject({ code: 'LAYER_REFUSED', refusal: 'invalid' });
    expect(
      refusalOf(() => changeEntry(db, { ...base, conceptId: e.conceptId, icelandic: '' }))
    ).toMatchObject({ code: 'LAYER_REFUSED', refusal: 'invalid' });
    expect(snapshot()).toEqual(before);
  });

  it("changeEntry refuses a concept that is not this book's entry", () => {
    const theirs = addEntry(db, { ...base, book: OTHER, english: ['zcell'], icelandic: 'zsella' });
    const plain = concept('chemistry', 'zplain', 'zvenjulegt');
    const before = snapshot();
    for (const conceptId of [theirs.conceptId, plain]) {
      expect(
        refusalOf(() => changeEntry(db, { ...base, conceptId, icelandic: 'zfruma' }))
      ).toMatchObject({ code: 'LAYER_REFUSED', refusal: 'not-found' });
    }
    expect(snapshot()).toEqual(before);
  });

  it('changeEntry re-checks house style on every resulting form, naming each concept once (P5)', () => {
    const house = concept('chemistry', ['zhouse', 'zhouses'], 'zhús', HOUSE_STYLE_SOURCE);
    const e = addEntry(db, { ...base, english: ['zcell'], icelandic: 'zsella' });
    const forms = ['zcell', 'zhouse', 'zhouses'];
    const named = [{ conceptId: house, english: 'zhouse', icelandic: 'zhús' }];
    const before = snapshot();

    const err = refusalOf(() => changeEntry(db, { ...base, conceptId: e.conceptId, forms }));
    expect(err).toMatchObject({ code: 'LAYER_REFUSED', refusal: 'needs-confirm' });
    expect(err.houseStyle).toEqual(named);
    expect(snapshot()).toEqual(before);

    changeEntry(db, { ...base, conceptId: e.conceptId, forms, confirmHouseStyle: true });
    expect(JSON.parse(lastHistory().after_json).houseStyleOverride).toEqual(named);
    // a later change that touches only the Icelandic asks again
    expect(
      refusalOf(() => changeEntry(db, { ...base, conceptId: e.conceptId, icelandic: 'zný' }))
    ).toMatchObject({ code: 'LAYER_REFUSED', refusal: 'needs-confirm' });
  });
});

describe('removeEntry', () => {
  it('removeEntry deletes the entry, its concept and terms, and keeps Icelandic and inflections in before_json', () => {
    const e = addEntry(db, { ...base, english: ['zcell', 'zcells'], icelandic: 'zsella' });
    setInflections(e.conceptId, ['zbeyging1']);

    const r = removeEntry(db, { ...base, conceptId: e.conceptId });
    const h = lastHistory();
    expect(r).toEqual({ status: 'removed', changeId: h.id, undone: [] });
    expect(count('book_glossary_entry')).toBe(0);
    expect(db.prepare('SELECT 1 FROM concept WHERE id = ?').get(e.conceptId)).toBeUndefined();
    expect(
      db.prepare('SELECT COUNT(*) n FROM concept_term WHERE concept_id = ?').get(e.conceptId).n
    ).toBe(0);
    expect(h).toMatchObject({ action: 'entry-remove', english: 'zcell' });
    expect(JSON.parse(h.before_json)).toEqual({
      english: ['zcell', 'zcells'],
      icelandic: 'zsella',
      inflections: ['zbeyging1'],
    });
    expect(JSON.parse(h.after_json)).toEqual({ removed: true });
  });

  it("removeEntry refuses when a preference points at the entry's term and writes nothing (P3)", () => {
    const e = addEntry(db, { ...base, english: ['zcell'], icelandic: 'zsella' });
    const termId = isTermOf(e.conceptId).id;
    preferOn('zcell', termId);
    const before = snapshot();
    const err = refusalOf(() => removeEntry(db, { ...base, conceptId: e.conceptId }));
    expect(err).toMatchObject({ code: 'LAYER_REFUSED', refusal: 'preference' });
    expect(snapshot()).toEqual(before);
    expect(db.prepare('SELECT term_id FROM book_term_preference').all()).toEqual([
      { term_id: termId },
    ]);
  });

  it('removeEntry refuses when another concept is merged into the entry (P4)', () => {
    const e = addEntry(db, { ...base, english: ['zcell'], icelandic: 'zsella' });
    const m = concept('chemistry', 'zmerged', 'zsam');
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(e.conceptId, m);
    const before = snapshot();
    const err = refusalOf(() => removeEntry(db, { ...base, conceptId: e.conceptId }));
    expect(err).toMatchObject({ code: 'LAYER_REFUSED', refusal: 'merged-into' });
    expect(snapshot()).toEqual(before);
  });

  it('removeEntry undoes the listed exclusions, each as its own history row', () => {
    const chem = concept('chemistry', 'zcell', 'zfruma');
    const phys = concept('physics', 'zcell', 'zhólf');
    const e = addEntry(db, {
      ...base,
      english: ['zcell'],
      icelandic: 'zsella',
      replaces: [chem, phys],
    });
    const ids = db
      .prepare('SELECT id FROM book_glossary_exclusion ORDER BY id')
      .all()
      .map((x) => x.id);
    expect(ids).toHaveLength(2);
    expect(winnerOf('zcell').conceptId).toBe(e.conceptId); // control: the entry wins first
    const n = count('book_glossary_change');

    const r = removeEntry(db, { ...base, conceptId: e.conceptId, undoExclusions: ids });
    const rows = history().slice(n);
    expect(rows.map((h) => h.action)).toEqual(['entry-remove', 'unexclude', 'unexclude']);
    expect(r).toEqual({ status: 'removed', changeId: rows[0].id, undone: ids });
    expect(count('book_glossary_exclusion')).toBe(0);
    expect(winnerOf('zcell').conceptId).toBe(chem);
  });

  it('removeEntry undoes a repeated undo id once', () => {
    const old = concept('chemistry', 'zcell', 'zfruma');
    const e = addEntry(db, { ...base, english: ['zcell'], icelandic: 'zsella', replaces: [old] });
    const own = db.prepare('SELECT id FROM book_glossary_exclusion').get().id;
    const n = count('book_glossary_change');

    const r = removeEntry(db, { ...base, conceptId: e.conceptId, undoExclusions: [own, own] });
    expect(r.undone).toEqual([own]);
    expect(
      history()
        .slice(n)
        .map((h) => h.action)
    ).toEqual(['entry-remove', 'unexclude']);
  });

  it('removeEntry removes a dangling entry whose concept is already gone', () => {
    const e = addEntry(db, { ...base, english: ['zcell'], icelandic: 'zsella' });
    db.prepare('DELETE FROM concept WHERE id = ?').run(e.conceptId);

    const r = removeEntry(db, { ...base, conceptId: e.conceptId });
    const h = lastHistory();
    expect(r).toEqual({ status: 'removed', changeId: h.id, undone: [] });
    expect(count('book_glossary_entry')).toBe(0);
    expect(h).toMatchObject({ action: 'entry-remove', english: '' });
    expect(JSON.parse(h.before_json)).toEqual({ english: [], icelandic: null, inflections: null });
  });

  describe("removeEntry refuses an undo id that is not the entry's own exclusion and writes nothing", () => {
    it.each([
      ["another headword's exclusion", 'otherHeadword'],
      ['a whole-headword exclusion', 'whole'],
      ["another book's exclusion", 'otherBook'],
    ])('%s', (_label, pick) => {
      const old = concept('chemistry', 'zcell', 'zfruma');
      const e = addEntry(db, { ...base, english: ['zcell'], icelandic: 'zsella', replaces: [old] });
      const own = db
        .prepare('SELECT id FROM book_glossary_exclusion WHERE book_id = ?')
        .get(bookId).id;
      const zother = concept('chemistry', 'zother', 'zannað');
      const bad = {
        // this book, single-concept, but on a headword the entry does not carry
        otherHeadword: () => addExclusion(db, { ...base, english: 'zother', conceptId: zother }).id,
        // this book, the entry's own headword, but whole-headword: planted, since the write API
        // refuses a whole-headword exclusion beside an entry
        whole: () =>
          Number(
            db
              .prepare(
                `INSERT INTO book_glossary_exclusion
                   (book_id, english, match_key, concept_id, reason, source, created_by, created_at)
                 VALUES (?, 'zcell', 'zcell', 0, 'r', '', 't', ?)`
              )
              .run(bookId, base.at).lastInsertRowid
          ),
        // the entry's own headword and the same concept, but another book's row
        otherBook: () =>
          addExclusion(db, { ...base, book: OTHER, english: 'zcell', conceptId: old }).id,
      }[pick]();
      const before = snapshot();

      const err = refusalOf(() =>
        removeEntry(db, { ...base, conceptId: e.conceptId, undoExclusions: [own, bad] })
      );
      expect(err).toMatchObject({ code: 'LAYER_REFUSED', refusal: 'not-found' });
      expect(snapshot()).toEqual(before);
      // control: the entry's own exclusion alone is accepted
      expect(
        removeEntry(db, { ...base, conceptId: e.conceptId, undoExclusions: [own] }).undone
      ).toEqual([own]);
    });
  });
});

describe('historyFor', () => {
  it("historyFor finds an entry's change by its second form (P10)", () => {
    const e = addEntry(db, { ...base, english: ['zcell', 'zcells'], icelandic: 'zsella' });
    changeEntry(db, { ...base, at: LATER, conceptId: e.conceptId, icelandic: 'zfruma' });
    addExclusion(db, { ...base, english: 'zother' });
    addExclusion(db, { ...base, book: OTHER, english: 'zcells' });

    const rows = historyFor(db, BOOK, 'zcells');
    expect(rows.map((r) => r.action)).toEqual(['entry-change', 'entry-add']);
    expect(rows[0]).toEqual({
      id: expect.any(Number),
      at: LATER,
      by: 'tester',
      action: 'entry-change',
      english: 'zcell',
      before: { english: ['zcell', 'zcells'], icelandic: 'zsella', inflections: null },
      after: { english: ['zcell', 'zcells'], icelandic: 'zfruma' },
      reason: 'because',
      source: 'test',
    });
    // control: a row named by its own `english` is found too
    expect(historyFor(db, BOOK, 'zother').map((r) => r.action)).toEqual(['exclude']);
  });
});
