/**
 * dashboardReadModel unit tests
 *
 * Verifies that every counter on the home page derives from the same
 * `segment_edits` source — and in particular that pending edits are
 * counted without joining `module_reviews`.
 *
 * Companion to:
 *   - docs/audit/2026-05-10-editorial-workflow-audit.md
 *   - docs/plans/2026-05-10-editorial-workflow-redesign-plan.md (Phase 1)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const readModel = require('../services/dashboardReadModel');
const { createSegmentEditsSchema } = require('./helpers/segmentEditsSchema.cjs');

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  // Mirror migration 008 + 009 schema (segment_edits only — read model
  // intentionally does NOT touch module_reviews).
  createSegmentEditsSchema(db);

  return db;
}

function insertEdit(db, overrides = {}) {
  const row = {
    book: 'efnafraedi-2e',
    chapter: 1,
    module_id: 'm00001',
    segment_id: 'm00001:para:fs-id001',
    original_content: 'Original',
    edited_content: 'Breytt',
    category: 'accuracy',
    editor_note: null,
    status: 'pending',
    editor_id: 'user-1',
    editor_username: 'annask',
    reviewer_id: null,
    reviewer_username: null,
    reviewer_note: null,
    created_at: null, // null → CURRENT_TIMESTAMP
    reviewed_at: null,
    applied_at: null,
    ...overrides,
  };

  const cols = [
    'book',
    'chapter',
    'module_id',
    'segment_id',
    'original_content',
    'edited_content',
    'category',
    'editor_note',
    'status',
    'editor_id',
    'editor_username',
    'reviewer_id',
    'reviewer_username',
    'reviewer_note',
    'reviewed_at',
    'applied_at',
  ];
  if (row.created_at !== null) cols.push('created_at');

  const placeholders = cols.map(() => '?').join(',');
  const values = cols.map((c) => row[c]);
  return db
    .prepare(`INSERT INTO segment_edits (${cols.join(',')}) VALUES (${placeholders})`)
    .run(...values).lastInsertRowid;
}

let db;

beforeAll(() => {
  db = createTestDb();
  readModel._setTestDb(db);
});

afterAll(() => {
  db.close();
  readModel._setTestDb(null);
});

beforeEach(() => {
  db.exec('DELETE FROM segment_edits');
});

// =====================================================================
// getAdminHeadlineCount — the home-page admin tile
// =====================================================================

describe('getAdminHeadlineCount', () => {
  it('returns 0 on empty DB', () => {
    expect(readModel.getAdminHeadlineCount()).toBe(0);
  });

  it('counts only pending edits, ignoring approved/rejected/discuss/applied', () => {
    insertEdit(db, { status: 'pending' });
    insertEdit(db, { status: 'pending', segment_id: 'm00001:para:fs-id002' });
    insertEdit(db, { status: 'approved' });
    insertEdit(db, { status: 'rejected' });
    insertEdit(db, { status: 'discuss' });
    expect(readModel.getAdminHeadlineCount()).toBe(2);
  });

  // The critical invariant — closes audit finding F2.
  it('counts pending edits without requiring a module_reviews parent row', () => {
    // No module_reviews table is created in this test schema. The count
    // should still work, proving the read model never joins it.
    insertEdit(db, { status: 'pending', editor_username: 'lonely' });
    expect(readModel.getAdminHeadlineCount()).toBe(1);
  });
});

// =====================================================================
// getGlobalPendingEdits — list view for /yfirferd
// =====================================================================

describe('getGlobalPendingEdits', () => {
  it('returns empty array when nothing pending', () => {
    insertEdit(db, { status: 'approved' });
    expect(readModel.getGlobalPendingEdits()).toEqual([]);
  });

  it('filters by book', () => {
    insertEdit(db, { book: 'efnafraedi-2e' });
    insertEdit(db, { book: 'liffraedi-2e' });
    const onlyChem = readModel.getGlobalPendingEdits({ book: 'efnafraedi-2e' });
    expect(onlyChem).toHaveLength(1);
    expect(onlyChem[0].book).toBe('efnafraedi-2e');
  });

  it('filters by chapter', () => {
    insertEdit(db, { chapter: 1 });
    insertEdit(db, { chapter: 5, segment_id: 'm00001:para:fs-id002' });
    expect(readModel.getGlobalPendingEdits({ chapter: 5 })).toHaveLength(1);
  });

  it('filters by editor', () => {
    // Two distinct editors: different editor_id AND editor_username, so the
    // rows are genuinely independent pending edits (same segment is a valid
    // real-world case — two editors both proposing a fix for the same spot).
    insertEdit(db, { editor_id: 'user-1', editor_username: 'annask' });
    insertEdit(db, { editor_id: 'user-2', editor_username: 'magnusg' });

    const onlyAnna = readModel.getGlobalPendingEdits({ editor: 'annask' });
    expect(onlyAnna).toHaveLength(1);
    expect(onlyAnna[0].editor_username).toBe('annask');

    const onlyMagnus = readModel.getGlobalPendingEdits({ editor: 'magnusg' });
    expect(onlyMagnus).toHaveLength(1);
    expect(onlyMagnus[0].editor_username).toBe('magnusg');
  });

  it('respects limit', () => {
    for (let i = 0; i < 5; i++) {
      insertEdit(db, { segment_id: `seg-${i}` });
    }
    expect(readModel.getGlobalPendingEdits({ limit: 3 })).toHaveLength(3);
  });

  it('includes hours_waiting derived from created_at', () => {
    insertEdit(db, {
      created_at: '2026-05-09 12:00:00', // ~24h before "now" depending on test clock
    });
    const [edit] = readModel.getGlobalPendingEdits();
    expect(edit.hours_waiting).toBeTypeOf('number');
    expect(edit.hours_waiting).toBeGreaterThanOrEqual(0);
  });
});

// =====================================================================
// getUserActionableEdits — what an editor needs to revisit
// =====================================================================

describe('getUserActionableEdits', () => {
  it('returns rejected and discuss edits for the user', () => {
    insertEdit(db, { editor_username: 'annask', status: 'rejected' });
    insertEdit(db, { editor_username: 'annask', status: 'discuss' });
    insertEdit(db, { editor_username: 'annask', status: 'pending' });
    insertEdit(db, { editor_username: 'annask', status: 'approved' });
    insertEdit(db, { editor_username: 'magnusg', status: 'rejected' });

    const result = readModel.getUserActionableEdits('annask');
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.status).sort()).toEqual(['discuss', 'rejected']);
  });

  it('returns empty for unknown user', () => {
    expect(readModel.getUserActionableEdits('nobody')).toEqual([]);
  });
});

// =====================================================================
// getUserHeadlineCounts — the editor's three home tiles
// =====================================================================

describe('getUserHeadlineCounts', () => {
  it('returns zeros for a user with no edits', () => {
    expect(readModel.getUserHeadlineCounts('annask')).toEqual({
      actionable: 0,
      pendingReview: 0,
      completedThisWeek: 0,
    });
  });

  it('counts actionable, pendingReview, and completedThisWeek per user', () => {
    insertEdit(db, { editor_username: 'annask', status: 'rejected' });
    insertEdit(db, { editor_username: 'annask', status: 'discuss' });
    insertEdit(db, { editor_username: 'annask', status: 'pending' });
    insertEdit(db, {
      editor_username: 'annask',
      status: 'pending',
      segment_id: 'm00001:para:fs-id002',
    });
    insertEdit(db, {
      editor_username: 'annask',
      status: 'approved',
      reviewed_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    });
    // Approved a long time ago — should not count this week
    insertEdit(db, {
      editor_username: 'annask',
      status: 'approved',
      reviewed_at: '2026-01-01 12:00:00',
    });
    // Other user — must not affect counts
    insertEdit(db, {
      editor_username: 'magnusg',
      status: 'pending',
      segment_id: 'm00001:para:fs-id003',
    });

    const counts = readModel.getUserHeadlineCounts('annask');
    expect(counts).toEqual({
      actionable: 2,
      pendingReview: 2,
      completedThisWeek: 1,
    });
  });
});

// =====================================================================
// getEditorWorkload — admin panel
// =====================================================================

describe('getEditorWorkload', () => {
  it('returns empty for empty DB', () => {
    expect(readModel.getEditorWorkload()).toEqual([]);
  });

  it('aggregates per editor over the time window', () => {
    insertEdit(db, { editor_username: 'annask', status: 'pending' });
    insertEdit(db, {
      editor_username: 'annask',
      status: 'pending',
      segment_id: 'm00001:para:fs-id002',
    });
    insertEdit(db, { editor_username: 'annask', status: 'approved' });
    insertEdit(db, { editor_username: 'magnusg', status: 'rejected' });

    const result = readModel.getEditorWorkload({ days: 7 });
    expect(result).toHaveLength(2);

    const anna = result.find((r) => r.editor === 'annask');
    expect(anna).toMatchObject({
      active: 3,
      pending: 2,
      approved: 1,
      rejected: 0,
    });

    const magnus = result.find((r) => r.editor === 'magnusg');
    expect(magnus).toMatchObject({ active: 1, rejected: 1 });
  });

  it('excludes edits older than the window', () => {
    insertEdit(db, {
      editor_username: 'annask',
      status: 'pending',
      created_at: '2025-01-01 12:00:00',
    });
    expect(readModel.getEditorWorkload({ days: 7 })).toEqual([]);
  });
});

// =====================================================================
// getReadyToApply — modules where all edits are decided
// =====================================================================

describe('getReadyToApply', () => {
  it('returns empty when nothing is approved', () => {
    insertEdit(db, { status: 'pending' });
    expect(readModel.getReadyToApply()).toEqual([]);
  });

  it('lists modules with approved-but-unapplied edits and no pending', () => {
    insertEdit(db, {
      module_id: 'm00001',
      status: 'approved',
      applied_at: null,
    });
    insertEdit(db, {
      module_id: 'm00001',
      status: 'approved',
      applied_at: null,
      segment_id: 'm00001:para:fs-id002',
    });
    const result = readModel.getReadyToApply();
    expect(result).toHaveLength(1);
    expect(result[0].moduleId).toBe('m00001');
    expect(result[0].approvedCount).toBe(2);
    expect(result[0].pendingCount).toBe(0);
  });

  it('excludes modules with any pending edits', () => {
    insertEdit(db, { module_id: 'm00002', status: 'approved', applied_at: null });
    insertEdit(db, {
      module_id: 'm00002',
      status: 'pending',
      segment_id: 'm00002:para:fs-id002',
    });
    expect(readModel.getReadyToApply()).toEqual([]);
  });

  it('excludes modules where every approved edit is already applied', () => {
    insertEdit(db, {
      module_id: 'm00003',
      status: 'approved',
      applied_at: '2026-05-09 10:00:00',
    });
    expect(readModel.getReadyToApply()).toEqual([]);
  });
});
