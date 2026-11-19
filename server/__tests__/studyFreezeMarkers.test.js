/**
 * G1.7 step 1, Task 3: `server/scripts/study-freeze.js markers`. It writes the content-free freeze
 * marker to every study unit, refuses the whole run (writing nothing) on a foreign marker or a unit
 * without an MT file, and never prints a marker body. Temp books root; no database.
 */
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  utimesSync,
  statSync,
} from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const work = mkdtempSync(path.join(tmpdir(), 'study-freeze-markers-'));
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const { writeModule } = require('./helpers/servedFixture');
const { FREEZE_LOCK_BODY, mtLockPathFor } = require('../../tools/lib/mt-lock.cjs');

const STUDY = 'efnafraedi-2e';
const MODULES = ['m96001', 'm96002', 'm96003'];

let root;
let realBooksDir;
let segmentParser;
let main;
let io;
let out;

const mtPath = (m) => path.join(root, STUDY, '02-mt-output', 'ch01', `${m}-segments.is.md`);
const lockOf = (m) => mtLockPathFor(mtPath(m));
const exists = (p) => {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
};

beforeAll(() => {
  segmentParser = require('../services/segmentParser');
  realBooksDir = segmentParser.BOOKS_DIR;
  ({ main } = require('../scripts/study-freeze'));
});

beforeEach(() => {
  root = path.join(work, `books-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  for (const m of MODULES) {
    writeModule(root, {
      book: STUDY,
      chapterDir: 'ch01',
      moduleId: m,
      en: [['p1', 'Hello']],
      mt: [['p1', 'Halló']],
    });
  }
  out = [];
  io = { log: (l) => out.push(String(l)), error: (l) => out.push(String(l)) };
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  rmSync(work, { recursive: true, force: true });
});

describe('study-freeze markers', () => {
  it('dry run (no --write) writes nothing and lists the absent units', () => {
    expect(main(['markers'], io)).toBe(0);
    for (const m of MODULES) expect(exists(lockOf(m))).toBe(false);
    expect(out.join('\n')).toContain('3');
  });

  it('--write writes the body to every absent unit', () => {
    expect(main(['markers', '--write'], io)).toBe(0);
    for (const m of MODULES) expect(readFileSync(lockOf(m), 'utf8')).toBe(FREEZE_LOCK_BODY);
    expect(out.join('\n')).toContain('written 3, already 0, total 3');
  });

  it('a re-run writes 0 and leaves the mtimes unchanged', () => {
    main(['markers', '--write'], io);
    const old = new Date('2020-01-01T00:00:00Z');
    for (const m of MODULES) utimesSync(lockOf(m), old, old);
    out.length = 0;
    expect(main(['markers', '--write'], io)).toBe(0);
    expect(out.join('\n')).toContain('written 0, already 3, total 3');
    for (const m of MODULES) expect(statSync(lockOf(m)).mtimeMs).toBe(old.getTime());
  });

  describe('a foreign marker', () => {
    beforeEach(() => {
      writeFileSync(
        lockOf(MODULES[1]),
        '{"lockedAt":"2099-01-01T00:00:00.000Z","firstEditId":424242}'
      );
      expect(main(['markers', '--write'], io)).toBe(1);
    });
    it('refuses the whole run: nothing else is written', () => {
      expect(exists(lockOf(MODULES[0]))).toBe(false);
      expect(exists(lockOf(MODULES[2]))).toBe(false);
    });
    it('names the unit', () => {
      expect(out.join('\n')).toContain(`ch01/${MODULES[1]}`);
    });
    it('never prints the body', () => {
      expect(out.join('\n')).not.toMatch(/2099|424242/);
    });
  });

  it('a unit with no MT file refuses the whole run', () => {
    writeModule(root, { book: STUDY, chapterDir: 'ch01', moduleId: 'm96004', en: [['p1', 'x']] });
    expect(main(['markers', '--write'], io)).toBe(1);
    for (const m of MODULES) expect(exists(lockOf(m))).toBe(false);
    expect(out.join('\n')).toContain('ch01/m96004');
  });

  it('an unknown flag exits 1 and writes nothing', () => {
    expect(main(['markers', '--wirte'], io)).toBe(1);
    for (const m of MODULES) expect(exists(lockOf(m))).toBe(false);
  });

  it('a non-study --book is refused', () => {
    expect(main(['markers', '--book', 'liffraedi-2e'], io)).toBe(1);
  });

  it('manifest and check are stubs that exit 1 for now', () => {
    expect(main(['manifest'], io)).toBe(1);
    expect(main(['check'], io)).toBe(1);
  });
});
