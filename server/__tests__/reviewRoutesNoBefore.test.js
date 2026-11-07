/**
 * No review route's response carries a before-image or a research key (G1.2; spec §5.9, §11; plan
 * Task 16, decision 44). The services return `before` and the stamped ids for the research event;
 * each route strips them, so a response is key-for-key what it was.
 *
 * Drives the real handlers on a real migrated database (SESSIONS_DB_PATH in a temp dir) over a
 * synthetic module under a temp books root; nothing under books/ or pipeline-output/ is written.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'review-routes-no-before-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { writeModule, handlerFor, invoke } = require('./helpers/servedFixture');

const BOOK = 'testbook';
const M = 'm96401';
const IDS = ['a', 'b', 'c', 'd', 'e', 'f'];
const segId = (x) => `${M}:para:${x}`;

const HEAD = { id: 'p-h', username: 'h', role: 'head-editor', books: [BOOK] };
const OWNER = { id: 'p-a', username: 'a', role: 'editor', books: [BOOK] };

let segmentParser;
let segmentEditor;
let realBooksDir;
let root;
let db;
let h;
const bodies = [];

const keysDeep = (v) =>
  v && typeof v === 'object'
    ? Object.entries(v).flatMap(([k, x]) => [...(Array.isArray(v) ? [] : [k]), ...keysDeep(x)])
    : [];

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  segmentParser = require('../services/segmentParser');
  segmentEditor = require('../services/segmentEditorService');
  realBooksDir = segmentParser.BOOKS_DIR;
  root = path.join(work, 'books');
  writeModule(root, {
    book: BOOK,
    chapterDir: 'ch01',
    moduleId: M,
    en: IDS.map((x) => [segId(x), `EN ${x}`]),
    mt: IDS.map((x) => [segId(x), `IS ${x}`]),
  });
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);
  const router = require('../routes/segment-editor');
  const H = (method, p) => handlerFor(router, method, p);
  h = {
    approve: H('post', '/edit/:editId/approve'),
    reject: H('post', '/edit/:editId/reject'),
    discuss: H('post', '/edit/:editId/discuss'),
    unapprove: H('post', '/edit/:editId/unapprove'),
    back: H('post', '/edit/:editId/return-to-pending'),
    revoke: H('post', '/acceptance/:id/revoke'),
    del: H('delete', '/edit/:editId'),
    comment: H('post', '/edit/:editId/comment'),
    submit: H('post', '/:book/:chapter/:moduleId/submit'),
  };
  db = new Database(dbPath);
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  segmentEditor._setTestBooksDir(realBooksDir);
  db.close();
  rmSync(work, { recursive: true, force: true });
});

// The legacy save call: no research event exists yet, so no consent is needed.
function seed(x, user = OWNER) {
  return segmentEditor.saveSegmentEdit({
    book: BOOK,
    chapter: 1,
    moduleId: M,
    segmentId: segId(x),
    originalContent: `IS ${x}`,
    editedContent: `EDIT ${x}`,
    editorId: user.id,
    editorUsername: user.username,
  }).id;
}
const rowOf = (id) => db.prepare('SELECT * FROM segment_edits WHERE id = ?').get(id);
const set = (id, status) =>
  db.prepare('UPDATE segment_edits SET status = ? WHERE id = ?').run(status, id);

async function call(handler, req) {
  const r = await invoke(handler, req);
  bodies.push(r.body);
  return r;
}
const act = (handler, id, user = HEAD) =>
  call(handler, { params: { editId: String(id) }, user, body: { note: 'n' } });

describe('review routes send the row and nothing else', () => {
  it('approve', async () => {
    const id = seed('a');
    const r = await act(h.approve, id);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['edit', 'success']);
    expect(r.body.edit).toEqual(rowOf(id));
  });

  it('reject', async () => {
    const id = seed('b');
    const r = await act(h.reject, id);
    expect(Object.keys(r.body).sort()).toEqual(['edit', 'success']);
    expect(r.body.edit).toEqual(rowOf(id));
  });

  it('discuss', async () => {
    const id = seed('c');
    const r = await act(h.discuss, id);
    expect(Object.keys(r.body).sort()).toEqual(['edit', 'success']);
    expect(r.body.edit).toEqual(rowOf(id));
  });

  it('unapprove', async () => {
    const id = seed('d');
    set(id, 'approved');
    const r = await act(h.unapprove, id);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['edit', 'success']);
    expect(r.body.edit).toEqual(rowOf(id));
  });

  it('return-to-pending', async () => {
    const id = seed('e');
    set(id, 'rejected');
    const r = await act(h.back, id);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['edit', 'success']);
    expect(r.body.edit).toEqual(rowOf(id));
  });

  it('revoke', async () => {
    const accId = Number(
      db
        .prepare(
          `INSERT INTO segment_acceptances
             (book, chapter, module_id, segment_id, accepted_content, accepted_by,
              accepted_by_username, status)
           VALUES (?, 1, ?, ?, 'ACC', 'p-a', 'a', 'active')`
        )
        .run(BOOK, M, segId('f')).lastInsertRowid
    );
    const r = await call(h.revoke, { params: { id: String(accId) }, user: OWNER });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['acceptance', 'success']);
    expect(r.body.acceptance).toEqual(
      db.prepare('SELECT * FROM segment_acceptances WHERE id = ?').get(accId)
    );
  });

  it('delete', async () => {
    db.exec('DELETE FROM segment_edits');
    const id = seed('a');
    const r = await call(h.del, { params: { editId: String(id) }, user: OWNER });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['success']);
  });

  it('comment', async () => {
    const id = seed('b');
    const r = await call(h.comment, {
      params: { editId: String(id) },
      user: HEAD,
      body: { comment: 'hæ' },
    });
    expect(Object.keys(r.body).sort()).toEqual(['commentId', 'success']);
  });

  it('submit', async () => {
    const r = await call(h.submit, {
      params: { book: BOOK, chapter: '1', moduleId: M },
      chapterNum: 1,
      user: OWNER,
    });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['editedSegments', 'reviewId', 'success']);
  });

  it('no response carries a research key, at any depth', () => {
    expect(keysDeep({ x: { before: 1 } })).toContain('before');
    expect(bodies.length).toBeGreaterThan(0);
    const keys = new Set(bodies.flatMap(keysDeep));
    expect(keys.has('before')).toBe(false);
    expect(keys.has('writes')).toBe(false);
    expect(keys.has('stampedEditIds')).toBe(false);
  });
});
