/**
 * [USER] ruling 2026-11-15, option A: linguistic review is reported, not
 * required. It no longer gates injection.
 *
 * Publishing a chapter runs inject, then render, and then records three stages:
 * `injection`, `rendering` and `publication.<track>`. With `linguisticReview` in
 * the sequential chain, an mt-preview publish of an unreviewed chapter was
 * refused all three: injection for want of the review, rendering for want of
 * injection, publication for want of rendering. The HTML was written and the
 * database recorded nothing. The mt-preview track is unreviewed machine
 * translation by definition, and its inject step reads `02-mt-output/`.
 *
 * These cases make the same `transitionStage` calls the publish path makes, in
 * the same order, from an EMPTY table. They do not run the inject and render
 * tools themselves.
 *
 * ⚠️ The three "records" cases are red for ONE cause before the change: the
 * first call, `injection`, throws "linguisticReview must be complete first".
 *
 * The control cases check that the gates between the stages the publish path
 * performs survive: rendering still needs injection, and a publication track
 * still needs rendering. The first control passes before the change too.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(join(tmpdir(), 'review-not-gating-'));
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
    pipelineStatusService.transitionStage(BOOK, CHAPTER, stage, 'complete', 'system', null);
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

describe('an mt-preview publish with no completed review is recorded', () => {
  it('lists linguisticReview as non-sequential', () => {
    expect(NON_SEQUENTIAL_STAGES).toContain('linguisticReview');
  });

  it('records injection', () => {
    complete('injection');
    expect(statusOf('injection')).toBe('complete');
  });

  it('records rendering', () => {
    complete('injection', 'rendering');
    expect(statusOf('rendering')).toBe('complete');
  });

  it('records publication.mtPreview', () => {
    complete('injection', 'rendering', 'publication.mtPreview');
    expect(statusOf('publication.mtPreview')).toBe('complete');
  });

  it('leaves linguisticReview unrecorded', () => {
    complete('injection', 'rendering', 'publication.mtPreview');
    expect(statusOf('linguisticReview')).toBe(null);
  });

  it('still reports linguisticReview as a stage', () => {
    const { stages } = pipelineStatusService.getChapterStage(BOOK, CHAPTER);
    expect(stages.linguisticReview).toBe('not_started');
  });
});

describe('control: the stages the publish path performs still gate each other', () => {
  it('refuses rendering before injection', () => {
    expect(() => complete('rendering')).toThrow(/injection must be complete first/);
  });

  it('refuses a publication track before rendering', () => {
    expect(() => complete('injection', 'publication.mtPreview')).toThrow(
      /rendering must be complete first/
    );
  });
});
