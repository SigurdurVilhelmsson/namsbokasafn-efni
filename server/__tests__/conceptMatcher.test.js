import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { loadEnglishEntries, fingerprintEntries } = require('../lib/conceptMatcher');

let db;
beforeEach(() => {
  ({ db } = freshMigratedDb());
});
afterEach(() => db && db.close());

function addConcept(domain = 'chemistry') {
  return db.prepare('INSERT INTO concept (domain) VALUES (?)').run(domain).lastInsertRowid;
}
// ⚠️ `source` is TEXT NOT NULL (migration 045:45) — omit it and every insert
// dies on a NOT NULL constraint. Nothing outside the importer reads the column,
// so a fixture literal is safe.
function addTerm(conceptId, lang, text, rank = 1) {
  return db
    .prepare(
      "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,'test')"
    )
    .run(conceptId, lang, text, rank).lastInsertRowid;
}

describe('loadEnglishEntries() — D4.2, one entry per DISTINCT English string', () => {
  it('collapses two concepts sharing an English string to ONE entry', () => {
    const a = addConcept('chemistry');
    const b = addConcept('biology');
    const first = addTerm(a, 'en', 'nucleus');
    addTerm(b, 'en', 'nucleus');
    const { entries } = loadEnglishEntries(db);
    expect(entries.filter((e) => e.english === 'nucleus')).toHaveLength(1);
    expect(entries.find((e) => e.english === 'nucleus').headwordId).toBe(Number(first));
  });

  it('keeps the LOWEST term id, so the handle is stable across re-reads', () => {
    const a = addConcept();
    const b = addConcept();
    const low = addTerm(a, 'en', 'bond');
    addTerm(b, 'en', 'bond');
    expect(loadEnglishEntries(db).entries.find((e) => e.english === 'bond').headwordId).toBe(
      Number(low)
    );
  });

  it('is case-SENSITIVE, because concept_term lookup is binary-exact', () => {
    const a = addConcept();
    addTerm(a, 'en', 'Cell');
    addTerm(addConcept(), 'en', 'cell');
    const { entries } = loadEnglishEntries(db);
    expect(entries.filter((e) => e.english.toLowerCase() === 'cell')).toHaveLength(2);
  });

  it('ignores Icelandic rows entirely', () => {
    const a = addConcept();
    addTerm(a, 'is', 'frumeind');
    expect(loadEnglishEntries(db).entries).toHaveLength(0);
  });

  it('englishById maps every entry id back to its string', () => {
    const a = addConcept();
    const id = addTerm(a, 'en', 'atom');
    const { englishById } = loadEnglishEntries(db);
    expect(englishById.get(Number(id))).toBe('atom');
  });
});

describe('fingerprintEntries() — it must track what the AUTOMATON is built from', () => {
  const E = (id, english) => ({ headwordId: id, english });

  it('changes when an English string is added', () => {
    expect(fingerprintEntries([E(1, 'a')])).not.toBe(fingerprintEntries([E(1, 'a'), E(2, 'b')]));
  });
  it('changes when an English string is renamed', () => {
    expect(fingerprintEntries([E(1, 'a')])).not.toBe(fingerprintEntries([E(1, 'z')]));
  });
  // C24's transposition test, carried across: an order-blind XOR fold would miss this.
  it('changes on a pure transposition', () => {
    expect(fingerprintEntries([E(1, 'atom')])).not.toBe(fingerprintEntries([E(1, 'atmo')]));
  });
  it('is stable for an identical entry list', () => {
    expect(fingerprintEntries([E(1, 'a'), E(2, 'b')])).toBe(
      fingerprintEntries([E(1, 'a'), E(2, 'b')])
    );
  });
});
