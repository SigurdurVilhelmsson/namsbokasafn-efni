/**
 * Another process's write lock: a save, an accept, a propagation, a changed serve and the opening
 * it records wait it out, and an unchanged re-serve never waits on it at all (G1.1 + G1.2; spec
 * §5.4 steps 3–4, §5.5, §5.6 step 6, §5.6 Accept, §5.6 Propagation targets; PR1 review C2; PR2
 * plan amendment 2026-11-05, Task 3b).
 *
 * Why the save and the accept must open IMMEDIATE: a DEFERRED transaction whose first statement is
 * a read already holds a read lock when its first write asks for the write lock, and SQLite does
 * not run the busy handler for that upgrade. So it returns SQLITE_BUSY at once instead of waiting
 * out the connection's busy timeout, and the editor's save or accept answers 500. saveOnServedBase
 * opens with mintVersions' SELECT, and acceptSegment's mint-then-INSERT does the same.
 * createPropagatedEdits opens with its findEdit SELECT and then supersedes, mints and inserts, so it
 * needs the same (case (d)). One holder of that lock in production is backup-db.sh's
 * wal_checkpoint(TRUNCATE).
 *
 * Why the serve's mint has two passes: re-serving unchanged text writes nothing and never waits on
 * another writer (spec §5.4 step 3), so mintVersions first reads every row with no write lock and
 * returns when it finds them all. Case (c) fails if the mint takes the write lock up front. Only a
 * changed serve, with a row missing, runs the insert pass, and that pass opens IMMEDIATE for the
 * same reason the save does: a deferred insert would fail at once with SQLITE_BUSY, the mint would
 * report mintOk false, and an assigned editor's first serve would answer 503 OPENING_UNRECORDED
 * where waiting would have recorded the opening. Case (e) is the mint, case (f) is that serve
 * through the real module handler, and case (g) is the insert pass's re-read: a row another
 * process minted while the serve waited is returned, not inserted a second time.
 *
 * Why the opening opens IMMEDIATE too: on a unit whose served versions already exist (every
 * chemistry unit PR1 has served), the mint reads and returns without the write lock, so
 * recordOpening's transaction is the first write to meet a held lock. Case (h) is that serve; a
 * deferred recordOpening that reads before its INSERT fails it at once with SQLITE_BUSY and the
 * serve answers 503 OPENING_UNRECORDED (cause step). In case (f) the mint's insert pass has already
 * waited, so the opening runs after the release and cannot show this.
 *
 * Why a child process: better-sqlite3 is synchronous, so a lock held by a second connection in this
 * process could never be released while the first one waits on it. helpers/writeLockHolder.cjs
 * takes BEGIN IMMEDIATE on the same file, prints "locked", and writes a "releasing" marker file
 * BEFORE it commits. The marker is the ordering witness, read on disk with no clock: if it exists
 * when a call returns, the call ran past the release (it waited); if not, the call ran entirely
 * while the lock was held.
 *
 * The connections are the services' own, opened exactly as in production, so the busy timeout
 * every case depends on is the production one; the first case reads it and sets nothing.
 */
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOLDER = path.join(__dirname, 'helpers', 'writeLockHolder.cjs');

// Env BEFORE any server require: resolveDbPath() is read at module load, and auth.js (required by
// the route, case (f)) refuses to load without JWT_SECRET. userService.findByProviderId, which the
// route reaches from PR2, opens resolveDbPath() too, so nothing here reaches pipeline-output/.
const work = mkdtempSync(path.join(tmpdir(), 'served-write-lock-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { sha256Text } = require('../lib/servedText');
const { writeModule, handlerFor, invoke } = require('./helpers/servedFixture');

const CHEM = 'efnafraedi-2e';
const SAVE = Object.freeze({ book: CHEM, chapter: 1, moduleId: 'm95001' });
const ACCEPT = Object.freeze({ book: CHEM, chapter: 1, moduleId: 'm95002' });
const SERVE = Object.freeze({ book: CHEM, chapter: 1, moduleId: 'm95003' });
// Case (d): a source and one target sharing an English sentence no other fixture module carries.
const PROP_SOURCE = Object.freeze({ book: CHEM, chapter: 2, moduleId: 'm95004' });
const PROP_TARGET = Object.freeze({ book: CHEM, chapter: 2, moduleId: 'm95005' });
const PROP_EN = 'A sentence that recurs in two modules.';
// Case (e): served once, then its b changes, so the re-serve is a changed serve with one row missing.
const CHANGED = Object.freeze({ book: CHEM, chapter: 1, moduleId: 'm95006' });
// Case (f): never served, so the assigned editor's serve is its first, and a changed serve.
const OPEN = Object.freeze({ book: CHEM, chapter: 1, moduleId: 'm95007' });
// Case (g): never served; the holder mints a's row inside its lock.
const RACE = Object.freeze({ book: CHEM, chapter: 1, moduleId: 'm95008' });
// Case (h): served once before the lock and never opened, so the assigned editor's serve under the
// lock is its first and an unchanged serve.
const MINTED = Object.freeze({ book: CHEM, chapter: 1, moduleId: 'm95009' });
// The holder's row carries this as its en_text: the key is the hashes, not the text, so the serve
// matches it, and the mark shows whose row the serve returned.
const HOLDER_MARK = 'minted by the lock holder';

// A lock a save or an accept must wait out: released by the holder's own timer, since the waiting
// call blocks this process and cannot signal.
const WAIT_HOLD_MS = 400;
// A lock held far longer than an unchanged serve takes; this process releases it early, as soon
// as the serve returns, so the green run is quick.
const LONG_HOLD_MS = 2000;

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let servedVersions;
let servedEdit;
let acceptance;
let propagation;
let concordance;
let userService;
let getModule;
let opener;
let db;

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  segmentParser = require('../services/segmentParser');
  segmentEditor = require('../services/segmentEditorService');
  servedVersions = require('../services/servedVersions');
  servedEdit = require('../services/servedEdit');
  acceptance = require('../services/acceptanceService');
  propagation = require('../services/propagationService');
  concordance = require('../services/concordanceService');
  userService = require('../services/userService');
  getModule = handlerFor(require('../routes/segment-editor'), 'get', '/:book/:chapter/:moduleId');
  realBooksDir = segmentParser.BOOKS_DIR;
  root = path.join(work, 'books');
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);
  db = segmentEditor.getDb();

  for (const { moduleId } of [SAVE, ACCEPT]) {
    writeModule(root, {
      book: CHEM,
      chapterDir: 'ch01',
      moduleId,
      en: [[`${moduleId}:para:a`, 'EN a']],
      mt: [[`${moduleId}:para:a`, 'IS a']],
    });
  }
  writeModule(root, {
    book: CHEM,
    chapterDir: 'ch01',
    moduleId: SERVE.moduleId,
    en: [
      [`${SERVE.moduleId}:para:a`, 'EN a'],
      [`${SERVE.moduleId}:para:b`, 'EN b'],
    ],
    mt: [
      [`${SERVE.moduleId}:para:a`, 'IS a'],
      [`${SERVE.moduleId}:para:b`, 'IS b'],
    ],
  });
  for (const { moduleId } of [CHANGED, OPEN, RACE, MINTED]) {
    writeModule(root, {
      book: CHEM,
      chapterDir: 'ch01',
      moduleId,
      en: [
        [`${moduleId}:para:a`, 'EN a'],
        [`${moduleId}:para:b`, 'EN b'],
      ],
      mt: [
        [`${moduleId}:para:a`, 'IS a'],
        [`${moduleId}:para:b`, 'IS b'],
      ],
    });
  }
  // Cases (f) and (h): a users row holding a user_chapter_assignments row for chapter 1, written by
  // userService's own writers on its own connection, as the admin page writes them.
  opener = userService.createUser({
    providerId: 'p-lock-opener',
    providerUsername: 'p-lock-opener@skoli.example',
    email: 'p-lock-opener@skoli.example',
    role: 'editor',
  });
  userService.assignChapter(opener.id, CHEM, 1);
  for (const [{ moduleId }, is] of [
    [PROP_SOURCE, 'IS uppruni'],
    [PROP_TARGET, 'IS mark'],
  ]) {
    writeModule(root, {
      book: CHEM,
      chapterDir: 'ch02',
      moduleId,
      en: [[`${moduleId}:para:a`, PROP_EN]],
      mt: [[`${moduleId}:para:a`, is]],
    });
  }
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  segmentEditor._setTestBooksDir(realBooksDir);
  segmentEditor.getDb().close();
  segmentEditor._setTestDb(null);
  propagation.getDb().close();
  propagation._setTestDb(null);
  rmSync(work, { recursive: true, force: true });
});

const load = (key) => segmentParser.loadModuleForEditing(key.book, key.chapter, key.moduleId);
const versionRow = (id) => db.prepare('SELECT * FROM served_text_versions WHERE id = ?').get(id);
const allVersions = () => db.prepare('SELECT * FROM served_text_versions ORDER BY id').all();
const describeError = (err) => (err ? `${err.code}: ${err.message}` : null);
const versionsOf = (moduleId) =>
  db.prepare('SELECT * FROM served_text_versions WHERE module_id = ? ORDER BY id').all(moduleId);
const sqlText = (v) => `'${String(v).replace(/'/g, "''")}'`;
const openingsOf = (moduleId) =>
  db
    .prepare(
      'SELECT book, chapter, module_id, inflight_count FROM module_openings WHERE module_id = ?'
    )
    .all(moduleId);
// The module GET as the assigned editor (cases (f) and (h)), past the middleware.
const openerRequest = (moduleId) => ({
  params: { book: CHEM, chapter: '1', moduleId },
  chapterNum: 1,
  user: {
    id: opener.provider_id,
    username: opener.provider_username,
    role: 'editor',
    books: [],
  },
});

let lockRun = 0;
/**
 * Runs `fn` synchronously while the holder process has the write lock. Resolves with what fn
 * returned or threw, and `releasingWhenDone`: whether the holder had begun releasing by the time
 * fn returned. fn is passed `released()`, which reads the same witness at any point inside fn.
 * Rejects if the holder never locked or did not exit cleanly. `sqlInsideLock`, when given, runs in
 * the holder's transaction, committed only at its release.
 */
function whileLocked(holdMs, fn, sqlInsideLock = null) {
  const releasing = path.join(work, `releasing-${++lockRun}`);
  const args = [HOLDER, dbPath, String(holdMs), releasing];
  if (sqlInsideLock) args.push(sqlInsideLock);
  return new Promise((resolve, reject) => {
    const holder = spawn(process.execPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    let result = null;
    holder.stderr.on('data', (d) => {
      stderr += d;
    });
    holder.stdout.once('data', (chunk) => {
      if (String(chunk).trim() !== 'locked') return;
      result = { value: undefined, error: null };
      try {
        result.value = fn(() => existsSync(releasing));
      } catch (err) {
        result.error = err;
      }
      result.releasingWhenDone = existsSync(releasing);
      holder.stdin.end(); // release now, if the holder's timer has not already
    });
    holder.on('error', reject);
    holder.on('close', (code) => {
      if (code === 0 && result !== null) resolve(result);
      else reject(new Error(`lock holder exited ${code}, locked: ${result !== null}. ${stderr}`));
    });
  });
}

describe('another process holds the write lock (PR1 review C2)', () => {
  it('the production connection waits far longer than a save is made to wait here', () => {
    // segmentEditorService and acceptanceService both open the file with `new Database(DB_PATH)`
    // and no options; this reads the timeout that gives, so (a) and (b) test the real one.
    expect(db.pragma('busy_timeout', { simple: true })).toBeGreaterThan(WAIT_HOLD_MS * 4);
  });

  it('(a) a save started while the lock is held waits for it, then stores the row and its version', async () => {
    const { moduleId } = SAVE;
    const segmentId = `${moduleId}:para:a`;
    const baseSha256 = sha256Text(load(SAVE).segments[0].is);
    const run = await whileLocked(WAIT_HOLD_MS, () =>
      servedEdit.saveOnServedBase({
        ...SAVE,
        segmentId,
        editedContent: 'IS a breytt',
        editorId: 'u1',
        editorUsername: 'E',
        origin: 'editor-save',
        requireEcho: true,
        baseSha256,
      })
    );
    expect(describeError(run.error)).toBeNull();
    // The control: the lock was really held, and the save ran past its release.
    expect(run.releasingWhenDone).toBe(true);
    expect(run.value.outcome).toBe('inserted');
    const row = db.prepare('SELECT * FROM segment_edits WHERE id = ?').get(run.value.editId);
    expect(row).toMatchObject({
      module_id: moduleId,
      segment_id: segmentId,
      original_content: 'IS a',
      edited_content: 'IS a breytt',
      served_version_id: run.value.servedVersionId,
      occurrence: 0,
      origin: 'editor-save',
    });
    expect(versionRow(run.value.servedVersionId)).toMatchObject({
      module_id: moduleId,
      segment_id: segmentId,
      occurrence: 0,
      is_text: 'IS a',
    });
  });

  it('(b) an accept with an occurrence started while the lock is held waits for it, then records it', async () => {
    const { moduleId } = ACCEPT;
    const segmentId = `${moduleId}:para:a`;
    const run = await whileLocked(WAIT_HOLD_MS, () =>
      acceptance.acceptSegment({
        ...ACCEPT,
        segmentId,
        acceptedContent: 'IS a',
        userId: 'u1',
        username: 'E',
        occurrence: 0,
      })
    );
    expect(describeError(run.error)).toBeNull();
    expect(run.releasingWhenDone).toBe(true);
    expect(run.value.alreadyAccepted).toBe(false);
    expect(run.value.acceptance).toMatchObject({
      module_id: moduleId,
      segment_id: segmentId,
      accepted_content: 'IS a',
      occurrence: 0,
      status: 'active',
    });
    expect(versionRow(run.value.acceptance.served_version_id)).toMatchObject({
      module_id: moduleId,
      segment_id: segmentId,
      occurrence: 0,
      is_text: 'IS a',
    });
  });

  it('(c) re-serving an unchanged module while the lock is held writes nothing and does not wait', async () => {
    const first = servedVersions.recordServe(db, load(SERVE), { ...SERVE });
    expect(first.mintOk).toBe(true);
    expect(first.servedVersionIds).toHaveLength(2);
    const before = allVersions();

    const probe = new Database(dbPath, { timeout: 0 });
    let run;
    try {
      run = await whileLocked(LONG_HOLD_MS, () => {
        const again = servedVersions.recordServe(db, load(SERVE), { ...SERVE });
        // The control, inside the same window: a writer that needs the lock now is refused, so the
        // lock really is held while the serve runs.
        let probeCode = null;
        try {
          probe.exec('BEGIN IMMEDIATE');
          probe.exec('ROLLBACK');
        } catch (err) {
          probeCode = err.code;
        }
        return { again, probeCode };
      });
    } finally {
      probe.close();
    }

    expect(describeError(run.error)).toBeNull();
    expect(run.value.probeCode).toBe('SQLITE_BUSY');
    // Never waited on the holder: it had not begun releasing when the serve and the probe returned.
    expect(run.releasingWhenDone).toBe(false);
    expect(run.value.again.mintOk).toBe(true);
    expect(run.value.again.servedVersionIds).toEqual(first.servedVersionIds);
    expect(allVersions()).toEqual(before);
  });

  it('(d) a propagation started while the lock is held waits for it, then writes its target row and version', async () => {
    // createPropagatedEdits writes on the connection the route passes it, propagationService's
    // own, opened as in production; this reads that connection's timeout and sets nothing.
    const conn = propagation.getDb();
    expect(conn.pragma('busy_timeout', { simple: true })).toBeGreaterThan(WAIT_HOLD_MS * 4);
    const sourceId = `${PROP_SOURCE.moduleId}:para:a`;
    const targetId = `${PROP_TARGET.moduleId}:para:a`;
    // As POST /propagate does it: find the occurrences, then write them, both under the lock.
    const run = await whileLocked(WAIT_HOLD_MS, () => {
      const occurrences = propagation.findOccurrences(CHEM, concordance.normalizeEn(PROP_EN), {
        excludeModuleId: PROP_SOURCE.moduleId,
        excludeSegmentId: sourceId,
      });
      return propagation.createPropagatedEdits(conn, {
        book: CHEM,
        editorId: 'u1',
        editorUsername: 'E',
        propagatedText: 'IS fjölgað',
        note: 'Sjálfvirk fjölgun',
        occurrences,
        sourceEn: PROP_EN,
      });
    });
    expect(describeError(run.error)).toBeNull();
    expect(run.releasingWhenDone).toBe(true);
    expect(run.value).toEqual({
      created: [{ moduleId: PROP_TARGET.moduleId, segmentId: targetId }],
      skipped: [],
    });
    const rows = db
      .prepare('SELECT * FROM segment_edits WHERE book = ? AND module_id IN (?, ?)')
      .all(CHEM, PROP_SOURCE.moduleId, PROP_TARGET.moduleId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      chapter: PROP_TARGET.chapter,
      module_id: PROP_TARGET.moduleId,
      segment_id: targetId,
      original_content: 'IS mark',
      edited_content: 'IS fjölgað',
      status: 'pending',
      occurrence: 0,
      origin: 'propagation',
    });
    expect(versionRow(rows[0].served_version_id)).toMatchObject({
      chapter: PROP_TARGET.chapter,
      module_id: PROP_TARGET.moduleId,
      segment_id: targetId,
      occurrence: 0,
      en_text: PROP_EN,
      is_text: 'IS mark',
    });
  });

  it('(e) a changed serve started while the lock is held waits for it, then mints its new row', async () => {
    const { moduleId } = CHANGED;
    const first = servedVersions.recordServe(db, load(CHANGED), { ...CHANGED });
    expect(first.mintOk).toBe(true);
    expect(first.servedVersionIds).toHaveLength(2);
    const before = allVersions();
    // b's Icelandic changes, so its row is missing; a's is unchanged and already minted.
    writeModule(root, {
      book: CHEM,
      chapterDir: 'ch01',
      moduleId,
      en: [
        [`${moduleId}:para:a`, 'EN a'],
        [`${moduleId}:para:b`, 'EN b'],
      ],
      mt: [
        [`${moduleId}:para:a`, 'IS a'],
        [`${moduleId}:para:b`, 'IS b breytt'],
      ],
    });

    const run = await whileLocked(WAIT_HOLD_MS, () =>
      servedVersions.recordServe(db, load(CHANGED), { ...CHANGED })
    );
    expect(describeError(run.error)).toBeNull();
    // Both together, so a failure shows whether the mint failed AND whether it returned before
    // the release (it did not wait) or after it.
    expect({ mintOk: run.value.mintOk, releasingWhenDone: run.releasingWhenDone }).toEqual({
      mintOk: true,
      releasingWhenDone: true,
    });
    const [a, b] = run.value.servedVersionIds;
    expect(a).toEqual(first.servedVersionIds[0]);
    expect(before.map((r) => r.id)).not.toContain(b.servedVersionId);
    expect(versionRow(b.servedVersionId)).toMatchObject({
      module_id: moduleId,
      segment_id: `${moduleId}:para:b`,
      occurrence: 0,
      is_text: 'IS b breytt',
    });
    expect(allVersions()).toEqual([...before, versionRow(b.servedVersionId)]);
  });

  it("(f) an assigned editor's first serve of a chemistry unit, started while the lock is held, waits for it and records the opening", async () => {
    const { moduleId } = OPEN;
    const req = openerRequest(moduleId);
    expect(openingsOf(moduleId)).toEqual([]);
    // The handler is synchronous, so it has answered by the time fn returns. OPEN has no rows yet,
    // so the serve's mint runs its insert pass, which waits out the lock: this is the mint's wait
    // through the route. The predicate and the opening run after that wait, so after the release,
    // and never meet the lock here; case (h) is the opening's own wait.
    const run = await whileLocked(WAIT_HOLD_MS, () => invoke(getModule, req));
    expect(describeError(run.error)).toBeNull();
    const response = await run.value;
    expect({
      status: response.status,
      error: response.body.error,
      releasingWhenDone: run.releasingWhenDone,
    }).toEqual({ status: 200, error: undefined, releasingWhenDone: true });
    expect(openingsOf(moduleId)).toEqual([
      { book: CHEM, chapter: 1, module_id: moduleId, inflight_count: 0 },
    ]);
    expect(response.body.segments.map((s) => typeof s.baseSha256)).toEqual(['string', 'string']);
    expect(versionsOf(moduleId).map((r) => [r.segment_id, r.is_text])).toEqual([
      [`${moduleId}:para:a`, 'IS a'],
      [`${moduleId}:para:b`, 'IS b'],
    ]);
  });

  it('(g) a row another process minted while the serve waited is returned, not inserted a second time', async () => {
    const { moduleId } = RACE;
    const [rowA] = servedVersions.annotateServed(load(RACE), { ...RACE }).rows;
    const columns = [
      rowA.book,
      rowA.chapter,
      rowA.moduleId,
      rowA.segmentId,
      rowA.occurrence,
      rowA.enSha256,
      rowA.isSha256,
      rowA.layer,
      HOLDER_MARK,
      rowA.isText,
    ].map((v) => (typeof v === 'number' ? String(v) : sqlText(v)));
    // Inside the holder's lock, so it commits only at the release: the serve's read pass cannot see
    // it, and its insert pass, which waits for the lock, meets it on its re-read.
    const insertA = `INSERT INTO served_text_versions (book, chapter, module_id, segment_id,
      occurrence, en_sha256, is_sha256, layer, en_text, is_text) VALUES (${columns.join(', ')})`;
    expect(versionsOf(moduleId)).toEqual([]);

    const run = await whileLocked(
      WAIT_HOLD_MS,
      () => servedVersions.recordServe(db, load(RACE), { ...RACE }),
      insertA
    );
    expect(describeError(run.error)).toBeNull();
    expect({ mintOk: run.value.mintOk, releasingWhenDone: run.releasingWhenDone }).toEqual({
      mintOk: true,
      releasingWhenDone: true,
    });
    const [a, b] = run.value.servedVersionIds;
    // The control: the holder's row exists, and it is the one the serve returned for a.
    expect(versionRow(a.servedVersionId)).toMatchObject({
      segment_id: `${moduleId}:para:a`,
      en_text: HOLDER_MARK,
    });
    expect(versionsOf(moduleId).map((r) => [r.id, r.segment_id])).toEqual([
      [a.servedVersionId, `${moduleId}:para:a`],
      [b.servedVersionId, `${moduleId}:para:b`],
    ]);
  });

  it("(h) an assigned editor's first serve of a unit whose versions already exist, started while the lock is held, waits for it and records the opening", async () => {
    const { moduleId } = MINTED;
    // Served before the lock, as every chemistry unit PR1 served already is, and not opened: that
    // serve was not the assigned editor's.
    const first = servedVersions.recordServe(db, load(MINTED), { ...MINTED });
    expect(first.mintOk).toBe(true);
    expect(first.servedVersionIds).toHaveLength(2);
    const before = allVersions();
    expect(openingsOf(moduleId)).toEqual([]);
    const req = openerRequest(moduleId);

    const run = await whileLocked(WAIT_HOLD_MS, (released) => {
      // The control, inside the same window: the mint the handler is about to run returns while
      // the holder still has the lock (case (c)), so a wait in the handler is not the mint's.
      const mint = servedVersions.recordServe(db, load(MINTED), { ...MINTED });
      const releasedAfterMint = released();
      return { mint, releasedAfterMint, response: invoke(getModule, req) };
    });
    expect(describeError(run.error)).toBeNull();
    expect({
      mintOk: run.value.mint.mintOk,
      releasedAfterMint: run.value.releasedAfterMint,
    }).toEqual({ mintOk: true, releasedAfterMint: false });
    const response = await run.value.response;
    // All three together, so a red run shows a 503 (and its code) beside whether the handler
    // returned before the release (the opening did not wait) or after it.
    expect({
      status: response.status,
      error: response.body.error,
      releasingWhenDone: run.releasingWhenDone,
    }).toEqual({ status: 200, error: undefined, releasingWhenDone: true });
    expect(openingsOf(moduleId)).toEqual([
      { book: CHEM, chapter: 1, module_id: moduleId, inflight_count: 0 },
    ]);
    // Neither mint wrote a row, so the opening was the serve's only write.
    expect(allVersions()).toEqual(before);
    expect(response.body.segments.map((s) => typeof s.baseSha256)).toEqual(['string', 'string']);
  });
});
