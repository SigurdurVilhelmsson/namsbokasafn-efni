/**
 * The review acts, delete, revoke, submit and comment return what they changed (G1.2; spec §5.9;
 * plan Task 16, decisions 44, 45). The keys are additive: the row after the write is what each
 * function returned before, and Task 23 turns the new keys into research events.
 *
 * On a database built by every real migration (freshMigratedDb); the books root is a temp
 * directory, so nothing under books/ is touched.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const built = freshMigratedDb();
// Before any service loads: a service that resolves the database path at load finds the temp file.
process.env.SESSIONS_DB_PATH = built.path;

const service = require('../services/segmentEditorService');
const acceptanceService = require('../services/acceptanceService');
const segmentParser = require('../services/segmentParser');

const db = built.db;
let root;
let realBooksDir;

beforeAll(() => {
  service._setTestDb(db);
  acceptanceService._setTestDb(db);
  realBooksDir = segmentParser.BOOKS_DIR;
  root = mkdtempSync(path.join(tmpdir(), 'review-before-images-'));
  service._setTestBooksDir(root);
  segmentParser._setTestBooksDir(root);
});

afterAll(() => {
  service._setTestBooksDir(realBooksDir);
  segmentParser._setTestBooksDir(realBooksDir);
  service._setTestDb(null);
  acceptanceService._setTestDb(null);
  db.close();
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec(
    'DELETE FROM segment_discussions; DELETE FROM segment_acceptances; DELETE FROM segment_edits; DELETE FROM module_reviews;'
  );
});

const rowOf = (id) => db.prepare('SELECT * FROM segment_edits WHERE id = ?').get(id);
const accRowOf = (id) => db.prepare('SELECT * FROM segment_acceptances WHERE id = ?').get(id);

let n = 0;
function rawEdit(status, over = {}) {
  n += 1;
  const o = {
    moduleId: 'm1',
    segmentId: `m1:para:s${n}`,
    editorId: 'p-a',
    reviewId: null,
    ...over,
  };
  return Number(
    db
      .prepare(
        `INSERT INTO segment_edits
           (book, chapter, module_id, segment_id, original_content, edited_content,
            editor_id, editor_username, status, review_id)
         VALUES ('tb', 1, ?, ?, 'BASE', ?, ?, ?, ?, ?)`
      )
      .run(o.moduleId, o.segmentId, `E${n}`, o.editorId, o.editorId, status, o.reviewId)
      .lastInsertRowid
  );
}

function rawAcceptance(status) {
  n += 1;
  return Number(
    db
      .prepare(
        `INSERT INTO segment_acceptances
           (book, chapter, module_id, segment_id, accepted_content, accepted_by,
            accepted_by_username, status)
         VALUES ('tb', 1, 'm1', ?, 'ACC', 'p-z', 'z', ?)`
      )
      .run(`m1:para:acc${n}`, status).lastInsertRowid
  );
}

describe('review acts return the row as it was beside the row after', () => {
  const cases = [
    [
      'approveEdit',
      'pending',
      'approved',
      (id) => service.approveEdit(id, 'p-h', 'h', 'athugasemd'),
    ],
    ['rejectEdit', 'pending', 'rejected', (id) => service.rejectEdit(id, 'p-h', 'h', 'nei')],
    [
      'markForDiscussion',
      'pending',
      'discuss',
      (id) => service.markForDiscussion(id, 'p-h', 'h', 'q'),
    ],
    ['unapproveEdit', 'approved', 'pending', (id) => service.unapproveEdit(id)],
    ['returnEditToPending', 'rejected', 'pending', (id) => service.returnEditToPending(id)],
  ];
  for (const [name, from, to, act] of cases) {
    it(`${name} returns before and the row after`, () => {
      const id = rawEdit(from);
      const snap = rowOf(id);
      const result = act(id);
      const { before, ...after } = result;
      expect(before).toEqual(snap);
      expect(after).toEqual(rowOf(id));
      expect(after.status).toBe(to);
    });
  }

  it('approveEdit on a non-pending row still throws and leaves the row unchanged', () => {
    const id = rawEdit('rejected');
    const snap = rowOf(id);
    expect(() => service.approveEdit(id, 'p-h', 'h', 'x')).toThrow('Edit is not pending');
    expect(rowOf(id)).toEqual(snap);
  });

  it('unapproveEdit with an own pending row on the segment still throws PENDING_EXISTS', () => {
    const approved = rawEdit('approved', { segmentId: 'm1:para:dup' });
    // The one-pending index allows a pending row only beside a non-pending one.
    const pending = rawEdit('pending', { segmentId: 'm1:para:dup' });
    const snaps = [rowOf(approved), rowOf(pending)];
    let caught;
    try {
      service.unapproveEdit(approved);
    } catch (e) {
      caught = e;
    }
    expect(caught.code).toBe('PENDING_EXISTS');
    expect([rowOf(approved), rowOf(pending)]).toEqual(snaps);
  });
});

describe('deleteSegmentEdit', () => {
  it('returns the deleted row', () => {
    const id = rawEdit('pending');
    const snap = rowOf(id);
    expect(service.deleteSegmentEdit(id, 'p-a')).toEqual({ deleted: true, before: snap });
    expect(rowOf(id)).toBeUndefined();
  });

  it('refuses another editor and leaves the row unchanged', () => {
    const id = rawEdit('pending');
    const snap = rowOf(id);
    expect(() => service.deleteSegmentEdit(id, 'p-other')).toThrow('Not your edit');
    expect(rowOf(id)).toEqual(snap);
  });
});

describe('revokeAcceptance', () => {
  it('returns the row as it was beside the row after', () => {
    const id = rawAcceptance('active');
    const result = acceptanceService.revokeAcceptance(id, {
      actorId: 'p-z',
      actorRole: 'editor',
      actorBooks: [],
    });
    const { before, ...after } = result;
    expect(before.status).toBe('active');
    expect(after.status).toBe('superseded');
    expect(after.superseded_reason).toBe('revoked');
    expect(after).toEqual(accRowOf(id));
  });
});

describe('submitModuleForReview', () => {
  it('lists exactly the edits it stamped', () => {
    const older = Number(
      db
        .prepare(
          `INSERT INTO module_reviews (book, chapter, module_id, submitted_by, submitted_by_username, status)
           VALUES ('tb', 1, 'm1', 'p-a', 'a', 'approved')`
        )
        .run().lastInsertRowid
    );
    const P = rawEdit('pending');
    const D = rawEdit('discuss');
    const A = rawEdit('approved');
    const O = rawEdit('approved', { reviewId: older });
    const R = rawEdit('rejected');
    const S = rawEdit('superseded');
    const r = service.submitModuleForReview({
      book: 'tb',
      chapter: 1,
      moduleId: 'm1',
      submittedBy: 'p-a',
      submittedByUsername: 'a',
    });
    const stamped = db
      .prepare('SELECT id FROM segment_edits WHERE review_id = ? ORDER BY id')
      .all(r.id)
      .map((x) => x.id);
    expect(r.stampedEditIds).toEqual(stamped);
    expect(r.stampedEditIds).toEqual([P, D, A]);
    expect([O, R, S].some((x) => r.stampedEditIds.includes(x))).toBe(false);
    expect(r.editedSegments).toBe(1);
  });
});

describe('addDiscussionComment', () => {
  it('returns the edit it is on', () => {
    const editId = rawEdit('discuss');
    const r = service.addDiscussionComment(editId, 'p-h', 'h', 'hæ');
    expect(r.edit).toEqual(rowOf(editId));
    expect(r.id).toBe(Number(db.prepare('SELECT MAX(id) AS m FROM segment_discussions').get().m));
  });

  it('still throws for an unknown edit', () => {
    expect(() => service.addDiscussionComment(999999, 'p-h', 'h', 'x')).toThrow('Edit not found');
  });
});
