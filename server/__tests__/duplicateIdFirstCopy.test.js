/**
 * G1.12 (spec §5.2): when an id occurs more than once in the Icelandic file, the editor loader
 * pairs the FIRST copy — the copy inject, the AI harness and the AI change chains already use.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);
process.env.SESSIONS_DB_PATH = join(tmpdir(), `dup-first-${process.pid}.db`);

const Database = require('better-sqlite3');
const service = require('../services/segmentEditorService');
const segmentParser = require('../services/segmentParser');
const servedVersions = require('../services/servedVersions');
const tmService = require('../services/tmService');
const concordanceService = require('../services/concordanceService');
const pipelineStatusService = require('../services/pipelineStatusService');
const { createSegmentEditsSchema } = require('./helpers/segmentEditsSchema.cjs');
const migration042 = require('../migrations/042-content-versions-track');
const migration043 = require('../migrations/043-segment-acceptances');
const migration053 = require('../migrations/053-served-text-versions');

const BOOK = 'dupfirstbook';
const MODULE = 'm00001';
const ID1 = 'm00001:para:fs-id001';
const originalBooksDir = segmentParser.BOOKS_DIR;

const EN = [
  '<!-- SEG:m00001:para:fs-id001 -->',
  'Alpha [[MATH:1]].',
  '',
  '<!-- SEG:m00001:para:fs-id002 -->',
  'Beta.',
].join('\n');
const IS = [
  '<!-- SEG:m00001:para:fs-id001 -->',
  'Alfa [[MATH:1]].',
  '',
  '<!-- SEG:m00001:para:fs-id002 -->',
  'Beta-is.',
  '',
  '<!-- SEG:m00001:para:fs-id001 -->',
  'Alfa [[MATH:2]].',
].join('\n');

let db;
let tmpDir;
let booksDir;
let enPath;

beforeAll(() => {
  require('../services/migrationRunner').runAllMigrations();
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  createSegmentEditsSchema(db);
  db.exec(`
    CREATE TABLE content_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book TEXT NOT NULL, chapter INTEGER NOT NULL,
      module_id TEXT NOT NULL, segment_id TEXT NOT NULL,
      content TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
      applied_by TEXT, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(book, module_id, segment_id, version)
    );
  `);
  migration042.up(db);
  migration043.up(db);
  migration053.up(db);
  service._setTestDb(db);

  tmpDir = mkdtempSync(join(tmpdir(), 'dup-first-'));
  booksDir = join(tmpDir, 'books');
  const en = join(booksDir, BOOK, '02-for-mt', 'ch01');
  const mt = join(booksDir, BOOK, '02-mt-output', 'ch01');
  mkdirSync(en, { recursive: true });
  mkdirSync(mt, { recursive: true });
  enPath = join(en, `${MODULE}-segments.en.md`);
  writeFileSync(join(mt, `${MODULE}-segments.is.md`), IS, 'utf-8');
  service._setTestBooksDir(booksDir);
  segmentParser._setTestBooksDir(booksDir);
});

afterAll(() => {
  db.close();
  service._setTestDb(null);
  service._setTestBooksDir(originalBooksDir);
  segmentParser._setTestBooksDir(originalBooksDir);
  rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  writeFileSync(enPath, EN, 'utf-8');
  db.exec('DELETE FROM segment_edits');
  db.exec('DELETE FROM content_versions');
  rmSync(join(booksDir, BOOK, '03-faithful-translation'), { recursive: true, force: true });
  vi.restoreAllMocks();
});

const load = () => segmentParser.loadModuleForEditing(BOOK, 1, MODULE);

describe('loader pairs the first Icelandic copy (G1.12)', () => {
  it('serves the first Icelandic copy when English has one occurrence', () => {
    const rows = load().segments.filter((s) => s.segmentId === ID1);
    expect(rows).toHaveLength(1);
    expect(rows[0].is).toBe('Alfa [[MATH:1]].');
  });

  it('the served row is minted, not treated as duplicated', () => {
    const { rows, duplicatedIds } = servedVersions.versionRowsFor(load(), {
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
    });
    expect(duplicatedIds).toEqual([]);
    expect(rows.find((r) => r.segmentId === ID1).isText).toBe('Alfa [[MATH:1]].');
  });

  it('the R4 backstop still fires when English itself is duplicated', () => {
    writeFileSync(enPath, `${EN}\n\n<!-- SEG:m00001:para:fs-id001 -->\nAlpha again.`, 'utf-8');
    const { duplicatedIds } = servedVersions.versionRowsFor(load(), {
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
    });
    expect(duplicatedIds).toEqual([ID1]);
  });

  it('apply writes one entry per id, from the first copy', () => {
    vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});
    vi.spyOn(tmService, 'scheduleTmRegen').mockImplementation(() => {});
    vi.spyOn(concordanceService, 'indexModule').mockImplementation(() => {});
    const { id } = service.saveSegmentEdit({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: 'm00001:para:fs-id002',
      originalContent: 'original',
      editedContent: 'Beta breytt.',
      editorId: 'editor-1',
      editorUsername: 'editor1',
    });
    service.approveEdit(id, 'reviewer-1', 'reviewer1');
    const result = service.applyApprovedEdits(BOOK, 1, MODULE);
    const segs = segmentParser
      .parseSegments(readFileSync(result.savedPath, 'utf-8'))
      .filter((s) => s.segmentId === ID1);
    expect(segs).toHaveLength(1);
    expect(segs[0].content).toBe('Alfa [[MATH:1]].');
  });
});
