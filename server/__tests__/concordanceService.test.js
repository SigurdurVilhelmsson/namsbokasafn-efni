/**
 * Tests for concordanceService — index, search, exact-match dedup, report.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration036 = require('../migrations/036-tm-segments');
const concordance = require('../services/concordanceService');
const segmentParser = require('../services/segmentParser');

let db;
let tmpRoot;

/** Write an EN source + faithful IS file for a module. */
function writeModule(book, chDir, moduleId, pairs) {
  const enLines = [];
  const isLines = [];
  for (const [segType, elementId, en, is] of pairs) {
    enLines.push(`<!-- SEG:${moduleId}:${segType}:${elementId} -->\n${en}\n`);
    isLines.push(`<!-- SEG:${moduleId}:${segType}:${elementId} -->\n${is}\n`);
  }
  const enPath = path.join(
    tmpRoot,
    'books',
    book,
    '02-for-mt',
    chDir,
    `${moduleId}-segments.en.md`
  );
  const isPath = path.join(
    tmpRoot,
    'books',
    book,
    '03-faithful-translation',
    chDir,
    `${moduleId}-segments.is.md`
  );
  fs.mkdirSync(path.dirname(enPath), { recursive: true });
  fs.mkdirSync(path.dirname(isPath), { recursive: true });
  fs.writeFileSync(enPath, enLines.join('\n'));
  fs.writeFileSync(isPath, isLines.join('\n'));
}

describe('concordanceService', () => {
  beforeEach(() => {
    db = new Database(':memory:');
    migration036.up(db);
    concordance._setTestDb(db);

    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'concord-'));
    segmentParser._setTestBooksDir(path.join(tmpRoot, 'books'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    segmentParser._setTestBooksDir(path.join(process.cwd(), 'books'));
  });

  describe('text helpers', () => {
    it('strips markers but keeps MATH and ambiguous single-char markers', () => {
      expect(concordance.cleanText('Ca[[sup:2+]] and [[i:fast]]')).toBe('Ca2+ and fast');
      expect(concordance.cleanText('value [[MATH:5]] x*y')).toBe('value [[MATH:5]] x*y');
    });
    // M1/M4 mirror: MATH-in-term text kept verbatim (no id/pipe leak into the FTS index).
    it('keeps [[MATH:n]] verbatim inside a term marker', () => {
      expect(concordance.stripMarkers('[[term:rate [[MATH:1]]|t9]]')).toBe('rate [[MATH:1]]');
    });
    it('normalizeEn lowercases and collapses', () => {
      expect(concordance.normalizeEn('Check  Your\nLearning')).toBe('check your learning');
    });
    it('normalizeEn strips B4 markers to lowercase display text', () => {
      expect(concordance.normalizeEn('The [[term:Viscosity|term-1]]')).toBe('the viscosity');
    });
  });

  describe('indexModule', () => {
    it('indexes pairs and skips empty sides', () => {
      writeModule('tb', 'ch03', 'm001', [
        ['title', 't', 'Check Your Learning', 'Kannaðu skilning þinn'],
        ['para', 'p2', 'Water is H[[sub:2]]O.', 'Vatn er H[[sub:2]]O.'],
        ['para', 'p3', '[[xref:CNX_01]]', '[[xref:CNX_01]]'], // empty after strip
      ]);
      const r = concordance.indexModule('tb', 3, 'm001');
      expect(r.indexed).toBe(2);
      expect(r.skipped).toBe(1);
    });

    it('is idempotent — re-indexing replaces rows, no duplicates', () => {
      writeModule('tb', 'ch03', 'm001', [['title', 't', 'Hello', 'Halló']]);
      concordance.indexModule('tb', 3, 'm001');
      concordance.indexModule('tb', 3, 'm001');
      const count = db.prepare('SELECT COUNT(*) c FROM tm_segments').get().c;
      expect(count).toBe(1);
      // FTS mirror stays consistent (no orphan rows)
      expect(concordance.search('Hello', { book: 'tb' })).toHaveLength(1);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      writeModule('tb', 'ch03', 'm001', [
        ['title', 't', 'Check Your Learning', 'Kannaðu skilning þinn'],
        ['para', 'p2', 'Water is a solvent.', 'Vatn er leysir.'],
      ]);
      concordance.indexModule('tb', 3, 'm001');
    });

    it('finds matches on the EN side', () => {
      const r = concordance.search('learning', { book: 'tb' });
      expect(r).toHaveLength(1);
      expect(r[0].is_text).toBe('Kannaðu skilning þinn');
    });

    it('finds matches on the IS side', () => {
      const r = concordance.search('leysir', { book: 'tb' });
      expect(r).toHaveLength(1);
      expect(r[0].en_text).toBe('Water is a solvent.');
    });

    it('is book-scoped', () => {
      expect(concordance.search('learning', { book: 'other-book' })).toHaveLength(0);
    });

    it('does not crash on FTS special characters', () => {
      expect(() => concordance.search('a "quote" AND or *', { book: 'tb' })).not.toThrow();
    });

    it('returns nothing for empty/short queries', () => {
      expect(concordance.search('', { book: 'tb' })).toEqual([]);
      expect(concordance.search('a', { book: 'tb' })).toEqual([]);
    });
  });

  describe('findRepetitions', () => {
    beforeEach(() => {
      writeModule('tb', 'ch03', 'm001', [
        ['title', 't', 'Check Your Learning', 'Kannaðu skilning þinn'],
      ]);
      writeModule('tb', 'ch04', 'm002', [
        ['title', 't', 'check your learning', ''], // same EN (normalized), not yet translated
        ['para', 'p2', 'Unique sentence here.', ''],
      ]);
      concordance.indexModule('tb', 3, 'm001');
    });

    it('suggests an approved translation from another module', () => {
      const reps = concordance.findRepetitions('tb', 4, 'm002');
      expect(reps).toHaveLength(1);
      expect(reps[0].suggestion.is_text).toBe('Kannaðu skilning þinn');
      expect(reps[0].suggestion.module_id).toBe('m001');
    });

    it("excludes the segment's own module", () => {
      // m001 indexed; asking m001 for repetitions of its own segments → none
      const reps = concordance.findRepetitions('tb', 3, 'm001');
      expect(reps).toHaveLength(0);
    });
  });

  describe('repetitionReport', () => {
    it('flags recurring EN and whether translations agree', () => {
      writeModule('tb', 'ch03', 'm001', [['title', 't', 'Check Your Learning', 'Kannaðu A']]);
      writeModule('tb', 'ch04', 'm002', [['title', 't', 'Check Your Learning', 'Kannaðu A']]);
      writeModule('tb', 'ch05', 'm003', [['title', 't', 'Figure caption', 'Mynd A']]);
      concordance.indexModule('tb', 3, 'm001');
      concordance.indexModule('tb', 4, 'm002');
      concordance.indexModule('tb', 5, 'm003');

      const report = concordance.repetitionReport('tb');
      const cyl = report.find((r) => /Check Your Learning/i.test(r.en_text));
      expect(cyl.count).toBe(2);
      expect(cyl.agree).toBe(true);
      expect(cyl.modules.sort()).toEqual(['m001', 'm002']);
      // "Figure caption" appears once → not in the report
      expect(report.find((r) => /Figure caption/.test(r.en_text))).toBeUndefined();
    });

    it('marks disagreement when translations differ', () => {
      writeModule('tb', 'ch03', 'm001', [['title', 't', 'Same EN', 'Þýðing eitt']]);
      writeModule('tb', 'ch04', 'm002', [['title', 't', 'Same EN', 'Þýðing tvö']]);
      concordance.indexModule('tb', 3, 'm001');
      concordance.indexModule('tb', 4, 'm002');

      const report = concordance.repetitionReport('tb');
      const row = report.find((r) => r.en_text === 'Same EN');
      expect(row.agree).toBe(false);
      expect(row.distinctTranslations).toBe(2);
    });
  });

  describe('appendices label unification (item 14, finding 17b)', () => {
    it('backfill indexes an appendices module (was silently skipped)', () => {
      writeModule('bok', 'appendices', 'm99903', [
        ['para', 'fs-a1', 'Periodic table.', 'Lotukerfið.'],
      ]);
      const r = concordance.backfill('bok');
      expect(r.indexed).toBe(1);
    });

    it('stores the canonical "-1" chapter label from the backfill path', () => {
      writeModule('bok', 'appendices', 'm99903', [
        ['para', 'fs-a1', 'Periodic table.', 'Lotukerfið.'],
      ]);
      concordance.backfill('bok');
      const row = db.prepare(`SELECT chapter FROM tm_segments WHERE module_id = 'm99903'`).get();
      expect(row.chapter).toBe('-1');
    });

    it('stores "-1" from the apply-path form too (indexModule with -1)', () => {
      writeModule('bok', 'appendices', 'm99904', [
        ['para', 'fs-a2', 'Units appendix.', 'Einingaviðauki.'],
      ]);
      concordance.indexModule('bok', -1, 'm99904');
      const row = db.prepare(`SELECT chapter FROM tm_segments WHERE module_id = 'm99904'`).get();
      expect(row.chapter).toBe('-1');
    });

    it('repetitionReport finds appendix rows when filtered by -1', () => {
      writeModule('bok', 'appendices', 'm99905', [
        ['para', 'fs-a3', 'Same sentence.', 'Sama setning.'],
        ['para', 'fs-a4', 'Same sentence.', 'Sama setning.'],
      ]);
      concordance.indexModule('bok', -1, 'm99905');
      const report = concordance.repetitionReport('bok', -1, { limit: 10 });
      expect(report.length).toBeGreaterThan(0);
    });

    it('indexModule throws on unrecognizable chapter', () => {
      expect(() => concordance.indexModule('bok', 'chappendices', 'm99903')).toThrow(TypeError);
    });
  });
});
