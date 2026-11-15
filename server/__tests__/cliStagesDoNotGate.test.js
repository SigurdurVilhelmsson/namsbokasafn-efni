/**
 * Register §C224, option ③ ([USER] ruling 2026-11-15): the stages only the CLI
 * performs do not gate the stages the server records.
 *
 * `extraction`, `mtReady` and `mtOutput` are done by the CLI tools, and the CLI
 * reports nothing to the server. The server jobs that used to complete them
 * (`runExtract`, `runProtect`, `runUnprotect`) are started by no route. With
 * those three in the sequential chain, a chapter that was extracted and
 * translated from the command line has no `mtOutput` row, so `transitionStage`
 * refuses `linguisticReview`, and with it everything after.
 *
 * Each case starts from an EMPTY table, which is what the server sees for such
 * a chapter, and completes stages only through `transitionStage`.
 *
 * ⚠️ The four "can complete" cases are red for ONE cause before the change:
 * the first call, `linguisticReview`, throws "mtOutput must be complete first".
 * `injection` checks only its nearest earlier sequential stage, so it is
 * blocked through `linguisticReview`, not directly.
 *
 * The last three cases are the control: the gating BETWEEN the server-side
 * stages must survive the change. Only the first of them passes before it; the
 * other two reach their own refusal through `linguisticReview`, so before the
 * change they stop at the same "mtOutput" error as the cases above.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(join(tmpdir(), 'cli-stages-'));
process.env.SESSIONS_DB_PATH = join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const Database = require('better-sqlite3');
const pipelineStatusService = require('../services/pipelineStatusService');
const { NON_SEQUENTIAL_STAGES } = require('../constants');

const BOOK = 'efnafraedi-2e';
const CHAPTER = 1;

let db;

function complete(...stages) {
  for (const stage of stages) {
    pipelineStatusService.transitionStage(BOOK, CHAPTER, stage, 'complete', 'user1', null);
  }
}

function statusOf(stage) {
  const row = db
    .prepare(
      'SELECT status FROM chapter_pipeline_status WHERE book_slug = ? AND chapter_num = ? AND stage = ?'
    )
    .get(BOOK, CHAPTER, stage);
  return row ? row.status : null;
}

beforeEach(() => {
  if (db) db.close();
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE chapter_pipeline_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_slug TEXT NOT NULL,
      chapter_num INTEGER NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started',
      completed_at DATETIME,
      completed_by TEXT,
      notes TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(book_slug, chapter_num, stage)
    );
  `);
  pipelineStatusService._setTestDb(db);
});

afterAll(() => {
  pipelineStatusService._setTestDb(null);
  if (db) db.close();
  rmSync(work, { recursive: true, force: true });
});

describe('the CLI-side stages do not gate the server-side stages (§C224 ③)', () => {
  it('lists extraction, mtReady and mtOutput as non-sequential', () => {
    expect(NON_SEQUENTIAL_STAGES).toEqual(
      expect.arrayContaining(['extraction', 'mtReady', 'mtOutput'])
    );
  });

  it('completes linguisticReview with no mtOutput row', () => {
    complete('linguisticReview');
    expect(statusOf('linguisticReview')).toBe('complete');
  });

  it('completes injection with no mtOutput row', () => {
    complete('linguisticReview', 'injection');
    expect(statusOf('injection')).toBe('complete');
  });

  it('completes rendering with no mtOutput row', () => {
    complete('linguisticReview', 'injection', 'rendering');
    expect(statusOf('rendering')).toBe('complete');
  });

  it('completes a publication track with no mtOutput row', () => {
    complete('linguisticReview', 'injection', 'rendering', 'publication.mtPreview');
    expect(statusOf('publication.mtPreview')).toBe('complete');
  });

  it('never wrote a row for a CLI-side stage along the way', () => {
    complete('linguisticReview', 'injection', 'rendering', 'publication.mtPreview');
    expect(['extraction', 'mtReady', 'mtOutput'].map(statusOf)).toEqual([null, null, null]);
  });
});

describe('control: the server-side stages still gate each other', () => {
  it('refuses injection before linguisticReview', () => {
    expect(() => complete('injection')).toThrow(/linguisticReview must be complete first/);
  });

  it('refuses rendering before injection', () => {
    expect(() => complete('linguisticReview', 'rendering')).toThrow(
      /injection must be complete first/
    );
  });

  it('refuses a publication track before rendering', () => {
    expect(() => complete('linguisticReview', 'injection', 'publication.mtPreview')).toThrow(
      /rendering must be complete first/
    );
  });
});
