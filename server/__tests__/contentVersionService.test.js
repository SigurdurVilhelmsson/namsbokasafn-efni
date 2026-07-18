/**
 * Content Version Service — restore (Unit 1, feat/content-restore).
 *
 * Exercises the backward-rollback path that writes a chosen content_versions
 * snapshot back as the faithful file:
 *   - round-trip (restore brings back the snapshotted content)
 *   - restore is itself reversible (restore-then-restore)
 *   - graceful when the extraction changed (segment ids differ)
 *
 * Uses an in-memory better-sqlite3 DB and a temp books directory.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: concordanceService resolves its DB path at
// first use — never let a mis-wired singleton reach a real sessions.db.
process.env.SESSIONS_DB_PATH = join(tmpdir(), `cvs-test-${process.pid}.db`);

const Database = require('better-sqlite3');

const contentVersionService = require('../services/contentVersionService');
const segmentParser = require('../services/segmentParser');
const concordance = require('../services/concordanceService');
const tmService = require('../services/tmService');
const migration036 = require('../migrations/036-tm-segments');
const migration042 = require('../migrations/042-content-versions-track');

const originalBooksDir = segmentParser.BOOKS_DIR;

const BOOK = 'testbook';
const CHAPTER = 1;
const MODULE = 'm00001';
const SEG = (id) => `${MODULE}:para:${id}`;

/** Build a SEG-marked segment file body from an ordered [{segmentId, content}]. */
function fileBody(segments) {
  return segments
    .map((s) => {
      const [mod, type, el] = s.segmentId.split(':');
      return `<!-- SEG:${mod}:${type}:${el} -->\n${s.content}`;
    })
    .join('\n\n');
}

/** Read the faithful file back as a {segmentId: content} map. */
function readFaithful(booksDir) {
  const p = join(booksDir, BOOK, '03-faithful-translation', 'ch01', `${MODULE}-segments.is.md`);
  const parsed = segmentParser.parseSegments(readFileSync(p, 'utf-8'));
  const map = {};
  for (const s of parsed) map[s.segmentId] = s.content.trim();
  return map;
}

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE content_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      module_id TEXT NOT NULL,
      segment_id TEXT NOT NULL,
      content TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      applied_by TEXT,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(book, module_id, segment_id, version)
    );
  `);
  // item 15: rebuild in the track column the same way production migrations
  // do, so the in-memory test schema matches what contentVersionService now
  // expects (track-scoped WHERE clauses, widened UNIQUE).
  migration042.up(db);
  return db;
}

describe('contentVersionService.restoreVersion', () => {
  let db;
  let tmpDir;
  let booksDir;

  // EN source ids present in the current extraction
  const EN_IDS = ['fs-id001', 'fs-id002', 'fs-id003'];

  beforeEach(() => {
    db = createTestDb();
    contentVersionService._setTestDb(db);
    migration036.up(db); // tm_segments + FTS5 mirror for the F16 reindex assertions
    concordance._setTestDb(db);
    tmService._setRunner(() => Promise.resolve({ code: 0, stderr: '' }));

    tmpDir = mkdtempSync(join(tmpdir(), 'restore-test-'));
    booksDir = join(tmpDir, 'books');
    const bookDir = join(booksDir, BOOK);

    // EN source (required by loadModuleForEditing)
    const enDir = join(bookDir, '02-for-mt', 'ch01');
    mkdirSync(enDir, { recursive: true });
    writeFileSync(
      join(enDir, `${MODULE}-segments.en.md`),
      fileBody(EN_IDS.map((id) => ({ segmentId: SEG(id), content: `EN ${id}` }))),
      'utf-8'
    );

    segmentParser._setTestBooksDir(booksDir);
  });

  afterEach(() => {
    db.close();
    contentVersionService._setTestDb(null);
    segmentParser._setTestBooksDir(originalBooksDir);
    concordance._setTestDb(null);
    tmService._setRunner();
  });

  /** Write the faithful file with the given {id: content} for the EN segments. */
  function writeFaithful(byId) {
    const dir = join(booksDir, BOOK, '03-faithful-translation', 'ch01');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${MODULE}-segments.is.md`),
      fileBody(EN_IDS.map((id) => ({ segmentId: SEG(id), content: byId[id] }))),
      'utf-8'
    );
  }

  it('round-trips: restore writes the snapshotted content back as the faithful file', () => {
    // Original content snapshotted as version 1 (as applyApprovedEdits would)
    const original = {
      'fs-id001': 'Upprunalegt A',
      'fs-id002': 'Upprunalegt B',
      'fs-id003': 'Upprunalegt C',
    };
    writeFaithful(original);
    contentVersionService.snapshotModule(
      BOOK,
      CHAPTER,
      MODULE,
      EN_IDS.map((id) => ({ segmentId: SEG(id), content: original[id] }))
    );

    // A later apply overwrote the faithful file with new content
    const current = { 'fs-id001': 'Nýtt A', 'fs-id002': 'Nýtt B', 'fs-id003': 'Nýtt C' };
    writeFaithful(current);

    const result = contentVersionService.restoreVersion(BOOK, CHAPTER, MODULE, 1, {
      userId: 2,
      username: 'headX',
    });

    expect(result.restoredVersion).toBe(1);
    expect(result.segmentsRestored).toBe(3);
    expect(result.segmentsKept).toBe(0);
    expect(result.segmentsSkipped).toBe(0);

    // File now holds the original (version 1) content again
    const onDisk = readFaithful(booksDir);
    expect(onDisk[SEG('fs-id001')]).toBe('Upprunalegt A');
    expect(onDisk[SEG('fs-id002')]).toBe('Upprunalegt B');
    expect(onDisk[SEG('fs-id003')]).toBe('Upprunalegt C');

    // A fresh snapshot of the pre-restore (current) content was taken first
    expect(result.snapshotVersion).toBe(2);
    const versions = contentVersionService.getModuleVersions(BOOK, MODULE);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    const v2 = contentVersionService.getVersionContent(BOOK, MODULE, 2);
    const v2map = Object.fromEntries(v2.map((s) => [s.segment_id, s.content]));
    expect(v2map[SEG('fs-id001')]).toBe('Nýtt A');
  });

  it('restore is itself reversible (restore-then-restore round-trips)', () => {
    const original = { 'fs-id001': 'A1', 'fs-id002': 'B1', 'fs-id003': 'C1' };
    writeFaithful(original);
    contentVersionService.snapshotModule(
      BOOK,
      CHAPTER,
      MODULE,
      EN_IDS.map((id) => ({ segmentId: SEG(id), content: original[id] }))
    );

    const current = { 'fs-id001': 'A2', 'fs-id002': 'B2', 'fs-id003': 'C2' };
    writeFaithful(current);

    // Restore to v1 (original); pre-restore "current" captured as v2
    const first = contentVersionService.restoreVersion(BOOK, CHAPTER, MODULE, 1, {
      username: 'headX',
    });
    expect(readFaithful(booksDir)[SEG('fs-id001')]).toBe('A1');
    expect(first.snapshotVersion).toBe(2);

    // Restore forward to v2 (the captured "current"); should round-trip cleanly
    const second = contentVersionService.restoreVersion(BOOK, CHAPTER, MODULE, 2, {
      username: 'headX',
    });
    expect(second.restoredVersion).toBe(2);
    const onDisk = readFaithful(booksDir);
    expect(onDisk[SEG('fs-id001')]).toBe('A2');
    expect(onDisk[SEG('fs-id002')]).toBe('B2');
    expect(onDisk[SEG('fs-id003')]).toBe('C2');
  });

  it('is graceful when the extraction changed (skips orphan ids, keeps unsnapshotted ids)', () => {
    // Snapshot v1 contains an extra id (fs-id999) that is NOT in the current EN
    // extraction, and is MISSING fs-id003 that IS in the current extraction.
    const snapshotSegs = [
      { segmentId: SEG('fs-id001'), content: 'Snap A' },
      { segmentId: SEG('fs-id002'), content: 'Snap B' },
      { segmentId: SEG('fs-id999'), content: 'Snap GONE' },
    ];
    contentVersionService.snapshotModule(BOOK, CHAPTER, MODULE, snapshotSegs);

    // Current faithful covers the live extraction ids
    const current = { 'fs-id001': 'Cur A', 'fs-id002': 'Cur B', 'fs-id003': 'Cur C' };
    writeFaithful(current);

    const result = contentVersionService.restoreVersion(BOOK, CHAPTER, MODULE, 1, {
      username: 'headX',
    });

    // id001/id002 restored from snapshot; id003 kept (absent from snapshot);
    // id999 skipped (no longer in the extraction) — no crash, no data loss.
    expect(result.segmentsRestored).toBe(2);
    expect(result.segmentsKept).toBe(1);
    expect(result.segmentsSkipped).toBe(1);

    const onDisk = readFaithful(booksDir);
    expect(Object.keys(onDisk).sort()).toEqual([SEG('fs-id001'), SEG('fs-id002'), SEG('fs-id003')]);
    expect(onDisk[SEG('fs-id001')]).toBe('Snap A');
    expect(onDisk[SEG('fs-id002')]).toBe('Snap B');
    expect(onDisk[SEG('fs-id003')]).toBe('Cur C');
    // The orphaned snapshot row is still in content_versions (recoverable)
    const v1 = contentVersionService.getVersionContent(BOOK, MODULE, 1);
    expect(v1.some((s) => s.segment_id === SEG('fs-id999'))).toBe(true);
  });

  it('throws a 404-style error when the version does not exist', () => {
    writeFaithful({ 'fs-id001': 'A', 'fs-id002': 'B', 'fs-id003': 'C' });
    expect(() => contentVersionService.restoreVersion(BOOK, CHAPTER, MODULE, 99, {})).toThrow(
      /Version 99 not found/
    );
  });

  it('records empty segments as explicit empty rows (F19)', () => {
    const res = contentVersionService.snapshotModule(
      BOOK,
      CHAPTER,
      MODULE,
      [
        { segmentId: SEG('fs-id001'), content: 'texti' },
        { segmentId: SEG('fs-id002'), content: '' },
      ],
      'prófari',
      db
    );
    expect(res.segmentsSnapshotted).toBe(2);
    const rows = db
      .prepare(
        `SELECT segment_id, content FROM content_versions WHERE version = ? ORDER BY segment_id`
      )
      .all(res.version);
    expect(rows).toContainEqual({ segment_id: SEG('fs-id002'), content: '' });
  });

  it('an all-empty module produces a real, listable version (F19 phantom fix)', () => {
    const res = contentVersionService.snapshotModule(
      BOOK,
      CHAPTER,
      MODULE,
      EN_IDS.map((id) => ({ segmentId: SEG(id), content: '' })),
      'prófari',
      db
    );
    expect(res.segmentsSnapshotted).toBe(EN_IDS.length);
    const listed = contentVersionService.getModuleVersions(BOOK, MODULE);
    expect(listed.some((v) => v.version === res.version)).toBe(true);
  });

  it('restore-then-undo returns an empty segment to empty (F19)', () => {
    // A past version where fs-id003 had real text.
    const past = contentVersionService.snapshotModule(
      BOOK,
      CHAPTER,
      MODULE,
      [
        { segmentId: SEG('fs-id001'), content: 'Gamalt 1' },
        { segmentId: SEG('fs-id002'), content: 'Gamalt 2' },
        { segmentId: SEG('fs-id003'), content: 'Gamalt 3' },
      ],
      'prófari',
      db
    );

    // Current faithful state: fs-id003 is EMPTY (untranslated).
    const faithfulPath = join(
      booksDir,
      BOOK,
      '03-faithful-translation',
      'ch01',
      `${MODULE}-segments.is.md`
    );
    mkdirSync(dirname(faithfulPath), { recursive: true });
    writeFileSync(
      faithfulPath,
      fileBody([
        { segmentId: SEG('fs-id001'), content: 'Núverandi 1' },
        { segmentId: SEG('fs-id002'), content: 'Núverandi 2' },
        { segmentId: SEG('fs-id003'), content: '' },
      ]),
      'utf-8'
    );

    // Restore the past version → fs-id003 gets 'Gamalt 3'.
    const res = contentVersionService.restoreVersion(BOOK, CHAPTER, MODULE, past.version, {
      username: 'hx',
    });
    expect(readFaithful(booksDir)[SEG('fs-id003')]).toBe('Gamalt 3');

    // Undo (restore the pre-restore snapshot) → fs-id003 must be EMPTY again.
    contentVersionService.restoreVersion(BOOK, CHAPTER, MODULE, res.snapshotVersion, {
      username: 'hx',
    });
    expect(readFaithful(booksDir)[SEG('fs-id003')]).toBe('');
  });

  it('nullish snapshot content fails loud and leaves no partial version (F19)', () => {
    const before =
      db
        .prepare(`SELECT MAX(version) AS v FROM content_versions WHERE book = ? AND module_id = ?`)
        .get(BOOK, MODULE).v || 0;
    expect(() =>
      contentVersionService.snapshotModule(
        BOOK,
        CHAPTER,
        MODULE,
        [
          { segmentId: SEG('fs-id001'), content: 'gilt' },
          { segmentId: SEG('fs-id002'), content: null },
        ],
        'prófari',
        db
      )
    ).toThrow();
    const rows = db
      .prepare(
        `SELECT COUNT(*) AS n FROM content_versions WHERE book = ? AND module_id = ? AND version > ?`
      )
      .get(BOOK, MODULE, before).n;
    expect(rows).toBe(0); // transaction rolled back — no partial snapshot
  });

  it('restore reindexes concordance and schedules TM regen (F16)', () => {
    const snap = contentVersionService.snapshotModule(
      BOOK,
      CHAPTER,
      MODULE,
      [
        { segmentId: SEG('fs-id001'), content: 'Endurheimt efni 1' },
        { segmentId: SEG('fs-id002'), content: 'Endurheimt efni 2' },
        { segmentId: SEG('fs-id003'), content: 'Endurheimt efni 3' },
      ],
      'prófari',
      db
    );

    contentVersionService.restoreVersion(BOOK, CHAPTER, MODULE, snap.version, { username: 'hx' });

    // Concordance now reflects the RESTORED text (indexModule re-read the file).
    const rows = db
      .prepare(`SELECT segment_id, is_text FROM tm_segments WHERE book = ? AND module_id = ?`)
      .all(BOOK, MODULE);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.find((r) => r.segment_id === SEG('fs-id001'))?.is_text).toBe('Endurheimt efni 1');

    // TM regeneration was scheduled for this book (debounced; stub runner).
    expect(tmService._pendingBooks()).toContain(BOOK);
  });

  it('restore still succeeds when reindexing fails (best-effort, F16)', () => {
    const snap = contentVersionService.snapshotModule(
      BOOK,
      CHAPTER,
      MODULE,
      [{ segmentId: SEG('fs-id001'), content: 'Þolið efni' }],
      'prófari',
      db
    );

    const broken = new Database(':memory:'); // no tm tables → indexModule throws
    concordance._setTestDb(broken);
    const res = contentVersionService.restoreVersion(BOOK, CHAPTER, MODULE, snap.version, {
      username: 'hx',
    });
    expect(res.restoredVersion).toBe(snap.version);
    broken.close();
  });
});

describe('contentVersionService.snapshotModule connection threading', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    contentVersionService._setTestDb(db);
  });

  afterEach(() => {
    db.close();
    contentVersionService._setTestDb(null);
  });

  // Regression: applyApprovedEdits runs inside an IMMEDIATE write transaction.
  // The snapshot previously wrote on contentVersionService's *own* connection,
  // which deadlocked on SQLITE_BUSY and was silently swallowed — leaving an
  // empty version history despite a successful apply. The snapshot must accept
  // and write on the caller's connection.
  it('records the snapshot when called on a caller connection inside an open IMMEDIATE transaction', () => {
    const segs = [
      { segmentId: SEG('1'), content: 'vélþýðing 1' },
      { segmentId: SEG('2'), content: 'vélþýðing 2' },
    ];

    const apply = db.transaction(() => {
      const res = contentVersionService.snapshotModule(BOOK, CHAPTER, MODULE, segs, null, db);
      expect(res.version).toBe(1);
      expect(res.segmentsSnapshotted).toBe(2);
    });
    // .immediate() takes the write lock up-front, mirroring the apply path.
    apply.immediate();

    const versions = contentVersionService.getModuleVersions(BOOK, MODULE);
    expect(versions).toHaveLength(1);
    expect(versions[0].segments).toBe(2);

    const content = contentVersionService.getVersionContent(BOOK, MODULE, 1);
    expect(content.map((c) => c.content)).toEqual(['vélþýðing 1', 'vélþýðing 2']);
  });

  it('still defaults to its own connection when no db is passed', () => {
    contentVersionService.snapshotModule(BOOK, CHAPTER, MODULE, [
      { segmentId: SEG('1'), content: 'sjálfgefið' },
    ]);
    expect(contentVersionService.getModuleVersions(BOOK, MODULE)).toHaveLength(1);
  });
});

describe('track parameterization (item 15)', () => {
  let db;
  let tmpDir;
  let booksDir;

  beforeEach(() => {
    db = createTestDb();
    contentVersionService._setTestDb(db);

    tmpDir = mkdtempSync(join(tmpdir(), 'track-test-'));
    booksDir = join(tmpDir, 'books');
    segmentParser._setTestBooksDir(booksDir);
  });

  afterEach(() => {
    db.close();
    contentVersionService._setTestDb(null);
    segmentParser._setTestBooksDir(originalBooksDir);
  });

  // Helper: write EN + faithful + (optionally) localized fixture files for a module.
  // Mirrors the file layout segmentParser.getModulePaths expects.
  function writeLocModule(moduleId, { faithful, localized }) {
    const seg = (id, text) => `<!-- SEG:${moduleId}:para:${id} -->\n${text}\n`;
    const base = join(booksDir, BOOK);
    const files = [
      [
        '02-for-mt/ch03',
        `${moduleId}-segments.en.md`,
        seg('a', 'EN one') + '\n' + seg('b', 'EN two'),
      ],
      [
        '03-faithful-translation/ch03',
        `${moduleId}-segments.is.md`,
        seg('a', faithful[0]) + '\n' + seg('b', faithful[1]),
      ],
    ];
    if (localized) {
      files.push([
        '04-localized-content/ch03',
        `${moduleId}-segments.is.md`,
        seg('a', localized[0]) + '\n' + seg('b', localized[1]),
      ]);
    }
    for (const [dir, name, content] of files) {
      mkdirSync(join(base, dir), { recursive: true });
      writeFileSync(join(base, dir, name), content);
    }
  }

  it('keeps independent version counters per track for the same module', () => {
    const segs = [{ segmentId: 'mX:para:a', content: 'A' }];
    contentVersionService.snapshotModule(BOOK, 3, 'mX', segs, 'ed1');
    contentVersionService.snapshotModule(BOOK, 3, 'mX', segs, 'ed1');
    contentVersionService.snapshotModule(BOOK, 3, 'mX', segs, 'ed1', undefined, 'localized');
    expect(contentVersionService.getModuleVersions(BOOK, 'mX').map((v) => v.version)).toEqual([
      2, 1,
    ]);
    expect(
      contentVersionService.getModuleVersions(BOOK, 'mX', 'localized').map((v) => v.version)
    ).toEqual([1]);
  });

  it('throws TypeError on unknown track', () => {
    expect(() => contentVersionService.getModuleVersions(BOOK, 'mX', 'mt-preview')).toThrow(
      TypeError
    );
    expect(() => contentVersionService.restoreVersion(BOOK, 3, 'mX', 1, {}, 'mt-preview')).toThrow(
      TypeError
    );
  });

  it('localized restore round-trips through the localized file', () => {
    writeLocModule('m77001', {
      faithful: ['trúr A', 'trúr B'],
      localized: ['staðfært A v1', 'staðfært B v1'],
    });
    // Snapshot the v1 localized state (as saveLocalizedWithSnapshot would pre-write)
    contentVersionService.snapshotModule(
      BOOK,
      3,
      'm77001',
      [
        { segmentId: 'm77001:para:a', content: 'staðfært A v1' },
        { segmentId: 'm77001:para:b', content: 'staðfært B v1' },
      ],
      'ed1',
      undefined,
      'localized'
    );
    // Editor writes v2 on disk
    segmentParser.saveLocalizedSegments(BOOK, 3, 'm77001', [
      { segmentId: 'm77001:para:a', content: 'staðfært A v2' },
      { segmentId: 'm77001:para:b', content: 'staðfært B v2' },
    ]);

    const result = contentVersionService.restoreVersion(BOOK, 3, 'm77001', 1, {}, 'localized');
    expect(result.segmentsRestored).toBe(2);
    expect(result.snapshotVersion).toBe(2); // current v2 content snapshotted first

    const filePath = join(booksDir, BOOK, '04-localized-content/ch03/m77001-segments.is.md');
    let file = readFileSync(filePath, 'utf-8');
    expect(file).toContain('staðfært A v1');
    expect(file).not.toContain('staðfært A v2');
    // Faithful history untouched by localized activity
    expect(contentVersionService.getModuleVersions(BOOK, 'm77001')).toEqual([]);

    // Restore is itself reversible: roll forward to the pre-restore snapshot (v2)
    const forward = contentVersionService.restoreVersion(BOOK, 3, 'm77001', 2, {}, 'localized');
    expect(forward.segmentsRestored).toBe(2);
    file = readFileSync(filePath, 'utf-8');
    expect(file).toContain('staðfært A v2');
  });

  it('localized current-content field is hasLocalized ? localized : faithful', () => {
    writeLocModule('m77002', { faithful: ['trúr A', 'trúr B'] }); // NO localized file yet
    // Snapshot v1 then create a localized file so restore has a writer target
    contentVersionService.snapshotModule(
      BOOK,
      3,
      'm77002',
      [
        { segmentId: 'm77002:para:a', content: 'fyrsta staðfærsla' },
        { segmentId: 'm77002:para:b', content: '' },
      ],
      'ed1',
      undefined,
      'localized'
    );
    segmentParser.saveLocalizedSegments(BOOK, 3, 'm77002', [
      { segmentId: 'm77002:para:a', content: 'önnur staðfærsla' },
      { segmentId: 'm77002:para:b', content: 'ný staðfærsla B' },
    ]);
    const result = contentVersionService.restoreVersion(BOOK, 3, 'm77002', 1, {}, 'localized');
    expect(result.segmentsRestored).toBe(2);
    // The pre-restore snapshot (v2) captured the CURRENT localized content
    const v2 = contentVersionService.getVersionContent(BOOK, 'm77002', 2, 'localized');
    expect(v2.find((s) => s.segment_id === 'm77002:para:a').content).toBe('önnur staðfærsla');
    // Empty string from v1 restored verbatim (F19: empties are recorded)
    const file = readFileSync(
      join(booksDir, BOOK, '04-localized-content/ch03/m77002-segments.is.md'),
      'utf-8'
    );
    expect(file).toContain('fyrsta staðfærsla');
  });
});
