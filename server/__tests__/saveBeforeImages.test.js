/**
 * A save returns its before-image and the rows it superseded (G1.2; spec §5.9, §5.8; plan Task 15,
 * decisions 44, 46, 51). The keys are additive: every existing key and every write is unchanged,
 * and Task 21 turns these into research events.
 *
 * On a database built by every real migration (freshMigratedDb). Every books root is an empty or
 * temp directory, so the first-edit MT lock writes nothing and nothing under books/ is touched.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, rmSync } from 'fs';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { writeModule } = require('./helpers/servedFixture');
const built = freshMigratedDb();
// Before any service loads: a service that resolves the database path at load finds the temp file.
process.env.SESSIONS_DB_PATH = built.path;

const segmentEditor = require('../services/segmentEditorService');
const acceptanceService = require('../services/acceptanceService');
const segmentParser = require('../services/segmentParser');
const servedEdit = require('../services/servedEdit');

const db = built.db;
let root;
let realBooksDir;

beforeAll(() => {
  segmentEditor._setTestDb(db);
  acceptanceService._setTestDb(db);
  realBooksDir = segmentParser.BOOKS_DIR;
  root = mkdtempSync(path.join(tmpdir(), 'save-before-images-'));
  segmentEditor._setTestBooksDir(root);
  segmentParser._setTestBooksDir(root);
});

afterAll(() => {
  segmentEditor._setTestBooksDir(realBooksDir);
  segmentParser._setTestBooksDir(realBooksDir);
  segmentEditor._setTestDb(null);
  acceptanceService._setTestDb(null);
  db.close();
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec('DELETE FROM segment_acceptances; DELETE FROM segment_edits;');
});

const rowOf = (id) => db.prepare('SELECT * FROM segment_edits WHERE id = ?').get(id);
const acceptanceOf = (id) => db.prepare('SELECT * FROM segment_acceptances WHERE id = ?').get(id);

function save(over = {}) {
  return segmentEditor.saveSegmentEdit({
    book: 'tb',
    chapter: 1,
    moduleId: 'm1',
    segmentId: 'm1:para:a',
    originalContent: 'BASE',
    editedContent: 'E1',
    editorId: 'p-a',
    editorUsername: 'a',
    ...over,
  });
}

function rawEdit(editorId, segmentId, status) {
  return Number(
    db
      .prepare(
        `INSERT INTO segment_edits
           (book, chapter, module_id, segment_id, original_content, edited_content,
            editor_id, editor_username, status)
         VALUES ('tb', 1, 'm1', ?, 'BASE', ?, ?, ?, ?)`
      )
      .run(segmentId, `raw-${status}`, editorId, editorId, status).lastInsertRowid
  );
}

function rawAcceptance(segmentId, status) {
  return Number(
    db
      .prepare(
        `INSERT INTO segment_acceptances
           (book, chapter, module_id, segment_id, accepted_content, accepted_by,
            accepted_by_username, status)
         VALUES ('tb', 1, 'm1', ?, 'ACC', 'p-z', 'z', ?)`
      )
      .run(segmentId, status).lastInsertRowid
  );
}

describe('saveSegmentEdit before-images', () => {
  it('a re-save returns the caller’s row exactly as it was before the update', () => {
    const { id } = save();
    const snap = rowOf(id);
    const r = save({ editedContent: 'E2', editorNote: 'n2' });
    expect(r.before).toEqual(snap);
    expect(rowOf(id).edited_content).toBe('E2');
    expect(r.updated).toBe(true);
  });

  it('a withdraw returns the deleted row', () => {
    const { id } = save();
    const snap = rowOf(id);
    const r = save({ editedContent: 'BASE' });
    expect(r).toEqual({ id, updated: true, reverted: true, before: snap });
    expect(rowOf(id)).toBeUndefined();
  });

  it('a withdraw with nothing to delete keeps today’s shape', () => {
    expect(save({ editedContent: 'BASE' })).toEqual({ id: null, updated: false, reverted: true });
  });

  it('an insert lists the caller’s own discuss and rejected rows it superseded, and the acceptance', () => {
    const R1 = rawEdit('p-a', 'm1:para:a', 'rejected');
    const R2 = rawEdit('p-a', 'm1:para:a', 'discuss');
    const R3 = rawEdit('p-b', 'm1:para:a', 'discuss');
    const A1 = rawAcceptance('m1:para:a', 'active');
    const A0 = rawAcceptance('m1:para:a', 'superseded');
    const A2 = rawAcceptance('m1:para:b', 'active');
    const untouched = { R3: rowOf(R3), A0: acceptanceOf(A0), A2: acceptanceOf(A2) };

    const r = save();
    expect(r.supersededEditIds).toEqual([R1, R2]);
    expect(r.supersededAcceptanceIds).toEqual([A1]);
    expect(r.updated).toBe(false);
    expect(r.reverted).toBeUndefined();
    expect(rowOf(R1).status).toBe('superseded');
    expect(rowOf(R2).status).toBe('superseded');
    expect(acceptanceOf(A1).status).toBe('superseded');
    expect(rowOf(R3)).toEqual(untouched.R3);
    expect(acceptanceOf(A0)).toEqual(untouched.A0);
    expect(acceptanceOf(A2)).toEqual(untouched.A2);
  });

  it('a re-save lists them too (a pre-039 pending row beside a stranded rejected row)', () => {
    const R4 = rawEdit('p-a', 'm1:para:c', 'rejected');
    const P = rawEdit('p-a', 'm1:para:c', 'pending');
    const r = save({ segmentId: 'm1:para:c' });
    expect(r.id).toBe(P);
    expect(r.updated).toBe(true);
    expect(r.supersededEditIds).toEqual([R4]);
    expect(r.supersededAcceptanceIds).toEqual([]);
  });
});

describe('supersedeForEdit', () => {
  it('returns the ids it superseded, and [] the second time', () => {
    const A = rawAcceptance('m1:para:a', 'active');
    expect(acceptanceService.supersedeForEdit('tb', 'm1', 'm1:para:a', db)).toEqual([A]);
    expect(acceptanceService.supersedeForEdit('tb', 'm1', 'm1:para:a', db)).toEqual([]);
  });
});

describe('saveOnServedBase passes them through', () => {
  const SB = 'efnafraedi-2e';
  const SEG = 'm96101:para:a';
  const sbSave = (editedContent) => {
    const { sha256Text } = require('../lib/servedText');
    return servedEdit.saveOnServedBase({
      book: SB,
      chapter: 1,
      moduleId: 'm96101',
      segmentId: SEG,
      editedContent,
      editorId: 'u1',
      editorUsername: 'E',
      origin: 're-attach',
      requireEcho: false,
      baseSha256: sha256Text('IS a'),
    });
  };

  it('insert, update and withdraw each carry before and the superseded lists', () => {
    writeModule(root, {
      book: SB,
      chapterDir: 'ch01',
      moduleId: 'm96101',
      en: [[SEG, 'EN a']],
      mt: [[SEG, 'IS a']],
    });
    const first = sbSave('IS a breytt');
    expect(first).toMatchObject({
      outcome: 'inserted',
      before: null,
      supersededEditIds: [],
      supersededAcceptanceIds: [],
    });
    const snap1 = rowOf(first.editId);
    const second = sbSave('IS a breytt aftur');
    expect(second.outcome).toBe('updated');
    expect(second.before).toEqual(snap1);
    const snap2 = rowOf(first.editId);
    const third = sbSave('IS a');
    expect(third.outcome).toBe('withdrawn');
    expect(third.before).toEqual(snap2);
    expect(third.supersededEditIds).toEqual([]);
    expect(third.supersededAcceptanceIds).toEqual([]);
  });
});

/**
 * Decision 45 / PR1 review C2: the before-image SELECT must not turn a write-first transaction
 * into a read-first DEFERRED one. Under WAL a deferred transaction that has read and then meets a
 * lock held by another connection fails SQLITE_BUSY at once; BEGIN IMMEDIATE waits the busy
 * timeout instead. A second PROCESS holds the write lock (a handle in this process would be
 * blocked by the event loop it shares) and releases it after HOLD_MS, well inside the timeout.
 */
describe('the before-image transactions take the write lock first', () => {
  const HOLD_MS = 400;
  const HOLDER = `
    const Database = require(${JSON.stringify(require.resolve('better-sqlite3'))});
    const h = new Database(process.argv[1]);
    h.pragma('busy_timeout = 5000');
    h.exec('BEGIN IMMEDIATE');
    process.stdout.write('held\\n');
    setTimeout(() => { h.exec('COMMIT'); h.close(); }, ${HOLD_MS});
  `;

  async function whileForeignWriterHolds(fn) {
    const child = spawn(process.execPath, ['-e', HOLDER, built.path], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.stdout.once('data', resolve);
    });
    const t0 = Date.now();
    let outcome;
    try {
      outcome = { value: fn() };
    } catch (error) {
      outcome = { error };
    }
    const waited = Date.now() - t0;
    await new Promise((resolve) => child.on('exit', resolve));
    return { ...outcome, waited };
  }

  beforeAll(() => {
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
  });

  const cases = {
    'a re-save': {
      arrange: () => save(),
      act: () => save({ editedContent: 'E2' }),
    },
    'a withdraw': {
      arrange: () => save(),
      act: () => save({ editedContent: 'BASE' }),
    },
    'an insert': {
      arrange: () => {},
      act: () => save(),
    },
    'supersedeForEdit called directly': {
      arrange: () => rawAcceptance('m1:para:a', 'active'),
      act: () => acceptanceService.supersedeForEdit('tb', 'm1', 'm1:para:a', db),
    },
  };

  for (const [name, { arrange, act }] of Object.entries(cases)) {
    it(`${name} waits for a foreign writer instead of failing BUSY`, async () => {
      arrange();
      const r = await whileForeignWriterHolds(act);
      expect(r.error).toBeUndefined();
      // Control: it really waited for the holder rather than racing ahead of it.
      expect(r.waited).toBeGreaterThan(HOLD_MS / 4);
    });
  }
});
