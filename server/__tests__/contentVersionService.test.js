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
import { join } from 'path';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const contentVersionService = require('../services/contentVersionService');
const segmentParser = require('../services/segmentParser');

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
});
