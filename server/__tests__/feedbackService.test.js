/**
 * feedbackService unit tests
 *
 * Uses in-memory SQLite via _setTestDb to avoid touching the real database.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const feedbackService = require('../services/feedbackService');
const { FEEDBACK_TYPES, FEEDBACK_STATUSES, PRIORITIES } = feedbackService;

let db;

beforeAll(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  feedbackService._setTestDb(db);
});

afterAll(() => {
  feedbackService._setTestDb(null);
  db.close();
});

beforeEach(() => {
  db.exec('DELETE FROM feedback_responses');
  db.exec('DELETE FROM feedback');
});

/** Helper to submit a valid feedback item and return it */
function seedFeedback(overrides = {}) {
  const defaults = {
    type: FEEDBACK_TYPES.TRANSLATION_ERROR,
    book: 'efnafraedi-2e',
    chapter: '03',
    section: '3-1',
    message: 'This translation has an error in the second paragraph.',
    userEmail: 'teacher@school.is',
    userName: 'Test Teacher',
  };
  return feedbackService.submitFeedback({ ...defaults, ...overrides });
}

// ────────────────────────────────────────────────────────────────────
// submitFeedback
// ────────────────────────────────────────────────────────────────────

describe('submitFeedback', () => {
  it('creates feedback with open status', () => {
    const fb = seedFeedback();
    expect(fb.id).toBeDefined();
    expect(fb.status).toBe(FEEDBACK_STATUSES.OPEN);
    expect(fb.type).toBe(FEEDBACK_TYPES.TRANSLATION_ERROR);
  });

  it('throws on invalid type', () => {
    expect(() => seedFeedback({ type: 'invalid_type' })).toThrow('Invalid feedback type');
  });

  it('throws when message is less than 10 characters', () => {
    expect(() => seedFeedback({ message: 'short' })).toThrow(
      'Message must be at least 10 characters'
    );
  });
});

// ────────────────────────────────────────────────────────────────────
// getFeedback / searchFeedback
// ────────────────────────────────────────────────────────────────────

describe('getFeedback', () => {
  it('returns feedback by ID with responses array', () => {
    const fb = seedFeedback();
    const result = feedbackService.getFeedback(fb.id);
    expect(result).not.toBeNull();
    expect(result.id).toBe(fb.id);
    expect(result.responses).toEqual([]);
  });

  it('returns null for nonexistent ID', () => {
    const result = feedbackService.getFeedback(99999);
    expect(result).toBeNull();
  });
});

describe('searchFeedback', () => {
  it('filters by status', () => {
    seedFeedback();
    const fb2 = seedFeedback({ message: 'Another feedback message here for testing.' });
    feedbackService.updateStatus(fb2.id, FEEDBACK_STATUSES.IN_PROGRESS);

    const result = feedbackService.searchFeedback({ status: FEEDBACK_STATUSES.OPEN });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].status).toBe(FEEDBACK_STATUSES.OPEN);
  });

  it('filters by type', () => {
    seedFeedback({ type: FEEDBACK_TYPES.TRANSLATION_ERROR });
    seedFeedback({
      type: FEEDBACK_TYPES.IMPROVEMENT,
      message: 'A suggestion for improvement in this section.',
    });

    const result = feedbackService.searchFeedback({ type: FEEDBACK_TYPES.IMPROVEMENT });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].type).toBe(FEEDBACK_TYPES.IMPROVEMENT);
  });
});

// ────────────────────────────────────────────────────────────────────
// updateStatus / resolveFeedback
// ────────────────────────────────────────────────────────────────────

describe('updateStatus', () => {
  it('changes status', () => {
    const fb = seedFeedback();
    const updated = feedbackService.updateStatus(fb.id, FEEDBACK_STATUSES.IN_PROGRESS);
    expect(updated.status).toBe(FEEDBACK_STATUSES.IN_PROGRESS);
  });

  it('throws on invalid status', () => {
    const fb = seedFeedback();
    expect(() => feedbackService.updateStatus(fb.id, 'bogus')).toThrow('Invalid status');
  });
});

describe('resolveFeedback', () => {
  it('sets resolved_by and resolved_at', () => {
    const fb = seedFeedback();
    const resolved = feedbackService.resolveFeedback(fb.id, 'user-42', 'Admin User', 'Fixed it');
    expect(resolved.status).toBe(FEEDBACK_STATUSES.RESOLVED);
    expect(resolved.resolvedBy).toBe('user-42');
    expect(resolved.resolvedByName).toBe('Admin User');
    expect(resolved.resolutionNotes).toBe('Fixed it');
    expect(resolved.resolvedAt).toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────────────
// setPriority / assignFeedback
// ────────────────────────────────────────────────────────────────────

describe('setPriority', () => {
  it('sets priority', () => {
    const fb = seedFeedback();
    const updated = feedbackService.setPriority(fb.id, PRIORITIES.HIGH);
    expect(updated.priority).toBe(PRIORITIES.HIGH);
  });
});

describe('assignFeedback', () => {
  it('sets assigned_to', () => {
    const fb = seedFeedback();
    const updated = feedbackService.assignFeedback(fb.id, 'editor-7');
    expect(updated.assignedTo).toBe('editor-7');
  });
});

// ────────────────────────────────────────────────────────────────────
// addResponse / getResponses
// ────────────────────────────────────────────────────────────────────

describe('addResponse', () => {
  it('creates response linked to feedback', () => {
    const fb = seedFeedback();
    const resp = feedbackService.addResponse(
      fb.id,
      'resp-1',
      'Responder',
      'We are looking into it'
    );
    expect(resp.id).toBeDefined();
    expect(resp.feedbackId).toBe(fb.id);
    expect(resp.message).toBe('We are looking into it');
  });

  it('with isInternal flag', () => {
    const fb = seedFeedback();
    const resp = feedbackService.addResponse(fb.id, 'resp-1', 'Admin', 'Internal note only', true);
    expect(resp.isInternal).toBe(true);
  });
});

describe('getResponses', () => {
  it('returns responses in order', () => {
    const fb = seedFeedback();
    feedbackService.addResponse(fb.id, 'r1', 'First', 'First response message');
    feedbackService.addResponse(fb.id, 'r2', 'Second', 'Second response message');

    const responses = feedbackService.getResponses(fb.id);
    expect(responses).toHaveLength(2);
    expect(responses[0].responderName).toBe('First');
    expect(responses[1].responderName).toBe('Second');
  });
});
