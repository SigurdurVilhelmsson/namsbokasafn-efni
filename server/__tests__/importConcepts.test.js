// server/__tests__/importConcepts.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration045 = require('../migrations/045-concept-model');
const { importConcepts } = require('../scripts/import-concepts');

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE registered_books (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE);');
  migration045.up(db);
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
});
