// server/__tests__/worklistSpec.test.js
/**
 * What a history row asks the book glossary worklist to find (design §5.5; plan rulings Q1-Q3).
 * History rows are made by PR 2's write API on a fresh migrated DB, so the before/after shapes
 * under test are the ones the layer really writes.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const {
  addExclusion,
  addEntry,
  removeExclusion,
  changeEntry,
  removeEntry,
} = require('../lib/bookGlossaryLayer');
const { readChange, worklistSpec } = require('../lib/worklistSpec');

const BOOK = 'efnafraedi-2e';
const OTHER = 'edlisfraedi-2e';
let db;

/** One concept; `is` may be null (no Icelandic term at all). */
function concept(domain, en, is, inflections = null) {
  const id = Number(
    db
      .prepare('INSERT INTO concept (domain, collection, idordabanki_id) VALUES (?, NULL, NULL)')
      .run(domain).lastInsertRowid
  );
  const ins = db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source, inflections) VALUES (?,?,?,1,'test',?)"
  );
  for (const e of [].concat(en)) ins.run(id, 'en', e, null);
  if (is != null) ins.run(id, 'is', is, inflections);
  return id;
}
const base = {
  book: BOOK,
  reason: 'because',
  source: 'test',
  by: 'tester',
  at: '2026-11-20T00:00:00.000Z',
};
const lastId = () => db.prepare('SELECT MAX(id) id FROM book_glossary_change').get().id;
const specOf = (id, slug = BOOK) => worklistSpec(db, slug, readChange(db, slug, id));
/** The entry-add row; a replacement's exclusion rows are written after it. */
const addedChange = (english, icelandic, replaces = []) => {
  const r = addEntry(db, { ...base, english, icelandic, replaces });
  const row = db
    .prepare("SELECT MAX(id) id FROM book_glossary_change WHERE action = 'entry-add'")
    .get();
  return { ...r, changeId: row.id };
};

beforeAll(() => {
  db = freshMigratedDb().db;
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

describe('worklistSpec', () => {
  it("a replacement searches the replaced concept's word, base form included", () => {
    const old = concept('chemistry', 'zcell', 'zker', '["zkeri","zkersins"]');
    const { changeId } = addedChange(['zcell'], 'zrafhlada', [old]);
    const s = specOf(changeId);
    expect(s.kind).toBe('replacement');
    expect(s.english).toEqual(['zcell']);
    expect([...s.oldForms].sort()).toEqual(['zker', 'zkeri', 'zkersins']);
    expect(s.old[0].inflected).toBe(true);
    expect(s.newIcelandic).toBe('zrafhlada');
  });

  it('an add alongside has no worklist', () => {
    const { changeId } = addedChange(['zcell'], 'zrafhlada');
    expect(specOf(changeId)).toMatchObject({ kind: null, reason: 'add-alongside', oldForms: [] });
  });

  it('a replacement whose exclusion was undone has no worklist', () => {
    const old = concept('chemistry', 'zcell', 'zker');
    const { changeId } = addedChange(['zcell'], 'zrafhlada', [old]);
    const ex = db.prepare('SELECT id FROM book_glossary_exclusion WHERE concept_id = ?').get(old);
    removeExclusion(db, { ...base, exclusionId: ex.id });
    expect(specOf(changeId)).toMatchObject({ kind: null, reason: 'exclusion-undone' });
  });

  it("a replacement over two concepts sharing one Icelandic word searches both concepts' inflections", () => {
    const a = concept('chemistry', 'zcell', 'zker', '["zkeri"]');
    const b = concept('chemistry', 'zcell', 'zker', '["zkersins"]');
    const { changeId } = addedChange(['zcell'], 'zrafhlada', [a, b]);
    const s = specOf(changeId);
    expect(s.old).toEqual([{ icelandic: 'zker', inflected: true }]);
    expect([...s.oldForms].sort()).toEqual(['zker', 'zkeri', 'zkersins']);
  });

  it('a change of Icelandic searches the old word kept in before_json', () => {
    const e = addEntry(db, { ...base, english: ['zfoo', 'zfooa'], icelandic: 'zfoo' });
    db.prepare("UPDATE concept_term SET inflections = ? WHERE concept_id = ? AND lang = 'is'").run(
      '["zfoos"]',
      e.conceptId
    );
    changeEntry(db, { ...base, conceptId: e.conceptId, icelandic: 'zbar' });
    const s = specOf(lastId());
    expect(s.kind).toBe('change');
    expect(s.oldForms.sort()).toEqual(['zfoo', 'zfoos']);
    expect(s.english).toEqual(['zfoo', 'zfooa']);
    expect(s.newIcelandic).toBe('zbar');
  });

  it('a forms-only change has no worklist', () => {
    const e = addEntry(db, { ...base, english: ['za'], icelandic: 'zá' });
    changeEntry(db, { ...base, conceptId: e.conceptId, forms: ['za', 'zb'] });
    expect(specOf(lastId())).toMatchObject({ kind: null, reason: 'no-new-word' });
  });

  it("a removal searches the entry's own word", () => {
    const e = addEntry(db, { ...base, english: ['za', 'zb'], icelandic: 'zá' });
    db.prepare("UPDATE concept_term SET inflections = ? WHERE concept_id = ? AND lang = 'is'").run(
      '["zás"]',
      e.conceptId
    );
    removeEntry(db, { ...base, conceptId: e.conceptId });
    const s = specOf(lastId());
    expect(s.kind).toBe('removal');
    expect(s.english).toEqual(['za', 'zb']);
    expect([...s.oldForms].sort()).toEqual(['zá', 'zás']);
    expect(s.newIcelandic).toBeNull();
  });

  it('the new Icelandic is never an old form', () => {
    const old = concept('chemistry', 'zcell', 'zker', '["zkeri","znyr"]');
    const { changeId } = addedChange(['zcell'], 'ZNYR', [old]);
    const s = specOf(changeId);
    expect(s.oldForms.map((f) => f.toLocaleLowerCase('is'))).not.toContain('znyr');
    expect(s.oldForms.sort()).toEqual(['zker', 'zkeri']);
  });

  it("a new word equal to an old word's base form drops that old word whole", () => {
    const e = addEntry(db, { ...base, english: ['zcell'], icelandic: 'zker' });
    db.prepare("UPDATE concept_term SET inflections = ? WHERE concept_id = ? AND lang = 'is'").run(
      '["zkeri"]',
      e.conceptId
    );
    changeEntry(db, { ...base, conceptId: e.conceptId, icelandic: 'Zker' });
    expect(specOf(lastId())).toMatchObject({
      kind: null,
      reason: 'nothing-to-search',
      english: [],
      old: [],
      oldForms: [],
    });
  });

  it('exclusions whose Icelandic snapshot is null leave nothing to search', () => {
    const old = concept('chemistry', 'zcell', null);
    const { changeId } = addedChange(['zcell'], 'zrafhlada', [old]);
    expect(specOf(changeId)).toMatchObject({ kind: null, reason: 'nothing-to-search' });
  });

  it('exclude and unexclude rows have no worklist', () => {
    const old = concept('chemistry', 'zcell', 'zker');
    const ex = addExclusion(db, { ...base, english: 'zcell', conceptId: old });
    const excludeId = lastId();
    removeExclusion(db, { ...base, exclusionId: ex.id });
    const unexcludeId = lastId();
    expect(specOf(excludeId)).toMatchObject({ kind: null, reason: 'not-applicable' });
    expect(specOf(unexcludeId)).toMatchObject({ kind: null, reason: 'not-applicable' });
  });
});

describe('readChange', () => {
  it("does not read another book's row", () => {
    const old = concept('physics', 'zcell', 'zker');
    addExclusion(db, { ...base, book: OTHER, english: 'zcell', conceptId: old });
    const id = lastId();
    expect(readChange(db, OTHER, id)).toMatchObject({ id, action: 'exclude' });
    expect(readChange(db, BOOK, id)).toBeNull();
  });
});
