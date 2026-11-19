/**
 * G1.7 step 1, Task 6: the real-tree freeze guard (spec §7, §6.3; T8).
 *
 * Two guards on the REAL books/ tree, one per study book (`researchScope.STUDY_BOOKS`):
 *   - every study unit holds the content-free freeze marker, byte for byte, and the count of
 *     frozen units equals the unit count;
 *   - the current manifest, if any, still matches the tree (`compareToManifest`, `check`'s two
 *     verdicts). Until step 2 there is no manifest, and then the guard asserts that none exists
 *     on disk, read with its own directory listing, so a manifest `currentManifest` fails to find
 *     cannot pass silently (controller ruling R2).
 *
 * The planted controls call the SAME two predicates on a temp tree and require them to fail on an
 * absent marker, a near-miss marker body, a served-text change, an MT file change and a manifest
 * the lookup missed, so a broken comparison cannot pass. The real-tree cases never repoint the
 * books root; the controls repoint it and restore it in a `finally`.
 */
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { readdirSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'study-freeze-guard-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const segmentParser = require('../services/segmentParser');
const study = require('../scripts/study-freeze');
const { STUDY_BOOKS } = require('../lib/researchScope');
const { writeModule } = require('./helpers/servedFixture');
const { mtLockPathFor } = require('../../tools/lib/mt-lock.cjs');

const SERVER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REAL_BOOKS = path.join(SERVER_DIR, '..', 'books');
const REAL_ROOT = segmentParser.BOOKS_DIR;

afterAll(() => {
  segmentParser._setTestBooksDir(REAL_ROOT);
  rmSync(work, { recursive: true, force: true });
});

/** The real-tree cases read the real tree: the root is the repository's books/, at call time. */
function expectRealRoot() {
  expect(segmentParser.BOOKS_DIR).toBe(REAL_BOOKS);
}

/** The marker guard (T8). Throws an assertion error unless every unit holds the freeze marker. */
function expectFrozen(book) {
  const m = study.checkMarkers({ book });
  expect(m.total).toBeGreaterThan(0);
  expect(m.absent).toEqual([]);
  expect(m.foreign).toEqual([]);
  expect(m.freeze).toBe(m.total);
}

/** Every `books/<book>/freeze/<dir>/freeze.json` on disk, by directory name: no currentManifest. */
function freezeJsonsOnDisk(book) {
  const parent = path.join(segmentParser.BOOKS_DIR, book, 'freeze');
  let names;
  try {
    names = readdirSync(parent);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  return names.filter((n) => existsSync(path.join(parent, n, 'freeze.json'))).sort();
}

/**
 * The manifest guard, asserting in both states (R2). `cur` is what `currentManifest` returned:
 * with none, no manifest may exist on disk; with one, the tree must still match it.
 */
function expectManifestHolds(book, cur) {
  if (cur === null) {
    expect(freezeJsonsOnDisk(book)).toEqual([]);
    return;
  }
  const r = study.compareToManifest({ book, manifestDir: cur.dir });
  // one list per assertion, keys as strings, so a failure message names what differs
  expect(r.unitSetChanged).toEqual({ missing: [], extra: [] });
  expect(r.inputChanged).toEqual([]);
  expect(r.servedChanged.map((s) => `${s.unit}#${s.segmentId}#${s.occurrence}`)).toEqual([]);
  expect(r.pass).toBe(true);
}

describe('the real tree', () => {
  it.each(STUDY_BOOKS)(
    '%s: every study unit holds the freeze marker, byte for byte (T8)',
    (book) => {
      expectRealRoot();
      expectFrozen(book);
    }
  );

  it.each(STUDY_BOOKS)('%s: the current manifest, if any, still matches the tree', (book) => {
    expectRealRoot();
    expectManifestHolds(book, study.currentManifest({ book }));
  });

  it('check run as a file from server/ as cwd exits 0 with PASS (Review Focus 3)', () => {
    const r = spawnSync(process.execPath, ['scripts/study-freeze.js', 'check'], {
      cwd: SERVER_DIR,
      encoding: 'utf8',
      timeout: 25000,
    });
    expect(r.status, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('STUDY FREEZE CHECK: PASS');
    expect(r.stdout).toMatch(/markers: (\d+)\/\1 units hold the freeze marker/);
  });
});

describe('controls on a planted tree: the same two predicates fail when they should', () => {
  const BOOK = STUDY_BOOKS[0];
  const TAG = `freeze-${BOOK}-2026-12-01`;
  const GIT = Object.freeze({
    baseCommit: 'a'.repeat(40),
    layer1LastCommit: 'b'.repeat(40),
    handRepairs: [],
    shallow: false,
    dirtyPaths: [],
  });
  const UNITS = [
    { chapterDir: 'ch01', moduleId: 'm97001' },
    { chapterDir: 'ch01', moduleId: 'm97002' },
    { chapterDir: 'appendices', moduleId: 'm97003' },
  ];
  const ids = (u) => [`${u.moduleId}:para:a`, `${u.moduleId}:para:b`];
  let root;

  const mtPath = (u) =>
    path.join(root, BOOK, '02-mt-output', u.chapterDir, `${u.moduleId}-segments.is.md`);
  const manifestDir = () => path.join(root, BOOK, 'freeze', TAG);
  const cut = () => {
    const built = study.buildManifest({ book: BOOK, tag: TAG, git: GIT });
    study.writeManifest({ book: BOOK, tag: TAG, ...built });
  };

  beforeEach(() => {
    root = path.join(work, `books-${Math.random().toString(36).slice(2)}`);
    mkdirSync(root, { recursive: true });
    segmentParser._setTestBooksDir(root);
    for (const u of UNITS) {
      writeModule(root, {
        book: BOOK,
        chapterDir: u.chapterDir,
        moduleId: u.moduleId,
        en: ids(u).map((id, i) => [id, `English ${u.moduleId} ${i}.`]),
        mt: ids(u).map((id, i) => [id, `Íslenska ${u.moduleId} ${i}.`]),
      });
    }
    study.writeMarkers(study.planMarkers({ book: BOOK }));
  });

  afterEach(() => {
    segmentParser._setTestBooksDir(REAL_ROOT);
  });

  it('control: on a planted tree, an absent marker and a served-text change are both caught', () => {
    try {
      cut();
      // positive baseline: the planted tree passes both guards
      expect(() => expectFrozen(BOOK)).not.toThrow();
      expect(() => expectManifestHolds(BOOK, study.currentManifest({ book: BOOK }))).not.toThrow();

      // an absent marker fails the marker guard, naming the unit
      unlinkSync(mtLockPathFor(mtPath(UNITS[1])));
      expect(() => expectFrozen(BOOK)).toThrow(/ch01\/m97002/);
      study.writeMarkers(study.planMarkers({ book: BOOK }));
      expect(() => expectFrozen(BOOK)).not.toThrow();

      // one manifest line's is_sha256 altered (header re-hashed): served text changed
      const file = path.join(manifestDir(), 'segments.jsonl');
      const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
      const altered = JSON.parse(lines[2]);
      altered.is_sha256 = '0'.repeat(64);
      lines[2] = JSON.stringify(altered);
      const jsonl = `${lines.join('\n')}\n`;
      writeFileSync(file, jsonl);
      const headerPath = path.join(manifestDir(), 'freeze.json');
      const header = JSON.parse(readFileSync(headerPath, 'utf8'));
      header.segmentsSha256 = createHash('sha256').update(jsonl).digest('hex');
      writeFileSync(headerPath, `${JSON.stringify(header, null, 2)}\n`);
      const cur = study.currentManifest({ book: BOOK });
      expect(() => expectManifestHolds(BOOK, cur)).toThrow(/m97002/);
      const r = study.compareToManifest({ book: BOOK, manifestDir: cur.dir });
      expect([r.inputChanged, r.servedChanged]).toEqual([
        [],
        [{ unit: 'ch01/m97002', segmentId: altered.segment_id, occurrence: 0 }],
      ]);
    } finally {
      segmentParser._setTestBooksDir(REAL_ROOT);
    }
  });

  it('control: a near-miss marker body (no trailing newline) is foreign, not freeze', () => {
    try {
      writeFileSync(mtLockPathFor(mtPath(UNITS[0])), JSON.stringify({ reason: 'freeze' }, null, 2));
      expect(() => expectFrozen(BOOK)).toThrow(/ch01\/m97001/);
      expect(study.checkMarkers({ book: BOOK }).foreign).toEqual(['ch01/m97001']);
    } finally {
      segmentParser._setTestBooksDir(REAL_ROOT);
    }
  });

  it('control: an MT file changed since the cut is caught as input changed', () => {
    try {
      cut();
      const u = UNITS[2];
      writeFileSync(mtPath(u), readFileSync(mtPath(u), 'utf8').replace('Íslenska', 'Íslensk'));
      const cur = study.currentManifest({ book: BOOK });
      expect(() => expectManifestHolds(BOOK, cur)).toThrow(/appendices\/m97003/);
      const r = study.compareToManifest({ book: BOOK, manifestDir: cur.dir });
      expect([r.inputChanged, r.servedChanged]).toEqual([['appendices/m97003'], []]);
    } finally {
      segmentParser._setTestBooksDir(REAL_ROOT);
    }
  });

  it('control (R2): with no manifest found, a manifest on disk still fails the guard', () => {
    try {
      // baseline: no manifest anywhere, so the no-manifest branch passes
      expect(study.currentManifest({ book: BOOK })).toBe(null);
      expect(() => expectManifestHolds(BOOK, null)).not.toThrow();
      // a manifest on disk that the lookup missed (null passed in) is a failure, naming it
      cut();
      expect(freezeJsonsOnDisk(BOOK)).toEqual([TAG]);
      expect(() => expectManifestHolds(BOOK, null)).toThrow(new RegExp(TAG));
    } finally {
      segmentParser._setTestBooksDir(REAL_ROOT);
    }
  });
});
