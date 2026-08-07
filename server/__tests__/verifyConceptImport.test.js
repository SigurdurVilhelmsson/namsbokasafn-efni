import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration045 = require('../migrations/045-concept-model');
const { importConcepts } = require('../scripts/import-concepts');
const { verifyConceptImport } = require('../scripts/verify-concept-import');

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE registered_books (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE);');
  migration045.up(db);
});
afterEach(() => db.close());

const w = (fklanguage, word, extra = {}) => ({ fklanguage, word, ...extra });
const check = (r, name) => r.checks.find((c) => c.name === name);

function seedCell() {
  importConcepts(db, {
    collection: 'LIFORD',
    entries: [{ id: 687862, words: [w('EN', 'cell'), w('IS', 'fruma')] }],
  });
  importConcepts(db, {
    collection: 'EDLISFR',
    entries: [{ id: 321691, words: [w('EN', 'cell'), w('IS', 'rafhlað')] }],
  });
}

describe('verifyConceptImport', () => {
  it('passes the homograph check when cell is separated by domain', () => {
    seedCell();
    expect(check(verifyConceptImport(db), 'homographs-separated').ok).toBe(true);
  });

  it('FAILS the homograph check when two senses share one concept', () => {
    // The control: without this, a check that always passed would look correct.
    importConcepts(db, {
      collection: 'LIFORD',
      entries: [{ id: 1, words: [w('EN', 'cell'), w('IS', 'fruma', { synonyms: 'rafhlað' })] }],
    });
    expect(check(verifyConceptImport(db), 'homographs-separated').ok).toBe(false);
  });

  it('requires every concept to have at least one Icelandic term', () => {
    seedCell();
    expect(check(verifyConceptImport(db), 'every-concept-has-icelandic').ok).toBe(true);
  });

  it('requires every concept to have exactly one rank-1 Icelandic term', () => {
    importConcepts(db, {
      collection: 'EFNAFR',
      entries: [{ id: 2, words: [w('IS', 'frumeind', { synonyms: 'atóm' })] }],
    });
    expect(check(verifyConceptImport(db), 'one-head-form-per-concept').ok).toBe(true);
  });

  it('requires every domain to be one of the seven', () => {
    seedCell();
    expect(check(verifyConceptImport(db), 'domains-are-known').ok).toBe(true);
  });

  it('FAILS domains-are-known when an unknown domain is present', () => {
    seedCell();
    db.prepare("UPDATE concept SET domain='botany' WHERE id=1").run();
    expect(check(verifyConceptImport(db), 'domains-are-known').ok).toBe(false);
  });

  it('reports ok only when every check passes', () => {
    seedCell();
    db.prepare("UPDATE concept SET domain='botany' WHERE id=1").run();
    expect(verifyConceptImport(db).ok).toBe(false);
  });
});
