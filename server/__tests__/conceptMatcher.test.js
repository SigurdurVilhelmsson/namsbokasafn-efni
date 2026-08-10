import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const {
  loadEnglishEntries,
  fingerprintEntries,
  prepareParadigmStatement,
  paradigmFor,
} = require('../lib/conceptMatcher');

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

describe('paradigmFor() — the "no paradigm" path is the COMMON one', () => {
  let stmt;
  beforeEach(() => {
    stmt = prepareParadigmStatement(db);
  });

  it('returns [] when inflections is NULL — ~70% of Icelandic rows', () => {
    const t = addTerm(addConcept(), 'is', 'kúvetta');
    expect(paradigmFor(stmt, Number(t))).toEqual([]);
  });

  it('returns the stored forms when present', () => {
    const t = addTerm(addConcept(), 'is', 'x');
    db.prepare('UPDATE concept_term SET inflections = ? WHERE id = ?').run('["xs","xi"]', t);
    expect(paradigmFor(stmt, Number(t))).toEqual(['xs', 'xi']);
  });

  // THE VALUE THAT ACTUALLY BREAKS THE IDIOM. '[]' is safe (truthy, parses to
  // []); the four-byte string 'null' is truthy, parses to a non-iterable, and
  // [text, ...null] throws TypeError. The B4b-0b producer never writes it —
  // this guards a FUTURE writer.
  it('returns [] for the literal string "null" instead of throwing', () => {
    const t = addTerm(addConcept(), 'is', 'y');
    db.prepare('UPDATE concept_term SET inflections = ? WHERE id = ?').run('null', t);
    expect(() => paradigmFor(stmt, Number(t))).not.toThrow();
    expect(paradigmFor(stmt, Number(t))).toEqual([]);
  });

  it.each([['[]'], ['{}'], ['123'], ['not json']])('returns [] for %p', (bad) => {
    const t = addTerm(addConcept(), 'is', `z${bad.length}`);
    db.prepare('UPDATE concept_term SET inflections = ? WHERE id = ?').run(bad, t);
    expect(paradigmFor(stmt, Number(t))).toEqual([]);
  });

  it('returns [] for an unknown term id rather than throwing', () => {
    expect(paradigmFor(stmt, 999999)).toEqual([]);
  });
});
