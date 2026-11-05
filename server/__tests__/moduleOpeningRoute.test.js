// server/__tests__/moduleOpeningRoute.test.js
//
// The opening record through the module route (G1.1 + G1.2 spec §5.4 step 4, §5.5, §11; PR2 Task 3):
// T6's and T7's route halves, every case. The handler is driven without HTTP on a real migrated
// database; the visitor's 403 and chapter 0's 400, which middleware answers, go through the route's
// whole chain with real JWTs (invokeChain). The service half is moduleOpenings.test.js.
//
// SESSIONS_DB_PATH and JWT_SECRET are set BEFORE any server require: from PR2 the handler reaches
// userService.findByProviderId, whose connection opens resolveDbPath(), so without it a run would
// create pipeline-output/sessions.db. The books root is a temp directory and every edit row is
// seeded by SQL, so no first-edit hook writes an MT lock and nothing reaches books/.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'module-opening-route-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const log = require('../lib/logger');
const userService = require('../services/userService');
const segmentEditor = require('../services/segmentEditorService');
const segmentParser = require('../services/segmentParser');
const moduleOpenings = require('../services/moduleOpenings');
const m054 = require('../migrations/054-module-openings');
const { writeModule, handlerFor, invoke, invokeChain } = require('./helpers/servedFixture');

const BOOK = 'efnafraedi-2e';
const T0 = 1_700_000_000_123;
const ROUTE = '/:book/:chapter/:moduleId';

let db;
let router;
let get;
let auth;
let realBooksDir;
let booksRoot;
// members (users rows), created in beforeAll
let ed1, ed1b, ed5, zero, admin, head, ch00, adminRow, viewerRow;
const ghost = Object.freeze({ id: 'p-ghost', username: 'ghost', role: 'editor', books: [] });

const serve = (user, moduleId, { chapter = '1', chapterNum = 1, book = BOOK } = {}) =>
  invoke(get, { params: { book, chapter, moduleId }, chapterNum, user });
const opening = (moduleId, chapter = 1, book = BOOK) =>
  db
    .prepare('SELECT * FROM module_openings WHERE book = ? AND chapter = ? AND module_id = ?')
    .get(book, chapter, moduleId);
const snapshot = (moduleId, chapter = 1) =>
  db
    .prepare(
      `SELECT segment_id, occurrence FROM module_opening_inflight
       WHERE book = ? AND chapter = ? AND module_id = ? ORDER BY segment_id, occurrence`
    )
    .all(BOOK, chapter, moduleId);
/** Seed a segment_edits row by SQL: no MT lock is written, nothing reaches books/. */
function addEdit({
  moduleId,
  seg,
  chapter = 1,
  status = 'pending',
  appliedAt = null,
  origin = null,
  occurrence = null,
  editor = 'ed-a',
  createdAt = '2026-06-16 10:00:00',
}) {
  return db
    .prepare(
      `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content, status,
         editor_id, editor_username, created_at, applied_at, origin, occurrence)
       VALUES (?, ?, ?, ?, 'IS', 'IS breytt', ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      BOOK,
      chapter,
      moduleId,
      seg,
      status,
      editor,
      editor,
      createdAt,
      appliedAt,
      origin,
      occurrence
    ).lastInsertRowid;
}
/** req.user as requireAuth builds it from this member's token (requireAuth.js). */
const asUser = (u, books = []) => ({
  id: u.provider_id,
  username: u.provider_username,
  role: u.role,
  books,
});
const bearer = (user) => ({
  authorization: `Bearer ${auth.createToken({ ...user, name: user.username, avatar: '' })}`,
});
/** A users row the way the admin page creates one, with assignment rows (userService's own writers). */
function member(providerId, role, chapters = [], book = BOOK) {
  const u = userService.createUser({
    providerId,
    providerUsername: `${providerId}@skoli.example`,
    email: `${providerId}@skoli.example`,
    role,
  });
  for (const ch of chapters) userService.assignChapter(u.id, book, ch);
  return u;
}
const everySegmentHasBase = (body) =>
  body.segments.length > 0 && body.segments.every((s) => typeof s.baseSha256 === 'string');

/** A module with EN and MT; segments `a` and `b` unless named. */
function addModule(moduleId, { chapterDir = 'ch01', book = BOOK, ids = null, mt = true } = {}) {
  const segIds = ids || [`${moduleId}:para:a`, `${moduleId}:para:b`];
  writeModule(booksRoot, {
    book,
    chapterDir,
    moduleId,
    en: segIds.map((id, i) => [id, `English ${i}.`]),
    mt: mt ? segIds.map((id, i) => [id, `Íslenska ${i}.`]) : null,
  });
}

beforeAll(() => {
  runAllMigrations();
  db = new Database(process.env.SESSIONS_DB_PATH);
  realBooksDir = segmentParser.BOOKS_DIR;
  booksRoot = path.join(work, 'books');
  segmentParser._setTestBooksDir(booksRoot);
  router = require('../routes/segment-editor');
  get = handlerFor(router, 'get', ROUTE);
  auth = require('../services/auth');

  ed1 = member('p-ed1', 'editor', [1, 2, -1]);
  userService.assignChapter(ed1.id, 'liffraedi-2e', 1);
  ed1b = member('p-ed1b', 'editor', [1]);
  ed5 = member('p-ed5', 'editor', [5]);
  zero = member('p-zero', 'editor');
  admin = member('p-admin', 'admin');
  head = member('p-head', 'head-editor');
  userService.assignBookAccess(head.id, BOOK, 'head-editor');
  ch00 = member('p-ch00', 'editor', [0]);
  adminRow = member('p-admin-row', 'admin', [1]);
  viewerRow = member('p-viewer-row', 'viewer', [1]);

  for (const m of [
    'm94001',
    'm94003',
    'm94004',
    'm94007',
    'm94008',
    'm94010',
    'm94011',
    'm94012',
    'm94013',
    'm94014',
  ]) {
    addModule(m);
  }
  addModule('m94005', { mt: false }); // layerless: EN only
  addModule('chapter-metadata', { chapterDir: 'ch02', ids: ['chapter:title:ch02'] });
  addModule('chapter-metadata', { chapterDir: 'ch05', ids: ['chapter:title:ch05'] });
  addModule('m94009', { chapterDir: 'appendices' });
  addModule('m94000', { chapterDir: 'ch00' });
  addModule('m94006', { book: 'liffraedi-2e' });
  addModule('m94020', {
    ids: ['s1', 's2', 's3', 's4', 's5', 's6'].map((s) => `m94020:para:${s}`),
  });
  addModule('m94021', { ids: ['m94021:para:x'] });
  addModule('m94022', { ids: ['m94022:para:y'] });
});

afterEach(() => {
  moduleOpenings._setTestClock(null);
  vi.restoreAllMocks();
  db.exec('DROP TRIGGER IF EXISTS planted_inflight');
  db.exec('DROP TRIGGER IF EXISTS planted_mint');
});

afterAll(() => {
  db.close();
  segmentParser._setTestBooksDir(realBooksDir);
  rmSync(work, { recursive: true, force: true });
});

describe('T6, opened time, through the route (spec §5.5, §10)', () => {
  it('an admin, a head editor, an editor with zero rows while enforcement is off and colleagues hold rows, and a token with no users row: each leaves the record unset', async () => {
    for (const user of [asUser(admin), asUser(head, [BOOK]), asUser(zero), ghost]) {
      const r = await serve(user, 'm94001');
      expect(r.status).toBe(200);
      expect(everySegmentHasBase(r.body)).toBe(true);
    }
    expect(opening('m94001')).toBeUndefined();
    // the predicate never creates a row (CLAUDE.md § Auth)
    expect(db.prepare("SELECT provider_id FROM users WHERE provider_id = 'p-ghost'").all()).toEqual(
      []
    );
    // the fail-open neighbour would have let the zero-row editor through, so the "no" is the predicate's
    expect(userService.isAssignmentEnforced(BOOK)).toBe(false);
    expect(userService.hasChapterAccess(zero.id, BOOK, 1)).toBe(true);
    // positive control: an assigned editor's serve sets it
    moduleOpenings._setTestClock(() => T0);
    expect((await serve(asUser(ed1), 'm94001')).status).toBe(200);
    expect(opening('m94001')).toEqual({
      book: BOOK,
      chapter: 1,
      module_id: 'm94001',
      opened_at_ms: T0,
      inflight_count: 0,
    });
  });

  it('a visitor gets 403 from the route, and records nothing', async () => {
    const visitor = {
      id: 'ms-oid-visitor',
      username: 'gestur@skoli.example',
      role: 'viewer',
      books: [],
    };
    const r = await invokeChain(router, 'get', ROUTE, {
      params: { book: BOOK, chapter: '1', moduleId: 'm94007' },
      headers: bearer(visitor),
      cookies: {},
    });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('Insufficient permissions');
    expect(opening('m94007')).toBeUndefined();
    // positive control: the same chain with an assigned editor's token
    const ok = await invokeChain(router, 'get', ROUTE, {
      params: { book: BOOK, chapter: '1', moduleId: 'm94007' },
      headers: bearer(asUser(ed1)),
      cookies: {},
    });
    expect(ok.status).toBe(200);
    expect(opening('m94007')).toBeDefined();
  });

  it("ch02's chapter-metadata opens ch02 only; ch05 opens on its own assigned serve, with its own snapshot", async () => {
    addEdit({ moduleId: 'chapter-metadata', chapter: 5, seg: 'chapter:title:ch05' });
    const metaChapters = () =>
      db
        .prepare(
          "SELECT chapter FROM module_openings WHERE module_id = 'chapter-metadata' ORDER BY chapter"
        )
        .all();
    expect(
      (await serve(asUser(ed1), 'chapter-metadata', { chapter: '2', chapterNum: 2 })).status
    ).toBe(200);
    expect(metaChapters()).toEqual([{ chapter: 2 }]);
    // ch05's row, which this serve's edit rows hold, is not in ch02's snapshot
    expect(snapshot('chapter-metadata', 2)).toEqual([]);
    const ch02First = opening('chapter-metadata', 2);
    // ed1 is not assigned ch05
    expect(
      (await serve(asUser(ed1), 'chapter-metadata', { chapter: '5', chapterNum: 5 })).status
    ).toBe(200);
    expect(metaChapters()).toEqual([{ chapter: 2 }]);
    expect(
      (await serve(asUser(ed5), 'chapter-metadata', { chapter: '5', chapterNum: 5 })).status
    ).toBe(200);
    expect(metaChapters()).toEqual([{ chapter: 2 }, { chapter: 5 }]);
    expect(snapshot('chapter-metadata', 5)).toEqual([
      { segment_id: 'chapter:title:ch05', occurrence: -1 },
    ]);
    expect(opening('chapter-metadata', 2)).toEqual(ch02First);
  });

  it('appendices are recorded under -1', async () => {
    expect(
      (await serve(asUser(ed1), 'm94009', { chapter: 'appendices', chapterNum: -1 })).status
    ).toBe(200);
    expect(
      db.prepare("SELECT chapter FROM module_openings WHERE module_id = 'm94009'").all()
    ).toEqual([{ chapter: -1 }]);
  });

  it('chapter 0 cannot be served, so an assignment row for it opens nothing', async () => {
    // the row this case is about really exists (assignChapter is INSERT OR IGNORE)
    expect(
      db
        .prepare('SELECT chapter FROM user_chapter_assignments WHERE user_id = ? AND book_slug = ?')
        .all(ch00.id, BOOK)
    ).toEqual([{ chapter: 0 }]);
    const r = await invokeChain(router, 'get', ROUTE, {
      params: { book: BOOK, chapter: '0', moduleId: 'm94000' },
      headers: bearer(asUser(ch00)),
      cookies: {},
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Invalid chapter: 0');
    expect(db.prepare("SELECT * FROM module_openings WHERE module_id = 'm94000'").all()).toEqual(
      []
    );
    // positive control: the same member, assigned chapter 1, opens a chapter-1 unit through the chain
    userService.assignChapter(ch00.id, BOOK, 1);
    const ok = await invokeChain(router, 'get', ROUTE, {
      params: { book: BOOK, chapter: '1', moduleId: 'm94010' },
      headers: bearer(asUser(ch00)),
      cookies: {},
    });
    expect(ok.status).toBe(200);
    expect(opening('m94010')).toBeDefined();
  });

  it('after it is set, a serve by anyone leaves it byte-identical', async () => {
    moduleOpenings._setTestClock(() => T0);
    addEdit({ moduleId: 'm94008', seg: 'm94008:para:a' });
    expect((await serve(asUser(ed1), 'm94008')).status).toBe(200);
    const first = { row: opening('m94008'), snap: snapshot('m94008') };
    expect(first.snap).toEqual([{ segment_id: 'm94008:para:a', occurrence: -1 }]);
    moduleOpenings._setTestClock(() => T0 + 60_000);
    addEdit({ moduleId: 'm94008', seg: 'm94008:para:b', editor: 'ed-b' });
    for (const user of [
      asUser(admin),
      asUser(head, [BOOK]),
      asUser(zero),
      ghost,
      asUser(ed1),
      asUser(ed1b),
      asUser(ed5),
    ]) {
      expect((await serve(user, 'm94008')).status).toBe(200);
    }
    expect({ row: opening('m94008'), snap: snapshot('m94008') }).toEqual(first);
    expect(first.row.opened_at_ms).toBe(T0);
    // control: the clock really moved, so a re-write would have shown
    expect((await serve(asUser(ed1b), 'm94011')).status).toBe(200);
    expect(opening('m94011').opened_at_ms).toBe(T0 + 60_000);
  });

  it('a failure in the snapshot insert leaves no opening row and answers 503; the next serve records it afresh', async () => {
    addEdit({ moduleId: 'm94003', seg: 'm94003:para:a' });
    db.exec(
      "CREATE TRIGGER planted_inflight BEFORE INSERT ON module_opening_inflight BEGIN SELECT RAISE(ABORT, 'planted fault'); END"
    );
    expect(await serve(asUser(ed1), 'm94003')).toEqual({
      status: 503,
      body: { error: 'OPENING_UNRECORDED', message: moduleOpenings.OPENING_UNRECORDED.message },
    });
    expect(opening('m94003')).toBeUndefined();
    expect(snapshot('m94003')).toEqual([]);
    addEdit({ moduleId: 'm94003', seg: 'm94003:para:b', editor: 'ed-b' });
    db.exec('DROP TRIGGER planted_inflight');
    expect((await serve(asUser(ed1), 'm94003')).status).toBe(200);
    // taken at this serve, not carried from the failed one
    expect(snapshot('m94003')).toEqual([
      { segment_id: 'm94003:para:a', occurrence: -1 },
      { segment_id: 'm94003:para:b', occurrence: -1 },
    ]);
  });

  it('a failed mint on a serve that meets the predicate answers 503 with no opening row; on any other serve it stays fail-soft', async () => {
    const errorSpy = vi.spyOn(log, 'error');
    // decision 10: a trigger, not a read-only handle, so only the mint fails
    db.exec(
      "CREATE TRIGGER planted_mint BEFORE INSERT ON served_text_versions BEGIN SELECT RAISE(ABORT, 'planted mint fault'); END"
    );
    const versions = () =>
      db.prepare("SELECT id FROM served_text_versions WHERE module_id = 'm94004'").all();
    const other = await serve(asUser(admin), 'm94004');
    expect(other.status).toBe(200);
    expect(everySegmentHasBase(other.body)).toBe(true);
    expect(versions()).toEqual([]);
    const messages = () => errorSpy.mock.calls.map(([o, m]) => ({ o, m }));
    // the mint did fail on the admin's serve, and that serve was not refused
    expect(messages().some(({ m }) => /Served-version mint failed/.test(m))).toBe(true);
    expect(messages().some(({ m }) => /OPENING_UNRECORDED/.test(m))).toBe(false);
    errorSpy.mockClear();
    expect(await serve(asUser(ed1), 'm94004')).toEqual({
      status: 503,
      body: { error: 'OPENING_UNRECORDED', message: moduleOpenings.OPENING_UNRECORDED.message },
    });
    expect(opening('m94004')).toBeUndefined();
    expect(messages().some(({ m }) => /Served-version mint failed/.test(m))).toBe(true);
    expect(messages().some(({ o, m }) => /OPENING_UNRECORDED/.test(m) && o.cause === 'mint')).toBe(
      true
    );
    db.exec('DROP TRIGGER planted_mint');
    expect((await serve(asUser(ed1), 'm94004')).status).toBe(200);
    expect(opening('m94004')).toBeDefined();
    expect(versions().length).toBeGreaterThan(0);
  });

  it('a layerless study module opens like any other: nothing to mint, nothing refused at the serve', async () => {
    const r = await serve(asUser(ed1), 'm94005');
    expect(r.status).toBe(200);
    expect(r.body.segments.length).toBeGreaterThan(0);
    expect(r.body.segments.filter((s) => 'baseSha256' in s)).toEqual([]);
    expect(opening('m94005').inflight_count).toBe(0);
  });

  it('a book off the study allowlist never opens', async () => {
    expect((await serve(asUser(ed1), 'm94006', { book: 'liffraedi-2e' })).status).toBe(200);
    expect(db.prepare("SELECT * FROM module_openings WHERE book = 'liffraedi-2e'").all()).toEqual(
      []
    );
    // control: the chemistry openings above are in the same table
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM module_openings WHERE book = ?').get(BOOK).n
    ).toBeGreaterThan(0);
  });

  it('the row decides, not the role: an admin who holds a row opens the unit; a viewer who holds one is stopped by requireRole first', async () => {
    moduleOpenings._setTestClock(() => T0);
    expect((await serve(asUser(adminRow), 'm94012')).status).toBe(200);
    expect(opening('m94012')).toEqual({
      book: BOOK,
      chapter: 1,
      module_id: 'm94012',
      opened_at_ms: T0,
      inflight_count: 0,
    });
    const req = (user) => ({
      params: { book: BOOK, chapter: '1', moduleId: 'm94013' },
      headers: bearer(user),
      cookies: {},
    });
    const viewer = await invokeChain(router, 'get', ROUTE, req(asUser(viewerRow)));
    expect(viewer.status).toBe(403);
    expect(viewer.body.error).toBe('Insufficient permissions');
    expect(opening('m94013')).toBeUndefined();
    // control: the same chain with the admin who holds a row, so the viewer's no is requireRole's
    expect((await invokeChain(router, 'get', ROUTE, req(asUser(adminRow)))).status).toBe(200);
    expect(opening('m94013')).toBeDefined();
  });

  // The last case of this describe: it drops the opening tables (and restores them).
  it('with the opening tables missing, an assigned serve answers 503 and a zero-row serve is answered as before', async () => {
    let assigned;
    let other;
    try {
      db.exec('DROP TABLE module_opening_inflight; DROP TABLE module_openings');
      assigned = await serve(asUser(ed1), 'm94014');
      other = await serve(asUser(zero), 'm94014');
    } finally {
      m054.up(db);
    }
    expect(assigned).toEqual({
      status: 503,
      body: { error: 'OPENING_UNRECORDED', message: moduleOpenings.OPENING_UNRECORDED.message },
    });
    // the opening lookup is never reached for a zero-row editor
    expect(other.status).toBe(200);
    expect(everySegmentHasBase(other.body)).toBe(true);
    // nothing was recorded while the tables were gone
    expect(opening('m94014')).toBeUndefined();
    // control: with the tables back, the same serve opens it
    expect((await serve(asUser(ed1), 'm94014')).status).toBe(200);
    expect(opening('m94014')).toBeDefined();
  });
});

describe('T7, the snapshot, through the route (spec §5.5, §10)', () => {
  // m94020, an m68664-style module: rows re-entered before opening (spec §5.5: "a non-empty
  // snapshot is expected").
  const S = (n) => `m94020:para:s${n}`;
  let warnSpy;
  const reattachWarns = () =>
    warnSpy.mock.calls.filter(([, msg]) => /re-attach/.test(msg)).map(([o]) => o);

  beforeAll(() => {
    addEdit({ moduleId: 'm94020', seg: S(1) }); // pending, legacy (occurrence and origin NULL)
    addEdit({
      moduleId: 'm94020',
      seg: S(2),
      status: 'approved',
      occurrence: 0,
      origin: 'editor-save',
      editor: 'ed-b',
    }); // approved, not applied
    addEdit({ moduleId: 'm94020', seg: S(3), createdAt: '2026-06-16 10:00:00' }); // older pending
    addEdit({
      moduleId: 'm94020',
      seg: S(3),
      status: 'rejected',
      createdAt: '2026-06-17 10:00:00',
      editor: 'ed-b',
    }); // newer rejected, over it
    addEdit({ moduleId: 'm94020', seg: S(4), origin: 're-attach', occurrence: 0 });
    addEdit({
      moduleId: 'm94020',
      seg: S(5),
      status: 'approved',
      appliedAt: '2026-06-12 16:00:00',
    }); // approved and applied
    // s6: no row
  });

  beforeEach(() => {
    warnSpy = vi.spyOn(log, 'warn');
  });

  it('holds exactly the segments with any in-flight edit at opening, and warns once, for the non-re-attached rows only', async () => {
    const r = await serve(asUser(ed1), 'm94020');
    expect(r.status).toBe(200);
    expect(snapshot('m94020')).toEqual([
      { segment_id: S(1), occurrence: -1 },
      { segment_id: S(2), occurrence: 0 },
      { segment_id: S(3), occurrence: -1 },
      { segment_id: S(4), occurrence: 0 },
    ]);
    expect(opening('m94020').inflight_count).toBe(4);
    // control: s5 and s6 were served, and left out
    expect(r.body.segments.map((s) => s.segmentId)).toEqual(expect.arrayContaining([S(5), S(6)]));
    // s4, re-attached, is in the snapshot and not in the warning
    expect(reattachWarns()).toEqual([
      { book: BOOK, chapter: 1, moduleId: 'm94020', segments: [S(1), S(2), S(3)] },
    ]);
    expect((await serve(asUser(ed1b), 'm94020')).status).toBe(200);
    expect(reattachWarns()).toHaveLength(1); // a later serve never warns
  });

  it('each segment stays in the snapshot after its row is approved, rejected or withdrawn', async () => {
    await serve(asUser(ed1), 'm94020'); // opens it if this it runs alone; otherwise already opened
    const before = { row: opening('m94020'), snap: snapshot('m94020') };
    // so the comparison below cannot pass on an empty record
    expect(before.snap.map((r) => r.segment_id)).toEqual([S(1), S(2), S(3), S(4)]);
    db.prepare(
      "UPDATE segment_edits SET status = 'approved', applied_at = '2026-11-03 12:00:00' WHERE module_id = 'm94020' AND segment_id = ?"
    ).run(S(1));
    db.prepare(
      "UPDATE segment_edits SET status = 'rejected' WHERE module_id = 'm94020' AND segment_id = ?"
    ).run(S(2));
    db.prepare(
      "DELETE FROM segment_edits WHERE module_id = 'm94020' AND segment_id = ? AND status = 'pending'"
    ).run(S(3)); // withdrawn
    db.prepare(
      "UPDATE segment_edits SET status = 'approved', applied_at = '2026-11-03 12:00:00' WHERE module_id = 'm94020' AND segment_id = ?"
    ).run(S(4));
    let last;
    for (const user of [asUser(ed1), asUser(admin)]) {
      last = await serve(user, 'm94020');
      expect(last.status).toBe(200);
    }
    expect({ row: opening('m94020'), snap: snapshot('m94020') }).toEqual(before);
    // control: a route that recomputed the snapshot from today's rows would have shown it
    expect(
      moduleOpenings.snapshotRows(last.body.segments, segmentEditor.getModuleEdits(BOOK, 'm94020'))
        .rows
    ).toEqual([]);
  });

  it('a module opened with only a re-attached in-flight row writes no warning', async () => {
    addEdit({ moduleId: 'm94021', seg: 'm94021:para:x', origin: 're-attach', occurrence: 0 });
    addEdit({ moduleId: 'm94022', seg: 'm94022:para:y' });
    expect((await serve(asUser(ed1), 'm94021')).status).toBe(200);
    expect((await serve(asUser(ed1), 'm94022')).status).toBe(200);
    // m94022 is the positive control, in the same it: the spy is live and the warning fires
    expect(reattachWarns().map((o) => o.moduleId)).toEqual(['m94022']);
    expect(snapshot('m94021')).toEqual([{ segment_id: 'm94021:para:x', occurrence: 0 }]);
  });
});
