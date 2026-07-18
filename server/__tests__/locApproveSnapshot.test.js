/**
 * approveAndApply × content snapshots (item 15; closes I12-M3, documents I12-M1).
 * Pins: (1) a localized snapshot of the PRE-approval content exists after
 * approval; (2) F3 ordering survives: when the status-UPDATE transaction
 * throws AFTER the file write, the file carries the new content, the edit row
 * stays 'pending', and a retry approve succeeds (idempotent rewrite).
 * Residual documented (I12-M1): rejecting after such a partial approval
 * leaves the written content live — rejectEdit never touches files.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'loc-snap-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const BOOK = 'synthetic-loc-snap-book';
const MODULE = 'mLSNAP1';
const SEG_A = `${MODULE}:para:a`;

let review;
let contentVersionService;
let segmentParser;
let realBooksDir;
let db;

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  segmentParser = require('../services/segmentParser');
  realBooksDir = segmentParser.BOOKS_DIR;
  const booksDir = path.join(work, 'books');
  const seg = (id, text) => `<!-- SEG:${MODULE}:para:${id} -->\n${text}\n`;
  mkdirSync(path.join(booksDir, BOOK, '02-for-mt/ch01'), { recursive: true });
  mkdirSync(path.join(booksDir, BOOK, '03-faithful-translation/ch01'), { recursive: true });
  mkdirSync(path.join(booksDir, BOOK, '04-localized-content/ch01'), { recursive: true });
  writeFileSync(
    path.join(booksDir, BOOK, '02-for-mt/ch01', `${MODULE}-segments.en.md`),
    seg('a', 'EN a')
  );
  writeFileSync(
    path.join(booksDir, BOOK, '03-faithful-translation/ch01', `${MODULE}-segments.is.md`),
    seg('a', 'trúr a')
  );
  writeFileSync(
    path.join(booksDir, BOOK, '04-localized-content/ch01', `${MODULE}-segments.is.md`),
    seg('a', 'staðfært gamalt')
  );
  segmentParser._setTestBooksDir(booksDir);

  review = require('../services/localizationReviewService');
  contentVersionService = require('../services/contentVersionService');
  const Database = require('better-sqlite3');
  db = new Database(process.env.SESSIONS_DB_PATH);
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  db.close();
  rmSync(work, { recursive: true, force: true });
});

function submitPending(content) {
  return review.submitEdit({
    book: BOOK,
    chapter: 1,
    moduleId: MODULE,
    segmentId: SEG_A,
    originalContent: 'staðfært gamalt',
    editedContent: content,
    category: null,
    editorId: 'ed1',
    editorUsername: 'editor1',
  });
}

const locFile = () =>
  readFileSync(
    path.join(work, 'books', BOOK, '04-localized-content/ch01', `${MODULE}-segments.is.md`),
    'utf-8'
  );

describe('approveAndApply snapshots + write-then-mark (I12-M3)', () => {
  it('records a localized snapshot of the pre-approval content', () => {
    const { id } = submitPending('staðfært nýtt');
    review.approveAndApply(id, 'he1', 'headeditor', null);
    expect(locFile()).toContain('staðfært nýtt');
    const versions = contentVersionService.getModuleVersions(BOOK, MODULE, 'localized');
    expect(versions.length).toBe(1);
    const v1 = contentVersionService.getVersionContent(BOOK, MODULE, 1, 'localized');
    expect(v1.find((s) => s.segment_id === SEG_A).content).toBe('staðfært gamalt');
  });

  it('write-succeeds-DB-throws: file updated, row stays pending, retry succeeds', () => {
    const { id } = submitPending('staðfært þriðja');
    db.exec(`CREATE TRIGGER force_fail BEFORE UPDATE ON localization_pending_edits
             BEGIN SELECT RAISE(ABORT, 'forced-test-failure'); END;`);
    expect(() => review.approveAndApply(id, 'he1', 'headeditor', null)).toThrow(/forced/);
    // F3 contract observable: the file HAS the new content...
    expect(locFile()).toContain('staðfært þriðja');
    // ...and the row is still pending (retryable, rejectable — I12-M1 residual:
    // rejecting NOW would leave 'staðfært þriðja' silently live in the file).
    const row = db.prepare(`SELECT status FROM localization_pending_edits WHERE id = ?`).get(id);
    expect(row.status).toBe('pending');
    db.exec(`DROP TRIGGER force_fail;`);
    const result = review.approveAndApply(id, 'he1', 'headeditor', null);
    expect(result.savedPath).toBeTruthy();
    expect(
      db.prepare(`SELECT status FROM localization_pending_edits WHERE id = ?`).get(id).status
    ).toBe('approved');
  });
});
