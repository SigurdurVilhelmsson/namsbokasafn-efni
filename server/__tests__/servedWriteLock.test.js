/**
 * Another process's write lock: a save, an accept and a propagation wait it out, and an unchanged
 * re-serve never waits on it at all (G1.1; spec §5.4 step 3, §5.6 step 6, §5.6 Accept, §5.6
 * Propagation targets; PR1 review C2).
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
 * Why the serve must stay DEFERRED: re-serving unchanged text writes nothing and never waits on
 * another writer (spec §5.4 step 3). Case (c) fails if mintVersions takes the write lock up front.
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

// Env BEFORE any server require: resolveDbPath() is read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'served-write-lock-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;

const Database = require('better-sqlite3');
const { sha256Text } = require('../lib/servedText');
const { writeModule } = require('./helpers/servedFixture');

const CHEM = 'efnafraedi-2e';
const SAVE = Object.freeze({ book: CHEM, chapter: 1, moduleId: 'm95001' });
const ACCEPT = Object.freeze({ book: CHEM, chapter: 1, moduleId: 'm95002' });
const SERVE = Object.freeze({ book: CHEM, chapter: 1, moduleId: 'm95003' });
// Case (d): a source and one target sharing an English sentence no other fixture module carries.
const PROP_SOURCE = Object.freeze({ book: CHEM, chapter: 2, moduleId: 'm95004' });
const PROP_TARGET = Object.freeze({ book: CHEM, chapter: 2, moduleId: 'm95005' });
const PROP_EN = 'A sentence that recurs in two modules.';

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

let lockRun = 0;
/**
 * Runs `fn` synchronously while the holder process has the write lock. Resolves with what fn
 * returned or threw, and `releasingWhenDone`: whether the holder had begun releasing by the time
 * fn returned. Rejects if the holder never locked or did not exit cleanly.
 */
function whileLocked(holdMs, fn) {
  const releasing = path.join(work, `releasing-${++lockRun}`);
  return new Promise((resolve, reject) => {
    const holder = spawn(process.execPath, [HOLDER, dbPath, String(holdMs), releasing], {
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
        result.value = fn();
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
});
