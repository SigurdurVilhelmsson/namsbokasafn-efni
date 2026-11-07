/**
 * T15 (G1.2 PR3 Task 28; spec §10 T15, §5.9's filter rule, R1, §14 call 14; plan decisions 8, 52, 54, 65; Review
 * Focus 26, 44): a consenting reviewer acting on a decliner's edit. The decliner's text, note, identity and times
 * reach the research file only as hashes and lengths, whichever way they arrive: in a review's before-image, as the
 * preview of a propagation, or as the text a consenting editor copies unchanged.
 *
 * Drives the real handlers on a real migrated database (SESSIONS_DB_PATH in a temp dir, so the research file
 * derives into it too) over synthetic modules under a temp books root: nothing under books/ or pipeline-output/
 * is read or written. Each case uses its own segment. The byte scans are `researchBytes()`, the file and its WAL;
 * the last case is their positive control, because it shows the scan finds a consenting author's text.
 */
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath(), the research path and the JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'research-decliner-review-'));
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
const {
  APPROVED,
  makeUser,
  consent,
  decline,
  readResearch,
} = require('./helpers/researchFixture.cjs');
const {
  allEvents,
  eventMark,
  eventsSince,
  researchBytes,
} = require('./helpers/researchEventsFixture.cjs');

const CHEM = 'efnafraedi-2e';
const SRC = 'm97701';
const TARGET = 'm97702';
const id = (m, x) => `${m}:para:${x}`;
const LETTERS = ['a', 'b', 'c', 's'];

const DECL = Object.freeze({
  id: 'p-decl',
  username: 'decl@example.is',
  role: 'editor',
  books: [],
});
const CON = Object.freeze({ id: 'p-con', username: 'p-con', role: 'editor', books: [] });
const HE = Object.freeze({ id: 'p-he', username: 'p-he', role: 'head-editor', books: [] });
const PROP = Object.freeze({ id: 'p-prop', username: 'p-prop', role: 'editor', books: [] });

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let db;
let h;
let IC;
let IH;

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
  writeModule(root, {
    book: CHEM,
    chapterDir: 'ch01',
    moduleId: SRC,
    en: LETTERS.map((x) => [id(SRC, x), x === 's' ? 'Recurring.' : `EN ${x}`]),
    mt: LETTERS.map((x) => [id(SRC, x), `IS ${x}`]),
  });
  writeModule(root, {
    book: CHEM,
    chapterDir: 'ch01',
    moduleId: TARGET,
    en: [[id(TARGET, 't'), 'Recurring.']],
    mt: [[id(TARGET, 't'), 'IS t']],
  });
  decline(makeUser('p-decl'));
  IC = consent(makeUser('p-con'));
  IH = consent(makeUser('p-he', 'head-editor'));
  consent(makeUser('p-prop'));
  const router = require('../routes/segment-editor');
  h = {
    get: handlerFor(router, 'get', '/:book/:chapter/:moduleId'),
    save: handlerFor(router, 'post', '/:book/:chapter/:moduleId/edit'),
    propagate: handlerFor(router, 'post', '/:book/:chapter/:moduleId/propagate'),
    approve: handlerFor(router, 'post', '/edit/:editId/approve'),
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

const PARAMS = Object.freeze({ book: CHEM, chapter: '1', moduleId: SRC });
const onSrc = (user, body) => ({ params: PARAMS, chapterNum: 1, user, body });

let actSeq = 0;
const act = () => `dr-act-${++actSeq}`;

/** What `user`'s page shows for segment x: the served hash and the row it displays. */
async function view(user, x) {
  const page = (await invoke(h.get, onSrc(user))).body;
  const rows = page.edits[id(SRC, x)];
  return {
    baseSha256: page.segments.find((s) => s.segmentId === id(SRC, x)).baseSha256,
    row: rows && rows.length ? rows[0] : null,
  };
}

/** A save as the page sends it: the served hash, and the row it displays as baseEditId and displayed pair. */
async function saveShowing(user, x, editedContent, extra = {}) {
  const v = await view(user, x);
  const r = await invoke(
    h.save,
    onSrc(user, {
      segmentId: id(SRC, x),
      editedContent,
      baseSha256: v.baseSha256,
      ...(v.row
        ? {
            baseEditId: v.row.id,
            displayedEditId: v.row.id,
            displayedEditSha256: v.row.contentSha256,
          }
        : {}),
      clientActionId: act(),
      ...extra,
    })
  );
  expect(r.status).toBe(200);
  return { editId: r.body.editId, contentSha256: v.row ? v.row.contentSha256 : null };
}

/** The reviewer approves what its page shows for segment x, echoing the displayed hash. */
async function approveShowing(user, x, note) {
  const { row } = await view(user, x);
  const r = await invoke(h.approve, {
    params: { editId: String(row.id) },
    user,
    body: { note, reviewedEditSha256: row.contentSha256 },
  });
  expect(r.status).toBe(200);
  return row.id;
}

const keyOf = (interval) => {
  const r = readResearch();
  try {
    return r.prepare('SELECT editor_key FROM editor_keys WHERE interval_id = ?').get(interval)
      .editor_key;
  } finally {
    r.close();
  }
};
const bytesHold = (needle) => researchBytes().includes(needle);

describe("T15: a consenting reviewer on a decliner's edit (spec §10, §5.9)", () => {
  it("the approval of a decliner's edit carries editing_id and a text hash, and no text, author key or author time", async () => {
    const TEXT = 'SENTINEL-DECLINER-TEXT';
    const NOTE = 'SENTINEL-DECLINER-NOTE';
    const mark0 = eventMark();
    const { editId } = await saveShowing(DECL, 'a', TEXT, { editorNote: NOTE });
    expect(eventsSince(mark0)).toEqual([]); // declined: nothing recorded
    const mark = eventMark();
    await approveShowing(HE, 'a', 'REVIEWER-NOTE-A');
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    const [e] = ev;
    expect(e.event_type).toBe('edit-approve');
    expect(e.editing_id).toBe(BigInt(editId));
    expect(e.editing_content_sha256).toBe(sha256Text(TEXT));
    expect(e.editor_key).toBe(keyOf(IH));
    expect(Object.keys(e.content)).toEqual(['note']);
    expect(e.content.note).toEqual({
      length: [...'REVIEWER-NOTE-A'].length,
      sha256: sha256Text('REVIEWER-NOTE-A'),
    });
    const row = db.prepare('SELECT * FROM segment_edits WHERE id = ?').get(editId);
    const shown = e.before[0].row;
    expect(shown).toEqual({
      id: editId,
      status: 'pending',
      category: row.category,
      served_version_id: row.served_version_id,
      occurrence: row.occurrence,
      origin: row.origin,
      displayed_edit_id: row.displayed_edit_id,
      displayed_edit_sha256: row.displayed_edit_sha256,
      book: CHEM,
      chapter: 1,
      module_id: SRC,
      segment_id: id(SRC, 'a'),
      applied: false,
      edited_content_sha256: sha256Text(TEXT),
      editor_note: { length: [...NOTE].length, sha256: sha256Text(NOTE) },
      reviewer_note: null,
    });
    for (const k of [
      'edited_content',
      'editor_id',
      'editor_username',
      'created_at',
      'original_content',
    ]) {
      expect(k in shown).toBe(false);
    }
    for (const s of [TEXT, NOTE, 'p-decl', 'decl@example.is']) expect(bytesHold(s)).toBe(false);
  });

  it("a propagation whose preview text is the decliner's live edit stores only its hash", async () => {
    await saveShowing(DECL, 's', 'SENTINEL-DECLINER-PREVIEW');
    const mark = eventMark();
    const r = await invoke(
      h.propagate,
      onSrc(PROP, { segmentId: id(SRC, 's'), editedContent: 'P-texti' })
    );
    expect(r.status).toBe(200);
    const ev = eventsSince(mark).filter((e) => e.event_type === 'propagation');
    expect(ev.map((e) => e.module_id)).toEqual([TARGET]);
    expect(ev[0].detail.previewSource).toBe('other-edit');
    expect(ev[0].detail.previewSha256).toBe(sha256Text('SENTINEL-DECLINER-PREVIEW'));
    expect('previewText' in ev[0].detail).toBe(false);
    expect(bytesHold('SENTINEL-DECLINER-PREVIEW')).toBe(false);
  });

  it("with decision 65: a consenting editor who saves a decliner's live text unchanged stores only its hash", async () => {
    const TEXT = 'SENTINEL-DECLINER-COPY';
    const { editId: declinerEdit } = await saveShowing(DECL, 'c', TEXT);
    const v = await view(CON, 'c');
    expect(v.row.id).toBe(declinerEdit); // the pane shows the decliner's row
    const mark = eventMark();
    const r = await invoke(
      h.save,
      onSrc(CON, {
        segmentId: id(SRC, 'c'),
        editedContent: TEXT,
        baseSha256: v.baseSha256,
        baseEditId: v.row.id,
        displayedEditId: v.row.id,
        displayedEditSha256: v.row.contentSha256,
        clientActionId: act(),
      })
    );
    expect(r.status).toBe(200);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0].event_type).toBe('edit-save');
    expect(ev[0].editor_key).toBe(keyOf(IC));
    expect(ev[0].content.textSha256).toBe(sha256Text(TEXT));
    expect('text' in ev[0].content).toBe(false);
    expect(bytesHold(TEXT)).toBe(false);
  });

  it("positive control: the same approval of a consenting author's edit is matched by hash to that author's save", async () => {
    const { editId } = await saveShowing(CON, 'b', 'CONSENTING-TEXT');
    const mark = eventMark();
    await approveShowing(HE, 'b', 'REVIEWER-NOTE-B');
    const [approval] = eventsSince(mark);
    expect(approval.event_type).toBe('edit-approve');
    const save = allEvents().find(
      (e) => e.event_type === 'edit-save' && e.editing_id === BigInt(editId)
    );
    expect(save.content.text).toBe('CONSENTING-TEXT');
    expect(approval.editing_content_sha256).toBe(sha256Text(save.content.text));
    expect(bytesHold('CONSENTING-TEXT')).toBe(true); // the scan sees text, so the falses above can fail
  });
});
