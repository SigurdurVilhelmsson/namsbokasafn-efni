/**
 * Segment-editor optimistic concurrency (Unit 4.3, F13).
 *
 * saveSegmentEdit takes a baseEditId — the highest edit id the client saw on a
 * segment at load. If a *different* editor has moved past it, the save is
 * rejected with a SEGMENT_CONFLICT (the route maps this to 409), parity with
 * the localization editor. A save that is up to date, or one that omits the
 * token, proceeds.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const service = require('../services/segmentEditorService');
const { createSegmentEditsSchema } = require('./helpers/segmentEditsSchema.cjs');
const migration043 = require('../migrations/043-segment-acceptances');

const BOOK = 'testbook';
const MODULE = 'm00001';
const SEG = `${MODULE}:para:fs-id001`;

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  createSegmentEditsSchema(db);
  // item 20b: saveSegmentEdit now calls acceptanceService.supersedeForEdit on
  // its own connection inside both save transactions — the test DB needs the
  // segment_acceptances table or that call throws "no such table".
  migration043.up(db);
  return db;
}

function save(editorId, editorUsername, editedContent, baseEditId) {
  return service.saveSegmentEdit({
    book: BOOK,
    chapter: 1,
    moduleId: MODULE,
    segmentId: SEG,
    originalContent: 'orig',
    editedContent,
    editorId,
    editorUsername,
    baseEditId,
  });
}

describe('saveSegmentEdit optimistic concurrency', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    service._setTestDb(db);
  });

  afterEach(() => {
    db.close();
    service._setTestDb(null);
  });

  it('rejects a save when another editor moved past the client baseEditId', () => {
    // Editor A creates an edit (client B loaded before this, so baseEditId 0)
    const a = save('A', 'editorA', 'A edit', 0);
    expect(a.id).toBeGreaterThan(0);

    // Editor B saves the same segment with a stale baseEditId (0) → conflict
    try {
      save('B', 'editorB', 'B edit', 0);
      throw new Error('expected a conflict');
    } catch (err) {
      expect(err.code).toBe('SEGMENT_CONFLICT');
    }
  });

  it('allows a save when the client has seen the other edit (up-to-date token)', () => {
    const a = save('A', 'editorA', 'A edit', 0);
    // Editor B loaded after A's edit, so baseEditId = a.id → no conflict
    const b = save('B', 'editorB', 'B edit', a.id);
    expect(b.id).toBeGreaterThan(a.id);
  });

  it('never conflicts an editor with their own newer edits', () => {
    const a1 = save('A', 'editorA', 'A v1', 0);
    // Same editor updates their pending edit with a stale token — no self-conflict
    const a2 = save('A', 'editorA', 'A v2', 0);
    expect(a2.id).toBe(a1.id);
    expect(a2.updated).toBe(true);
  });

  it('skips the check when no token is supplied (backward compatible)', () => {
    save('A', 'editorA', 'A edit', 0);
    // baseEditId undefined → legacy behaviour, B can save without a token
    const b = save('B', 'editorB', 'B edit', undefined);
    expect(b.id).toBeGreaterThan(0);
  });
});
