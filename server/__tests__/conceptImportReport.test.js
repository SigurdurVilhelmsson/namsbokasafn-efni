// server/__tests__/conceptImportReport.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
const require = createRequire(import.meta.url);
const { formatImportReport, runImport } = require('../scripts/run-concept-import');
const Database = require('better-sqlite3');
const migration045 = require('../migrations/045-concept-model');
// Same singleton `fs` module object run-concept-import.js itself required —
// spying on it here patches the exact function it calls.
const nodeFs = require('fs');

const s = (over = {}) => ({
  collection: 'EFNAFR',
  entries: 100,
  imported: 90,
  skippedNoIcelandic: 10,
  terms: 150,
  byLang: { en: 80, is: 70, la: 0 },
  ...over,
});

describe('formatImportReport', () => {
  it('names every collection', () => {
    const out = formatImportReport([s(), s({ collection: 'PODDUR' })]);
    expect(out).toMatch(/EFNAFR/);
    expect(out).toMatch(/PODDUR/);
  });

  it('reports a zero-yield collection LOUDLY — a silent one bulks out the editor', () => {
    const out = formatImportReport([s({ collection: 'RISAEDLUR', imported: 0, terms: 0 })]);
    expect(out).toMatch(/ZERO YIELD/);
  });

  it('does not flag a healthy collection as zero yield', () => {
    // The control: without this, a formatter that flagged EVERYTHING would pass above.
    expect(formatImportReport([s()])).not.toMatch(/ZERO YIELD/);
  });

  it('flags a Latin-only collection so its editor-only reach is not mistaken for MT reach', () => {
    const out = formatImportReport([
      s({ collection: 'PODDUR', byLang: { en: 0, is: 300, la: 300 } }),
    ]);
    expect(out).toMatch(/LATIN-ONLY/);
  });

  it('totals the imported concepts, pinned exactly — a substring match would let 1100 pass', () => {
    // toMatch(/100 concepts/) is a SUBSTRING match: "TOTAL: 1100 concepts" contains
    // "100 concepts" too, so a total-computation bug landing on any number ending
    // in 100 would still pass. Pin the exact total line instead.
    expect(formatImportReport([s(), s({ imported: 10 })])).toContain('TOTAL: 100 concepts');
  });
});

describe('runImport', () => {
  let db;
  let dir;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('CREATE TABLE registered_books (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE);');
    migration045.up(db);

    dir = mkdtempSync(join(tmpdir(), 'concept-import-test-'));
    // Written PODDUR-before-EFNAFR on purpose: creation order is the REVERSE of
    // sorted order, so a passing sort-order assertion below actually proves the
    // `.sort()` call in runImport, not filesystem enumeration order.
    writeFileSync(
      join(dir, 'raw-PODDUR.json'),
      JSON.stringify({
        collection: 'PODDUR',
        entries: [{ id: 201, words: [{ fklanguage: 'IS', word: 'ediksgerla' }] }],
      })
    );
    writeFileSync(
      join(dir, 'raw-EFNAFR.json'),
      JSON.stringify({
        collection: 'EFNAFR',
        entries: [
          {
            id: 101,
            words: [
              { fklanguage: 'EN', word: 'atom' },
              { fklanguage: 'IS', word: 'frumeind' },
            ],
          },
          {
            id: 102,
            words: [
              { fklanguage: 'EN', word: 'bond' },
              { fklanguage: 'IS', word: 'efnatengi' },
            ],
          },
        ],
      })
    );
    // Decoys carry unparseable content on purpose: if the raw-*.json filter ever
    // widens to catch these, JSON.parse throws instead of silently importing
    // garbage — the test fails loud rather than passing by accident.
    writeFileSync(join(dir, 'raw-EFNAFR.json.bak'), 'not json'); // right prefix, wrong suffix
    writeFileSync(join(dir, 'other.json'), 'not json'); // right suffix, wrong prefix
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns one stats object per raw-*.json file, in sorted filename order', () => {
    // Real directory listing order is not guaranteed by any OS, and creation
    // order alone is not a reliable adversary — some filesystems (this tmpfs
    // /tmp mount included) already hand back readdirSync entries in
    // alphabetical order regardless of write order. Force an adversarial
    // listing order so this assertion is sensitive to runImport's own
    // `.sort()` call, not to filesystem behaviour.
    const spy = vi
      .spyOn(nodeFs, 'readdirSync')
      .mockReturnValue(['raw-PODDUR.json', 'raw-EFNAFR.json']);
    try {
      const stats = runImport(db, dir);
      expect(stats.map((st) => st.collection)).toEqual(['EFNAFR', 'PODDUR']);
    } finally {
      spy.mockRestore();
    }
  });

  it('ignores files that do not match raw-*.json', () => {
    const stats = runImport(db, dir);
    expect(stats).toHaveLength(2); // not 4 — the two decoys are excluded
  });

  it('returns stats that reflect rows actually landed in the db, not just a shape', () => {
    const stats = runImport(db, dir);
    const totalImported = stats.reduce((sum, st) => sum + st.imported, 0);
    const totalTerms = stats.reduce((sum, st) => sum + st.terms, 0);
    expect(totalImported).toBe(3); // 2 EFNAFR entries + 1 PODDUR entry
    expect(totalTerms).toBe(5); // EFNAFR: 2×(en+is) = 4; PODDUR: 1×is = 1
    expect(db.prepare('SELECT COUNT(*) n FROM concept').get().n).toBe(totalImported);
    expect(db.prepare('SELECT COUNT(*) n FROM concept_term').get().n).toBe(totalTerms);
  });
});
