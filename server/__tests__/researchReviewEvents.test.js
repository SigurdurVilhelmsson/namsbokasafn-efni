/**
 * The review routes, delete, revoke, comment and submit record their research events (G1.2 PR3 Task 23; spec
 * §5.9, §5.18; plan decisions 44, 52, 53, 57, 58; Review Focus 24, 25, 35).
 *
 * Drives the real handlers on a real migrated database (SESSIONS_DB_PATH in a temp dir, so the research file
 * derives into it too) over a synthetic module under a temp books root: nothing under books/ or pipeline-output/
 * is read or written. Each case uses its own segment, so no case reads another's rows; each takes `eventMark()`
 * before the act it measures.
 */
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath(), the research path and the JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'research-review-events-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const researchDb = require('../services/researchDb');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const { sha256Text } = require('../lib/servedText');
const { writeModule, handlerFor, invoke } = require('./helpers/servedFixture');
const { APPROVED, makeUser, consent } = require('./helpers/researchFixture.cjs');
const { eventMark, eventsSince, researchBytes } = require('./helpers/researchEventsFixture.cjs');

const CHEM = 'efnafraedi-2e';
const M = 'm97301';
const id = (x) => `${M}:para:${x}`;
const LETTERS = ['a', 'b', 'c', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
const EN = LETTERS.map((x) => [id(x), `EN ${x}`]);
const MT = LETTERS.map((x) => [id(x), `IS ${x}`]);

const A = Object.freeze({ id: 'p-a', username: 'p-a', role: 'editor', books: [] });
const H = Object.freeze({ id: 'p-h', username: 'p-h', role: 'admin', books: [] });
const PARAMS = Object.freeze({ book: CHEM, chapter: '1', moduleId: M });

// The helper researchBoundary.test.js keeps file-local: every key at every depth, arrays transparent.
const keysDeep = (v) =>
  v && typeof v === 'object'
    ? Object.entries(v).flatMap(([k, x]) => [...(Array.isArray(v) ? [] : [k]), ...keysDeep(x)])
    : [];

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let db;
let h;
const bodies = []; // every response body collected, for the no-before pin

beforeAll(() => {
  runAllMigrations();
  researchDb.openAtBoot();
  researchConsentText._setTestApprovedTexts(APPROVED);
  serverCommit._setTestServerCommit({
    serverCommit: 'c'.repeat(40),
    commitSource: 'deploy-file',
    codeDirty: 0,
  });
  segmentParser = require('../services/segmentParser');
  segmentEditor = require('../services/segmentEditorService');
  realBooksDir = segmentParser.BOOKS_DIR;
  root = path.join(work, 'books');
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);
  writeModule(root, { book: CHEM, chapterDir: 'ch01', moduleId: M, en: EN, mt: MT });
  consent(makeUser('p-a'));
  consent(makeUser('p-h'));
  const router = require('../routes/segment-editor');
  h = {
    get: handlerFor(router, 'get', '/:book/:chapter/:moduleId'),
    save: handlerFor(router, 'post', '/:book/:chapter/:moduleId/edit'),
    accept: handlerFor(router, 'post', '/:book/:chapter/:moduleId/accept'),
    submit: handlerFor(router, 'post', '/:book/:chapter/:moduleId/submit'),
    approve: handlerFor(router, 'post', '/edit/:editId/approve'),
    reject: handlerFor(router, 'post', '/edit/:editId/reject'),
    discuss: handlerFor(router, 'post', '/edit/:editId/discuss'),
    unapprove: handlerFor(router, 'post', '/edit/:editId/unapprove'),
    back: handlerFor(router, 'post', '/edit/:editId/return-to-pending'),
    del: handlerFor(router, 'delete', '/edit/:editId'),
    comment: handlerFor(router, 'post', '/edit/:editId/comment'),
    revoke: handlerFor(router, 'post', '/acceptance/:id/revoke'),
  };
  db = new Database(dbPath);
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  segmentEditor._setTestBooksDir(realBooksDir);
  researchConsentText._setTestApprovedTexts(null);
  serverCommit._setTestServerCommit(null);
  researchDb._reset();
  db.close();
  rmSync(work, { recursive: true, force: true });
});

const call = async (handler, req) => {
  const r = await invoke(handler, req);
  bodies.push(r.body);
  return r;
};
const onEdit = (handler, user, editId, body = {}) =>
  call(handler, { params: { editId: String(editId) }, user, body });

/** What `user`'s page shows for segment x: the served hash and the row it displays. */
async function view(user, x) {
  const page = (await invoke(h.get, { params: PARAMS, chapterNum: 1, user })).body;
  const rows = page.edits[id(x)];
  return {
    baseSha256: page.segments.find((s) => s.segmentId === id(x)).baseSha256,
    row: rows && rows.length ? rows[0] : null,
  };
}

/** A save through the route, as the page sends it; the hash comes from a following GET. */
async function authorSaves(x, text) {
  const v = await view(A, x);
  const r = await call(h.save, {
    params: PARAMS,
    chapterNum: 1,
    user: A,
    body: {
      segmentId: id(x),
      editedContent: text,
      baseSha256: v.baseSha256,
      ...(v.row
        ? {
            baseEditId: v.row.id,
            displayedEditId: v.row.id,
            displayedEditSha256: v.row.contentSha256,
          }
        : {}),
      clientActionId: `rv-save-${x}-${text}`,
    },
  });
  expect(r.status).toBe(200);
  const row = (await view(A, x)).row;
  return { editId: r.body.editId, contentSha256: row.contentSha256 };
}

const rowOf = (editId) => db.prepare('SELECT * FROM segment_edits WHERE id = ?').get(editId);
const textBytes = () => researchBytes();

describe('the review routes record their research events (spec §5.9, §5.18)', () => {
  it("approve: editing row, the text only as a hash, the reviewer's note as length and hash, the echo and no mismatch", async () => {
    const { editId, contentSha256 } = await authorSaves('a', 'AUTHOR-TEXT-A');
    const mark = eventMark();
    const r = await onEdit(h.approve, H, editId, {
      note: 'REVIEWER-NOTE-A',
      reviewedEditSha256: contentSha256,
    });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['edit', 'success']);
    expect('before' in r.body.edit).toBe(false);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    const row = rowOf(editId);
    expect(ev[0]).toMatchObject({
      event_type: 'edit-approve',
      editing_kind: 'segment_edit',
      editing_id: BigInt(editId),
      editing_content_sha256: sha256Text('AUTHOR-TEXT-A'),
      served_version_id: BigInt(row.served_version_id),
      origin: 'editor-save',
    });
    expect(ev[0].content).toEqual({
      note: { length: [...'REVIEWER-NOTE-A'].length, sha256: sha256Text('REVIEWER-NOTE-A') },
    });
    expect(ev[0].detail).toEqual({ reviewedEditSha256: contentSha256, mismatch: false });
    expect(ev[0].before[0].table).toBe('segment_edits');
    expect(ev[0].before[0].row.status).toBe('pending');
    expect(ev[0].before[0].row.edited_content_sha256).toBe(sha256Text('AUTHOR-TEXT-A'));
    expect('edited_content' in ev[0].before[0].row).toBe(false);
    expect('created_at' in ev[0].before[0].row).toBe(false);
    const bytes = textBytes();
    expect(bytes.includes('REVIEWER-NOTE-A')).toBe(false);
    // Control: the scan sees text — the author's own save stored it.
    expect(bytes.includes('AUTHOR-TEXT-A')).toBe(true);
  });

  it('a reviewer acting on text that changed after the page loaded is flagged, never refused (§14 call 23)', async () => {
    const first = await authorSaves('b', 'v1');
    await authorSaves('b', 'v2');
    expect(rowOf(first.editId).edited_content).toBe('v2');
    const mark = eventMark();
    const r = await onEdit(h.reject, H, first.editId, { reviewedEditSha256: first.contentSha256 });
    expect(r.status).toBe(200);
    expect(rowOf(first.editId).status).toBe('rejected');
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0].event_type).toBe('edit-reject');
    expect(ev[0].detail).toEqual({ reviewedEditSha256: first.contentSha256, mismatch: true });

    const g = await authorSaves('g', 'text g');
    const mark2 = eventMark();
    const d = await onEdit(h.discuss, H, g.editId, {});
    expect(d.status).toBe(200);
    const ev2 = eventsSince(mark2);
    expect(ev2).toHaveLength(1);
    expect(ev2[0].event_type).toBe('edit-discuss');
    expect(ev2[0].detail).toEqual({ reviewedEditSha256: null, mismatch: true });
  });

  it("unapprove and return-to-pending carry the previous status, and the reviewer's own time only when it is theirs", async () => {
    const { editId } = await authorSaves('c', 'text c');
    expect((await onEdit(h.approve, H, editId, {})).status).toBe(200);
    const reviewedAt = rowOf(editId).reviewed_at;
    expect(reviewedAt).toBeTruthy();
    const mark = eventMark();
    expect((await onEdit(h.unapprove, H, editId)).status).toBe(200);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0].event_type).toBe('edit-unapprove');
    expect(ev[0].content).toBeNull();
    expect(ev[0].detail).toBeNull();
    expect(ev[0].before[0].row.status).toBe('approved');
    expect(ev[0].before[0].row.reviewed_at).toBe(reviewedAt);

    expect((await onEdit(h.reject, H, editId, {})).status).toBe(200);
    const mark2 = eventMark();
    expect((await onEdit(h.back, H, editId)).status).toBe(200);
    const ev2 = eventsSince(mark2);
    expect(ev2).toHaveLength(1);
    expect(ev2[0].event_type).toBe('edit-return-to-pending');
    expect(ev2[0].before[0].row.status).toBe('rejected');
  });

  it("delete: the deleted row, its served version, the author's own text", async () => {
    const { editId } = await authorSaves('e', 'AUTHOR-OWN-E');
    const row = rowOf(editId);
    const mark = eventMark();
    const r = await onEdit(h.del, A, editId);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true });
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      event_type: 'edit-delete',
      served_version_id: BigInt(row.served_version_id),
      editing_content_sha256: sha256Text('AUTHOR-OWN-E'),
    });
    expect(ev[0].before[0].row.edited_content).toBe('AUTHOR-OWN-E');
  });

  it("revoke: an acceptance, its previous status; another's acceptance loses its time", async () => {
    const accept = (user, x) =>
      call(h.accept, {
        params: PARAMS,
        chapterNum: 1,
        user,
        body: { segmentId: id(x), acceptedContent: `IS ${x}` },
      });
    const a1 = (await accept(A, 'f')).body.acceptance;
    const mark = eventMark();
    const r = await call(h.revoke, { params: { id: String(a1.id) }, user: A, body: {} });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['acceptance', 'success']);
    expect('before' in r.body.acceptance).toBe(false);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      event_type: 'mt-accept-revoke',
      editing_kind: 'segment_acceptance',
      editing_id: BigInt(a1.id),
      served_version_id: BigInt(a1.served_version_id),
      editing_content_sha256: sha256Text('IS f'),
    });
    expect(ev[0].before[0].table).toBe('segment_acceptances');
    expect(ev[0].before[0].row.status).toBe('active');
    expect(ev[0].before[0].row.accepted_at).toBeTruthy();

    const a2 = (await accept(A, 'h')).body.acceptance;
    const mark2 = eventMark();
    expect(
      (await call(h.revoke, { params: { id: String(a2.id) }, user: H, body: {} })).status
    ).toBe(200);
    const ev2 = eventsSince(mark2);
    expect(ev2).toHaveLength(1);
    expect(ev2[0].before[0].row.status).toBe('active');
    expect('accepted_at' in ev2[0].before[0].row).toBe(false);
  });

  it('comment: length and hash only', async () => {
    const { editId } = await authorSaves('i', 'text i');
    const mark = eventMark();
    const r = await onEdit(h.comment, H, editId, { comment: 'SENTINEL-COMMENT' });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['commentId', 'success']);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ event_type: 'edit-comment', editing_id: BigInt(editId) });
    expect(ev[0].content).toEqual({
      comment: { length: [...'SENTINEL-COMMENT'].length, sha256: sha256Text('SENTINEL-COMMENT') },
    });
    expect(textBytes().includes('SENTINEL-COMMENT')).toBe(false);
  });

  it('a reviewer act carries no client fields, even when the body sends some (decision 53)', async () => {
    const { editId } = await authorSaves('j', 'text j');
    const mark = eventMark();
    const r = await onEdit(h.reject, H, editId, {
      clientActionId: 'rv-1',
      clientActionTime: Date.now(),
      replayed: true,
    });
    expect(r.status).toBe(200);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0].client_action_id).toBeNull();
    expect(ev[0].client_action_time_ms).toBeNull();
    expect(ev[0].replayed).toBe(0n);
  });

  it('submit: the edit ids it stamped', async () => {
    const mark = eventMark();
    const r = await call(h.submit, { params: PARAMS, chapterNum: 1, user: A, body: {} });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['editedSegments', 'reviewId', 'success']);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      event_type: 'module-submit',
      segment_id: null,
      served_version_id: null,
      editing_kind: null,
    });
    const stamped = db
      .prepare('SELECT id FROM segment_edits WHERE review_id = ? ORDER BY id')
      .all(r.body.reviewId)
      .map((x) => x.id);
    expect(stamped.length).toBeGreaterThan(0);
    expect(ev[0].detail).toEqual({ reviewId: r.body.reviewId, stampedEditIds: stamped });
  });

  it('the responses never carry before (decision 44)', () => {
    expect(bodies.length).toBeGreaterThan(10);
    const keys = bodies.flatMap(keysDeep);
    expect(keys).not.toContain('before');
    expect(keys).not.toContain('writes');
    expect(keysDeep({ x: { before: 1 } })).toContain('before'); // control
  });
});

describe("a client's displayedEditSha256 reaches research only if it is a hash (final review I1; Review Focus 41)", () => {
  it('a re-save echoing a non-hash: null and flagged in the save event, null in the reviewer’s before-image', async () => {
    const SENTINEL = 'RAW-SENTINEL-ekki-tætigildi Jón Jónsson';
    await authorSaves('k', 'AUTHOR-TEXT-K');
    const v = await view(A, 'k');
    const mark = eventMark();
    // PR1 accepts it: the displayed row already holds the text being saved (decision 39), so the echo is never compared.
    const r = await call(h.save, {
      params: PARAMS,
      chapterNum: 1,
      user: A,
      body: {
        segmentId: id('k'),
        editedContent: 'AUTHOR-TEXT-K',
        baseSha256: v.baseSha256,
        baseEditId: v.row.id,
        displayedEditId: v.row.id,
        displayedEditSha256: SENTINEL,
        clientActionId: 'rv-save-k-sentinel',
      },
    });
    expect(r.status).toBe(200);
    expect(rowOf(v.row.id).displayed_edit_sha256).toBe(SENTINEL); // PR1's write is unchanged
    const ev = eventsSince(mark);
    expect(ev.map((e) => e.event_type)).toEqual(['edit-resave']);
    expect(ev[0].detail.displayed).toEqual({ editId: v.row.id, sha256: null });
    expect(ev[0].detail.echoMalformed).toBe(true);

    const markApprove = eventMark();
    const ap = await onEdit(h.approve, H, v.row.id, {});
    expect(ap.status).toBe(200);
    const evApprove = eventsSince(markApprove);
    expect(evApprove).toHaveLength(1);
    expect(evApprove[0].before[0].row.displayed_edit_id).toBe(v.row.id);
    expect(evApprove[0].before[0].row.displayed_edit_sha256).toBeNull();
    const bytes = researchBytes();
    expect(bytes.includes('RAW-SENTINEL')).toBe(false);
    // Control: the scan sees text — the author's own save stored it.
    expect(bytes.includes('AUTHOR-TEXT-K')).toBe(true);
  });
});

describe("a non-string reviewer's note is recorded as the service stores it (final review M7)", () => {
  it('a numeric note on an approve: the event carries it as length and hash', async () => {
    const { editId, contentSha256 } = await authorSaves('l', 'AUTHOR-TEXT-L');
    const mark = eventMark();
    const r = await onEdit(h.approve, H, editId, { note: 5, reviewedEditSha256: contentSha256 });
    expect(r.status).toBe(200);
    // As for the save's note: the row renders the REAL-bound number '5.0', the event hashes String(5).
    expect(rowOf(editId).reviewer_note).toBe('5.0');
    const ev = eventsSince(mark);
    expect(ev.map((e) => e.event_type)).toEqual(['edit-approve']);
    expect(ev[0].content).toEqual({ note: { length: 1, sha256: sha256Text('5') } });
  });
});
