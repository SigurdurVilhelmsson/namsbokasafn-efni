/**
 * POST /:book/:chapter/:moduleId/propagate places each target, mints its served version from the
 * text the server loaded for it, and refuses organic (G1.1; spec §5.6 Propagation targets, §5.7;
 * T16's target rows, T5's skip and T18's propagation half; plan Task 16, decision 13).
 *
 * Drives the real GET and POST handlers on a real migrated database (SESSIONS_DB_PATH in a temp
 * dir, so the foreign key from segment_edits.served_version_id is live) over synthetic modules
 * under a temp books root. findOccurrences scans the whole book, so the temp root holds only the
 * modules each case names, and nothing under books/ is read or written.
 *
 * The refusal compares the edit table and the served-version id list before and after, by value,
 * and carries a control that propagates, so a route refusing everything fails.
 */
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'served-propagation-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { writeModule, handlerFor, invoke, EDITOR } = require('./helpers/servedFixture');

const CHEM = 'efnafraedi-2e';
const ORGANIC = 'lifraen-efnafraedi';
const EN = 'Recurring.';
const SOURCE = 'm96001:para:s';
const T = 'm96002:para:t';
const U = 'm96003:para:u';

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let REFUSAL_MESSAGES;
let get;
let propagate;
let db;

/** The same three-module shape in a book: a source, a plain target and a duplicated target. */
function writeBook(book, prefix) {
  writeModule(root, {
    book,
    chapterDir: 'ch01',
    moduleId: `${prefix}1`,
    en: [[`${prefix}1:para:s`, EN]],
    mt: [[`${prefix}1:para:s`, 'Endurtekið.']],
  });
  writeModule(root, {
    book,
    chapterDir: 'ch02',
    moduleId: `${prefix}2`,
    en: [
      [`${prefix}2:para:x`, 'Something else.'],
      [`${prefix}2:para:t`, EN],
    ],
    mt: [
      [`${prefix}2:para:x`, 'Eitthvað annað.'],
      [`${prefix}2:para:t`, 'Endurtekning í markeiningu.'],
    ],
  });
  writeModule(root, {
    book,
    chapterDir: 'ch02',
    moduleId: `${prefix}3`,
    en: [
      [`${prefix}3:para:u`, EN],
      [`${prefix}3:para:u`, EN],
    ],
    mt: [
      [`${prefix}3:para:u`, 'IS u1'],
      [`${prefix}3:para:u`, 'IS u2'],
    ],
  });
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  segmentParser = require('../services/segmentParser');
  segmentEditor = require('../services/segmentEditorService');
  ({ REFUSAL_MESSAGES } = require('../services/servedEdit'));
  realBooksDir = segmentParser.BOOKS_DIR;
  root = path.join(work, 'books');
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);
  writeBook(CHEM, 'm9600');
  writeBook(ORGANIC, 'm9601');
  const router = require('../routes/segment-editor');
  get = handlerFor(router, 'get', '/:book/:chapter/:moduleId');
  propagate = handlerFor(router, 'post', '/:book/:chapter/:moduleId/propagate');
  db = new Database(dbPath);
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  segmentEditor._setTestBooksDir(realBooksDir);
  db.close();
  rmSync(work, { recursive: true, force: true });
});

// One database for the file; each case starts with no edit rows. Served versions are left alone (a
// live foreign key references them), and the refusal compares version id sets before and after.
beforeEach(() => {
  db.exec('DELETE FROM segment_acceptances; DELETE FROM segment_edits;');
});

function post(body, { book = CHEM, chapterNum = 1, moduleId = 'm96001', user = EDITOR } = {}) {
  return invoke(propagate, {
    params: { book, chapter: String(chapterNum), moduleId },
    chapterNum,
    user,
    body,
  });
}

function serve(book, chapterNum, moduleId, user = EDITOR) {
  return invoke(get, { params: { book, chapter: String(chapterNum), moduleId }, chapterNum, user });
}

const editRows = () => db.prepare('SELECT * FROM segment_edits ORDER BY id').all();
const versionIds = () =>
  db
    .prepare('SELECT id FROM served_text_versions ORDER BY id')
    .all()
    .map((r) => r.id);
const snapshot = () => ({ edits: editRows(), versions: versionIds() });
const versionById = (id) => db.prepare('SELECT * FROM served_text_versions WHERE id = ?').get(id);

describe('POST /propagate (spec §5.6 Propagation targets, §5.7, §11)', () => {
  it('T18: an organic propagation answers 409 BOOK_NOT_MINTED and writes nothing', async () => {
    const before = snapshot();
    const r = await post(
      { segmentId: 'm96011:para:s', editedContent: 'Nýtt.' },
      { book: ORGANIC, moduleId: 'm96011' }
    );
    expect(r.status).toBe(409);
    expect(r.body).toEqual({
      error: 'BOOK_NOT_MINTED',
      message: REFUSAL_MESSAGES.BOOK_NOT_MINTED,
    });
    expect(snapshot()).toEqual(before);
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM served_text_versions WHERE book = ?').get(ORGANIC).n
    ).toBe(0);

    // Control, in the same test: the same request on the chemistry copy of the same modules writes.
    const ok = await post({ segmentId: SOURCE, editedContent: 'Nýtt.' });
    expect(ok.status).toBe(200);
    expect(ok.body.created.length).toBeGreaterThan(0);
    expect(editRows().length).toBeGreaterThan(0);
  });

  it('a duplicated target in the book is listed as skipped, with its occurrence; a plain target is created from its own loaded text', async () => {
    const r = await post({ segmentId: SOURCE, editedContent: 'Texti ritstjórans.' });
    expect(r.status).toBe(200);
    expect(r.body.skipped.filter((s) => s.reason === 'duplicate-id')).toEqual([
      { moduleId: 'm96003', segmentId: U, reason: 'duplicate-id', occurrence: 0 },
      { moduleId: 'm96003', segmentId: U, reason: 'duplicate-id', occurrence: 1 },
    ]);
    expect(r.body.created).toEqual([{ moduleId: 'm96002', segmentId: T }]);

    const rows = editRows();
    expect(rows.filter((row) => row.module_id === 'm96003')).toEqual([]);
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM served_text_versions WHERE module_id = ?').get('m96003')
        .n
    ).toBe(0);

    const [row] = rows.filter((x) => x.module_id === 'm96002');
    expect(row).toMatchObject({
      chapter: 2,
      segment_id: T,
      edited_content: 'Texti ritstjórans.',
      origin: 'propagation',
      occurrence: 0,
      displayed_edit_id: null,
      displayed_edit_sha256: null,
    });

    // The base is what the server serves for that target: its own loaded text, not the client's.
    const page = await serve(CHEM, 2, 'm96002');
    expect(page.status).toBe(200);
    const served = page.body.segments.find((s) => s.segmentId === T);
    expect(row.original_content).toBe(served.is);
    const version = versionById(row.served_version_id);
    expect(version).toMatchObject({
      book: CHEM,
      chapter: 2,
      module_id: 'm96002',
      segment_id: T,
      occurrence: 0,
      en_text: EN,
      is_text: served.is,
      is_sha256: served.baseSha256,
      layer: 'mt-output',
    });
    // The serve found the version propagation minted: one version for that target, not two.
    expect(
      db
        .prepare('SELECT id FROM served_text_versions WHERE module_id = ? AND segment_id = ?')
        .all('m96002', T)
        .map((v) => v.id)
    ).toEqual([row.served_version_id]);
  });
});
