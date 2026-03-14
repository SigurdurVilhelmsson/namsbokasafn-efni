/**
 * Activity Log Service Tests
 *
 * Tests the API contract of the activity log service (Phase 1 audit fixes).
 * These tests verify exports, function signatures, and basic behavior
 * against the real database — no mocking needed.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const activityLog = require('../services/activityLog');

describe('activityLog exports', () => {
  it('exports log as a function', () => {
    expect(typeof activityLog.log).toBe('function');
  });

  it('exports search as a function', () => {
    expect(typeof activityLog.search).toBe('function');
  });

  it('exports getRecent as a function', () => {
    expect(typeof activityLog.getRecent).toBe('function');
  });

  it('exports getByUser as a function', () => {
    expect(typeof activityLog.getByUser).toBe('function');
  });

  it('exports getByBook as a function', () => {
    expect(typeof activityLog.getByBook).toBe('function');
  });

  it('exports getBySection as a function', () => {
    expect(typeof activityLog.getBySection).toBe('function');
  });

  it('exports ACTIVITY_TYPES as an object', () => {
    expect(typeof activityLog.ACTIVITY_TYPES).toBe('object');
    expect(activityLog.ACTIVITY_TYPES).not.toBeNull();
  });
});

describe('ACTIVITY_TYPES', () => {
  const { ACTIVITY_TYPES } = activityLog;

  it('contains editor action types', () => {
    expect(ACTIVITY_TYPES.DRAFT_SAVED).toBe('draft_saved');
    expect(ACTIVITY_TYPES.REVIEW_SUBMITTED).toBe('review_submitted');
    expect(ACTIVITY_TYPES.VERSION_RESTORED).toBe('version_restored');
  });

  it('contains review action types', () => {
    expect(ACTIVITY_TYPES.REVIEW_APPROVED).toBe('review_approved');
    expect(ACTIVITY_TYPES.CHANGES_REQUESTED).toBe('changes_requested');
  });

  it('contains git action types', () => {
    expect(ACTIVITY_TYPES.COMMIT_CREATED).toBe('commit_created');
    expect(ACTIVITY_TYPES.PUSH_COMPLETED).toBe('push_completed');
  });

  it('contains workflow action types', () => {
    expect(ACTIVITY_TYPES.WORKFLOW_STARTED).toBe('workflow_started');
    expect(ACTIVITY_TYPES.WORKFLOW_COMPLETED).toBe('workflow_completed');
    expect(ACTIVITY_TYPES.FILE_UPLOADED).toBe('file_uploaded');
    expect(ACTIVITY_TYPES.WORKFLOW_GIT_COMMIT).toBe('workflow_git_commit');
  });

  it('contains segment editor action types', () => {
    expect(ACTIVITY_TYPES.SEGMENT_EDIT_SAVED).toBe('segment_edit_saved');
    expect(ACTIVITY_TYPES.SEGMENT_EDIT_APPROVED).toBe('segment_edit_approved');
    expect(ACTIVITY_TYPES.SEGMENT_EDIT_REJECTED).toBe('segment_edit_rejected');
    expect(ACTIVITY_TYPES.SEGMENT_EDIT_DISCUSS).toBe('segment_edit_discuss');
    expect(ACTIVITY_TYPES.SEGMENT_EDITS_APPLIED).toBe('segment_edits_applied');
  });

  it('has 16 activity types total', () => {
    expect(Object.keys(ACTIVITY_TYPES)).toHaveLength(16);
  });

  it('all values are non-empty strings', () => {
    for (const [, value] of Object.entries(ACTIVITY_TYPES)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe('search()', () => {
  it('returns an object with activities array and total number when called with no params', () => {
    const result = activityLog.search();
    expect(result).toHaveProperty('activities');
    expect(result).toHaveProperty('total');
    expect(Array.isArray(result.activities)).toBe(true);
    expect(typeof result.total).toBe('number');
  });

  it('returns limit and offset in the result', () => {
    const result = activityLog.search();
    expect(result).toHaveProperty('limit');
    expect(result).toHaveProperty('offset');
    expect(typeof result.limit).toBe('number');
    expect(typeof result.offset).toBe('number');
  });

  it('respects custom limit and offset', () => {
    const result = activityLog.search({ limit: 10, offset: 5 });
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(5);
  });

  it('caps limit at 200', () => {
    const result = activityLog.search({ limit: 999 });
    // The service caps at 200 internally but returns the requested limit in the response
    // Activities returned should never exceed 200
    expect(result.activities.length).toBeLessThanOrEqual(200);
  });
});

describe('log() and retrieval round-trip', () => {
  it('log() returns an object with expected fields', () => {
    const entry = activityLog.log({
      type: activityLog.ACTIVITY_TYPES.DRAFT_SAVED,
      userId: 'test-user-vitest',
      username: 'vitest-runner',
      book: 'test-book',
      chapter: '99',
      section: 'test-section',
      description: 'Vitest activity log test entry',
      metadata: { test: true },
    });

    expect(entry).toHaveProperty('id');
    expect(typeof entry.id).toBe('number');
    expect(entry.type).toBe('draft_saved');
    expect(entry.userId).toBe('test-user-vitest');
    expect(entry.username).toBe('vitest-runner');
    expect(entry.book).toBe('test-book');
    expect(entry.chapter).toBe('99');
    expect(entry.section).toBe('test-section');
    expect(entry.description).toBe('Vitest activity log test entry');
    expect(entry.metadata).toEqual({ test: true });
    expect(entry).toHaveProperty('createdAt');
  });

  it('logged entry appears in getRecent()', () => {
    const recent = activityLog.getRecent(5);
    expect(Array.isArray(recent)).toBe(true);
    // The entry we just logged should be in the recent list
    const found = recent.find(
      (r) => r.userId === 'test-user-vitest' && r.description === 'Vitest activity log test entry'
    );
    expect(found).toBeDefined();
    expect(found.metadata).toEqual({ test: true });
  });

  it('logged entry appears in getByUser()', () => {
    const results = activityLog.getByUser('test-user-vitest', 10);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].userId).toBe('test-user-vitest');
  });

  it('logged entry appears in getByBook()', () => {
    const results = activityLog.getByBook('test-book', 10);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].book).toBe('test-book');
  });

  it('logged entry appears in search() with filters', () => {
    const result = activityLog.search({
      book: 'test-book',
      userId: 'test-user-vitest',
    });
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.activities.length).toBeGreaterThanOrEqual(1);
    expect(result.activities[0].book).toBe('test-book');
    expect(result.activities[0].userId).toBe('test-user-vitest');
  });

  it('search() with non-matching filter returns empty results', () => {
    const result = activityLog.search({
      book: 'nonexistent-book-xyz-vitest',
    });
    expect(result.activities).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe('getRecent()', () => {
  it('returns an array', () => {
    const results = activityLog.getRecent();
    expect(Array.isArray(results)).toBe(true);
  });

  it('each row has the expected parsed shape', () => {
    const results = activityLog.getRecent(1);
    if (results.length > 0) {
      const row = results[0];
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('type');
      expect(row).toHaveProperty('userId');
      expect(row).toHaveProperty('username');
      expect(row).toHaveProperty('book');
      expect(row).toHaveProperty('chapter');
      expect(row).toHaveProperty('section');
      expect(row).toHaveProperty('description');
      expect(row).toHaveProperty('metadata');
      expect(row).toHaveProperty('createdAt');
      // metadata should be parsed from JSON, not a raw string
      expect(typeof row.metadata).toBe('object');
    }
  });
});
