/**
 * Pipeline Status Routes Tests
 *
 * Tests the pipeline status + locking integration.
 * Uses in-memory better-sqlite3 DB.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const pipelineStatus = require('../services/pipelineStatusService');
const chapterLock = require('../lib/chapterLock');

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE chapter_pipeline_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_slug TEXT NOT NULL,
      chapter_num INTEGER NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started',
      completed_at TEXT,
      completed_by TEXT,
      notes TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(book_slug, chapter_num, stage)
    );

    CREATE TABLE chapter_generation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_slug TEXT NOT NULL,
      chapter_num INTEGER NOT NULL,
      action TEXT NOT NULL,
      user_id TEXT,
      username TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE chapter_locks (
      chapter_id TEXT PRIMARY KEY,
      locked_by TEXT NOT NULL,
      locked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    );
  `);
  return db;
}

describe('pipeline status + locking integration', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    pipelineStatus._setTestDb(db);
    chapterLock._setTestDb(db);
  });

  it('advance requires prior stage complete', () => {
    expect(() => {
      pipelineStatus.transitionStage('efnafraedi-2e', 1, 'mtReady', 'complete', 'anna');
    }).toThrow('extraction must be complete first');
  });

  it('advance works when prerequisites met', () => {
    pipelineStatus.transitionStage('efnafraedi-2e', 1, 'extraction', 'complete', 'anna');
    const result = pipelineStatus.transitionStage(
      'efnafraedi-2e',
      1,
      'mtReady',
      'complete',
      'anna'
    );
    expect(result).toEqual({ stage: 'mtReady', status: 'complete' });
  });

  it('lock prevents another user from locking', () => {
    const r1 = chapterLock.acquireLock('efnafraedi-2e-01', 'anna');
    expect(r1.ok).toBe(true);

    const r2 = chapterLock.acquireLock('efnafraedi-2e-01', 'jon');
    expect(r2.ok).toBe(false);
    expect(r2.lockedBy).toBe('anna');
  });

  it('getChapterStage returns correct currentStage', () => {
    pipelineStatus.transitionStage('efnafraedi-2e', 1, 'extraction', 'complete', 'anna');
    pipelineStatus.transitionStage('efnafraedi-2e', 1, 'mtReady', 'complete', 'anna');

    const result = pipelineStatus.getChapterStage('efnafraedi-2e', 1);
    expect(result.currentStage).toBe('mtOutput');
    expect(result.stages.extraction).toBe('complete');
    expect(result.stages.mtReady).toBe('complete');
    expect(result.stages.mtOutput).toBe('not_started');
  });

  it('history includes status entries', () => {
    pipelineStatus.transitionStage(
      'efnafraedi-2e',
      1,
      'extraction',
      'complete',
      'anna',
      'First extract'
    );

    const history = pipelineStatus.getStageHistory('efnafraedi-2e', 1);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].type).toBe('status');
    expect(history[0].stage).toBe('extraction');
  });
});
