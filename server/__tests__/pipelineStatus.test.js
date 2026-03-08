/**
 * Pipeline Status Service Tests
 *
 * Tests getChapterStage, transitionStage, revertStage, getStageHistory.
 * Uses in-memory better-sqlite3 DB for isolation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

let service;

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
      completed_at DATETIME,
      completed_by TEXT,
      notes TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(book_slug, chapter_num, stage)
    );

    CREATE INDEX idx_pipeline_status_book_chapter
      ON chapter_pipeline_status(book_slug, chapter_num);

    CREATE INDEX idx_pipeline_status_stage
      ON chapter_pipeline_status(stage);

    CREATE TABLE chapter_generation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_slug TEXT NOT NULL,
      chapter_num INTEGER NOT NULL,
      action TEXT NOT NULL,
      user_id TEXT,
      username TEXT,
      details TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX idx_generation_log_book_chapter
      ON chapter_generation_log(book_slug, chapter_num);
    CREATE INDEX idx_generation_log_created
      ON chapter_generation_log(created_at);
  `);

  return db;
}

beforeEach(async () => {
  // Dynamic import since the service is CommonJS
  service =
    (await import('../services/pipelineStatusService.js')).default ||
    (await import('../services/pipelineStatusService.js'));
  // If it's a CJS module wrapped, get the actual exports
  if (service._setTestDb) {
    // Already correct
  } else if (service.default && service.default._setTestDb) {
    service = service.default;
  }
  const db = createTestDb();
  service._setTestDb(db);
});

describe('getChapterStage', () => {
  it('returns not_started for all stages when no rows exist; currentStage should be extraction', () => {
    const result = service.getChapterStage('efnafraedi-2e', 1);
    expect(result.currentStage).toBe('extraction');
    expect(result.stages.extraction).toBe('not_started');
    expect(result.stages.mtReady).toBe('not_started');
    expect(result.stages.mtOutput).toBe('not_started');
    expect(result.stages.linguisticReview).toBe('not_started');
    expect(result.stages.tmCreated).toBe('not_started');
    expect(result.stages.injection).toBe('not_started');
    expect(result.stages.rendering).toBe('not_started');
    expect(result.publication.mtPreview).toBe('not_started');
    expect(result.publication.faithful).toBe('not_started');
    expect(result.publication.localized).toBe('not_started');
  });

  it('returns correct currentStage when some stages are complete', () => {
    service.transitionStage('efnafraedi-2e', 1, 'extraction', 'complete', 'user1', 'done');
    service.transitionStage('efnafraedi-2e', 1, 'mtReady', 'complete', 'user1', 'done');
    service.transitionStage('efnafraedi-2e', 1, 'mtOutput', 'in_progress', 'user1', 'started');

    const result = service.getChapterStage('efnafraedi-2e', 1);
    expect(result.currentStage).toBe('mtOutput');
    expect(result.stages.extraction).toBe('complete');
    expect(result.stages.mtReady).toBe('complete');
    expect(result.stages.mtOutput).toBe('in_progress');
    expect(result.stages.linguisticReview).toBe('not_started');
  });

  it('reports publication sub-tracks independently', () => {
    // Complete all base stages first
    const baseStages = [
      'extraction',
      'mtReady',
      'mtOutput',
      'linguisticReview',
      'tmCreated',
      'injection',
      'rendering',
    ];
    for (const stage of baseStages) {
      service.transitionStage('efnafraedi-2e', 1, stage, 'complete', 'user1', 'done');
    }
    service.transitionStage(
      'efnafraedi-2e',
      1,
      'publication.mtPreview',
      'complete',
      'user1',
      'published'
    );

    const result = service.getChapterStage('efnafraedi-2e', 1);
    expect(result.publication.mtPreview).toBe('complete');
    expect(result.publication.faithful).toBe('not_started');
    expect(result.publication.localized).toBe('not_started');
  });

  it('handles appendices (chapter_num = -1)', () => {
    const result = service.getChapterStage('efnafraedi-2e', -1);
    expect(result.currentStage).toBe('extraction');
    expect(result.stages.extraction).toBe('not_started');
  });
});

describe('transitionStage', () => {
  it('allows setting extraction to complete on a fresh chapter', () => {
    const result = service.transitionStage(
      'efnafraedi-2e',
      1,
      'extraction',
      'complete',
      'user1',
      'extracted'
    );
    expect(result.stage).toBe('extraction');
    expect(result.status).toBe('complete');
  });

  it('allows setting a stage to in_progress', () => {
    const result = service.transitionStage(
      'efnafraedi-2e',
      1,
      'extraction',
      'in_progress',
      'user1',
      'starting'
    );
    expect(result.stage).toBe('extraction');
    expect(result.status).toBe('in_progress');
  });

  it('rejects completing a stage when prior stage is not complete', () => {
    expect(() => {
      service.transitionStage('efnafraedi-2e', 1, 'mtReady', 'complete', 'user1', 'done');
    }).toThrow(/extraction/);
  });

  it('allows setting a stage to in_progress even if prior stage is not complete', () => {
    const result = service.transitionStage(
      'efnafraedi-2e',
      1,
      'mtReady',
      'in_progress',
      'user1',
      'starting'
    );
    expect(result.stage).toBe('mtReady');
    expect(result.status).toBe('in_progress');
  });

  it('rejects invalid stage names', () => {
    expect(() => {
      service.transitionStage('efnafraedi-2e', 1, 'bogusStage', 'complete', 'user1', 'done');
    }).toThrow(/invalid stage/i);
  });

  it('rejects invalid status values', () => {
    expect(() => {
      service.transitionStage('efnafraedi-2e', 1, 'extraction', 'done', 'user1', 'done');
    }).toThrow(/invalid status/i);
  });

  it('allows publication sub-track transitions when rendering is complete', () => {
    const baseStages = [
      'extraction',
      'mtReady',
      'mtOutput',
      'linguisticReview',
      'tmCreated',
      'injection',
      'rendering',
    ];
    for (const stage of baseStages) {
      service.transitionStage('efnafraedi-2e', 1, stage, 'complete', 'user1', 'done');
    }
    const result = service.transitionStage(
      'efnafraedi-2e',
      1,
      'publication.faithful',
      'complete',
      'user1',
      'published'
    );
    expect(result.stage).toBe('publication.faithful');
    expect(result.status).toBe('complete');
  });

  it('rejects publication sub-track completion if rendering is not complete', () => {
    service.transitionStage('efnafraedi-2e', 1, 'extraction', 'complete', 'user1', 'done');
    expect(() => {
      service.transitionStage(
        'efnafraedi-2e',
        1,
        'publication.mtPreview',
        'complete',
        'user1',
        'done'
      );
    }).toThrow(/rendering/);
  });

  it('updates existing row on repeated transition (upsert, not duplicate)', () => {
    service.transitionStage('efnafraedi-2e', 1, 'extraction', 'in_progress', 'user1', 'starting');
    service.transitionStage('efnafraedi-2e', 1, 'extraction', 'complete', 'user1', 'done');

    const result = service.getChapterStage('efnafraedi-2e', 1);
    expect(result.stages.extraction).toBe('complete');
  });
});

describe('revertStage', () => {
  it('reverts the latest complete stage to not_started', () => {
    service.transitionStage('efnafraedi-2e', 1, 'extraction', 'complete', 'user1', 'done');
    service.transitionStage('efnafraedi-2e', 1, 'mtReady', 'complete', 'user1', 'done');

    const result = service.revertStage('efnafraedi-2e', 1, 'user2', 'Found issues');
    expect(result.revertedStage).toBe('mtReady');
    expect(result.newStatus).toBe('not_started');

    const state = service.getChapterStage('efnafraedi-2e', 1);
    expect(state.stages.mtReady).toBe('not_started');
    expect(state.stages.extraction).toBe('complete');
  });

  it('requires a non-empty note', () => {
    service.transitionStage('efnafraedi-2e', 1, 'extraction', 'complete', 'user1', 'done');
    expect(() => {
      service.revertStage('efnafraedi-2e', 1, 'user1', '');
    }).toThrow(/note.*required/i);
    expect(() => {
      service.revertStage('efnafraedi-2e', 1, 'user1');
    }).toThrow(/note.*required/i);
  });

  it('throws when no stages are complete', () => {
    expect(() => {
      service.revertStage('efnafraedi-2e', 1, 'user1', 'revert reason');
    }).toThrow(/no completed stage/i);
  });
});

describe('getStageHistory', () => {
  it('returns pipeline status rows merged with generation log entries', () => {
    service.transitionStage('efnafraedi-2e', 1, 'extraction', 'complete', 'user1', 'done');

    // Insert a generation log entry directly
    const db = service._getTestDb();
    db.prepare(
      `
      INSERT INTO chapter_generation_log (book_slug, chapter_num, action, user_id, username, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run('efnafraedi-2e', 1, 'inject', 'user1', 'User One', '{"track":"faithful"}');

    const history = service.getStageHistory('efnafraedi-2e', 1);
    expect(history.length).toBeGreaterThanOrEqual(2);

    const statusEntries = history.filter((e) => e.type === 'status');
    const logEntries = history.filter((e) => e.type === 'log');
    expect(statusEntries.length).toBeGreaterThanOrEqual(1);
    expect(logEntries.length).toBe(1);
    expect(logEntries[0].action).toBe('inject');
    expect(logEntries[0].details).toEqual({ track: 'faithful' });
  });

  it('each entry has a type field: status or log', () => {
    service.transitionStage('efnafraedi-2e', 1, 'extraction', 'in_progress', 'user1', 'starting');
    const history = service.getStageHistory('efnafraedi-2e', 1);
    for (const entry of history) {
      expect(['status', 'log']).toContain(entry.type);
    }
  });

  it('returns empty array when no data exists', () => {
    const history = service.getStageHistory('efnafraedi-2e', 99);
    expect(history).toEqual([]);
  });
});
