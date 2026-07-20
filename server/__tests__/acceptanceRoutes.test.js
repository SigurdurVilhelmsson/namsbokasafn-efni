/**
 * Acceptance routes (item 20b) — middleware-invoke pins (the gates FIRE,
 * item-19 MF2 lesson) + handler-level status mapping via router.stack
 * extraction, on a real temp DB + mini book fixture.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'acc-routes-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const BOOK = 'efnafraedi-2e'; // must pass VALID_BOOKS + validateBookChapter
const MODULE = 'mACCRT1';

let router;
let acceptLayer;
let acceptHandler;
let revokeLayer;
let revokeHandler;
let moduleGetLayer;
let applyLayer;
let applyHandler;
let segmentParser;
let realBooksDir;
// eslint-disable-next-line no-unused-vars -- assigned in beforeAll for parity with segmentParser above; not called directly in this suite (handler-level assertions cover the service)
let acceptance;

function invoke(h, req) {
  let resolveResult;
  const done = new Promise((resolve) => {
    resolveResult = resolve;
  });
  const res = {
    statusCode: 200,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(body) {
      resolveResult({ status: this.statusCode, body });
    },
  };
  return Promise.resolve(h(req, res)).then(() => done);
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  segmentParser = require('../services/segmentParser');
  acceptance = require('../services/acceptanceService');
  realBooksDir = segmentParser.BOOKS_DIR;
  const booksDir = path.join(work, 'books');
  const seg = (id, text) => `<!-- SEG:${MODULE}:para:${id} -->\n${text}\n`;
  mkdirSync(path.join(booksDir, BOOK, '02-for-mt/ch01'), { recursive: true });
  mkdirSync(path.join(booksDir, BOOK, '02-mt-output/ch01'), { recursive: true });
  writeFileSync(
    path.join(booksDir, BOOK, '02-for-mt/ch01', `${MODULE}-segments.en.md`),
    seg('a', 'EN a') + '\n' + seg('b', 'EN b')
  );
  writeFileSync(
    path.join(booksDir, BOOK, '02-mt-output/ch01', `${MODULE}-segments.is.md`),
    seg('a', 'IS a') + '\n' + seg('b', 'IS b')
  );
  segmentParser._setTestBooksDir(booksDir);
  require('../services/segmentEditorService')._setTestBooksDir(booksDir);

  router = require('../routes/segment-editor');
  const find = (p, method) =>
    router.stack.find((l) => l.route && l.route.path === p && l.route.methods[method]);
  acceptLayer = find('/:book/:chapter/:moduleId/accept', 'post');
  acceptHandler = acceptLayer.route.stack.at(-1).handle;
  revokeLayer = find('/acceptance/:id/revoke', 'post');
  revokeHandler = revokeLayer.route.stack.at(-1).handle;
  moduleGetLayer = find('/:book/:chapter/:moduleId', 'get');
  applyLayer = find('/:book/:chapter/:moduleId/apply', 'post');
  applyHandler = applyLayer.route.stack.at(-1).handle;
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  require('../services/segmentEditorService')._setTestBooksDir(realBooksDir);
  rmSync(work, { recursive: true, force: true });
});

beforeEach(() => {
  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);
  db.exec('DELETE FROM segment_acceptances; DELETE FROM segment_edits;');
  db.close();
});

const EDITOR = { id: 'u-ed1', username: 'editor1', role: 'editor', books: [] };

function acceptReq(overrides = {}) {
  return {
    params: { book: BOOK, chapter: '1', moduleId: MODULE },
    chapterNum: 1,
    user: EDITOR,
    body: { segmentId: `${MODULE}:para:a`, acceptedContent: 'IS a' },
    ...overrides,
  };
}

describe('route registration + gate pins', () => {
  it('accept mounts the edit-save chain: requireAuth, validateBookChapter, requireBookAccess, validateModule', () => {
    expect(acceptLayer).toBeTruthy();
    expect(acceptLayer.route.stack).toHaveLength(5);
  });

  it('accept requireBookAccess gate FIRES: viewer → 403', async () => {
    const gate = acceptLayer.route.stack[2].handle;
    const out = await invoke(gate, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE },
      user: { id: 'v1', username: 'v', role: 'viewer' },
    });
    expect(out.status).toBe(403);
  });

  it('revoke requireRole(EDITOR) gate FIRES: viewer → 403', async () => {
    expect(revokeLayer.route.stack).toHaveLength(3);
    const gate = revokeLayer.route.stack[1].handle;
    const out = await invoke(gate, {
      user: { id: 'v1', username: 'v', role: 'viewer' },
    });
    expect(out.status).toBe(403);
  });
});

describe('accept handler mapping', () => {
  it('happy path 200 with acceptance row', async () => {
    const out = await invoke(acceptHandler, acceptReq());
    expect(out.status).toBe(200);
    expect(out.body.success).toBe(true);
    expect(out.body.alreadyAccepted).toBe(false);
    expect(out.body.acceptance.segment_id).toBe(`${MODULE}:para:a`);
  });

  it('repeat → 200 alreadyAccepted', async () => {
    await invoke(acceptHandler, acceptReq());
    const out = await invoke(acceptHandler, acceptReq());
    expect(out.status).toBe(200);
    expect(out.body.alreadyAccepted).toBe(true);
  });

  it('byte mismatch → 409 STALE_CONTENT', async () => {
    const out = await invoke(
      acceptHandler,
      acceptReq({ body: { segmentId: `${MODULE}:para:a`, acceptedContent: 'stale' } })
    );
    expect(out.status).toBe(409);
    expect(out.body.error).toBe('STALE_CONTENT');
  });

  it('active edit → 409 EDIT_EXISTS', async () => {
    require('../services/segmentEditorService').saveSegmentEdit({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: `${MODULE}:para:a`,
      originalContent: 'IS a',
      editedContent: 'IS a breytt',
      editorId: 'u-ed2',
      editorUsername: 'editor2',
    });
    const out = await invoke(acceptHandler, acceptReq());
    expect(out.status).toBe(409);
    expect(out.body.error).toBe('EDIT_EXISTS');
  });

  it('open discussion → 409 DISCUSS_OPEN (MTA-R3)', async () => {
    const editorService = require('../services/segmentEditorService');
    const { id } = editorService.saveSegmentEdit({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: `${MODULE}:para:a`,
      originalContent: 'IS a',
      editedContent: 'IS a breytt',
      editorId: 'u-ed2',
      editorUsername: 'editor2',
    });
    editorService.markForDiscussion(id, 'u-he', 'headeditor');
    const out = await invoke(acceptHandler, acceptReq());
    expect(out.status).toBe(409);
    expect(out.body.error).toBe('DISCUSS_OPEN');
  });

  it('published human text → 409 HUMAN_CONTENT (MTA-R3)', async () => {
    const Database = require('better-sqlite3');
    const db = new Database(process.env.SESSIONS_DB_PATH);
    db.prepare(
      `INSERT INTO segment_edits
         (book, chapter, module_id, segment_id, original_content, edited_content,
          editor_id, editor_username, status, reviewed_at, applied_at)
       VALUES (?, 1, ?, ?, 'x', 'IS a', 'u-ed2', 'editor2', 'approved',
               '2026-07-19 10:00:00', '2026-07-19 10:05:00')`
    ).run(BOOK, MODULE, `${MODULE}:para:a`);
    db.close();
    const out = await invoke(acceptHandler, acceptReq());
    expect(out.status).toBe(409);
    expect(out.body.error).toBe('HUMAN_CONTENT');
  });

  it('missing segmentId / missing acceptedContent → 400', async () => {
    expect((await invoke(acceptHandler, acceptReq({ body: {} }))).status).toBe(400);
    expect((await invoke(acceptHandler, acceptReq({ body: { segmentId: 'x' } }))).status).toBe(400);
  });

  it('unknown segment → 404', async () => {
    const out = await invoke(
      acceptHandler,
      acceptReq({ body: { segmentId: `${MODULE}:para:zz`, acceptedContent: 'x' } })
    );
    expect(out.status).toBe(404);
  });
});

describe('revoke handler mapping', () => {
  async function makeAcceptance() {
    const out = await invoke(acceptHandler, acceptReq());
    return out.body.acceptance.id;
  }

  it('owner revokes → 200', async () => {
    const id = await makeAcceptance();
    const out = await invoke(revokeHandler, { params: { id: String(id) }, user: EDITOR });
    expect(out.status).toBe(200);
    expect(out.body.acceptance.status).toBe('superseded');
  });

  it('other editor → 403; book-scoped HE → 200', async () => {
    const id = await makeAcceptance();
    const other = { id: 'u-ed9', username: 'editor9', role: 'editor', books: [] };
    expect((await invoke(revokeHandler, { params: { id: String(id) }, user: other })).status).toBe(
      403
    );
    const he = { id: 'u-he1', username: 'he1', role: 'head-editor', books: [BOOK] };
    expect((await invoke(revokeHandler, { params: { id: String(id) }, user: he })).status).toBe(
      200
    );
  });

  it('unknown id → 404', async () => {
    const out = await invoke(revokeHandler, { params: { id: '99999' }, user: EDITOR });
    expect(out.status).toBe(404);
  });
});

describe('module GET exposes acceptances', () => {
  it('returns acceptances keyed by segmentId', async () => {
    await invoke(acceptHandler, acceptReq());
    const getHandler = moduleGetLayer.route.stack.at(-1).handle;
    const out = await invoke(getHandler, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE },
      chapterNum: 1,
      user: EDITOR,
    });
    expect(out.status).toBe(200);
    expect(out.body.acceptances[`${MODULE}:para:a`]).toMatchObject({
      status: 'active',
      accepted_by_username: 'editor1',
    });
    expect(out.body.acceptances[`${MODULE}:para:b`]).toBeUndefined();
  });
});

describe('apply handler activity-log description includes acceptance counts (final-review F2)', () => {
  it('accept-only module: 0 edits/2 acceptances logs "0 breytingu/ar og 2 staðfestingar"', async () => {
    await invoke(
      acceptHandler,
      acceptReq({ body: { segmentId: `${MODULE}:para:a`, acceptedContent: 'IS a' } })
    );
    await invoke(
      acceptHandler,
      acceptReq({ body: { segmentId: `${MODULE}:para:b`, acceptedContent: 'IS b' } })
    );

    const out = await invoke(applyHandler, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE },
      chapterNum: 1,
      user: EDITOR,
    });
    expect(out.status).toBe(200);
    expect(out.body.appliedCount).toBe(0);
    expect(out.body.acceptedCount).toBe(2);

    const Database = require('better-sqlite3');
    const db = new Database(process.env.SESSIONS_DB_PATH);
    const row = db
      .prepare(
        `SELECT description FROM activity_log
         WHERE type = 'segment_edits_applied'
         ORDER BY id DESC LIMIT 1`
      )
      .get();
    db.close();
    expect(row.description).toContain('0 breytingu/ar og 2 staðfestingar');
  });
});
