/**
 * T11 (G1.2 PR3 Task 29; spec §10 T11, §5.9, §5.10; plan decisions 48, 50, 51, 60, 65; Review Focus 44): the editing
 * record rebuilt purely from the research events equals segment_edits on the spec's fields.
 *
 * Twelve acts run once through the real handlers (a real migrated database in a temp dir, synthetic modules under a
 * temp books root; nothing under books/ or pipeline-output/). Every act gets its own server time through a faked
 * Date; timestamps are compared only as order. The cases read what the acts left behind.
 */
import { mkdtempSync, mkdirSync, rmSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath(), the research path and the JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'research-replay-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const researchDb = require('../services/researchDb');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const applyHold = require('../lib/applyHold');
const { sha256Text } = require('../lib/servedText');
const { writeModule, handlerFor, invoke } = require('./helpers/servedFixture');
const { APPROVED, makeUser, consent } = require('./helpers/researchFixture.cjs');
const { allEvents, itemsOf } = require('./helpers/researchEventsFixture.cjs');
const {
  rebuildSegmentEdits,
  actualSegmentEdits,
  diffRebuild,
  keyOfProvider,
} = require('./helpers/researchRebuild.cjs');

const CHEM = 'efnafraedi-2e';
const M1 = 'm99001';
const M2 = 'm99002';
const M3 = 'm99003';
const M9 = 'm99009';
const sid = (mod, x) => `${mod}:para:${x}`;
const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];

const userOf = (p, role = 'editor') => Object.freeze({ id: p, username: p, role, books: [] });
const PA = userOf('p-a');
const PB = userOf('p-b');
const PH = userOf('p-h', 'admin');

const T0 = 1_800_000_000_000;
let step = 0;
const act = (fn) => {
  vi.setSystemTime(T0 + ++step);
  return fn();
};

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let concordance;
let tmService;
let pipelineStatusService;
let db;
let h;
let clientAct = 0;
const ids = {}; // named edit ids
const notes = {};

const params = (mod) => ({ book: CHEM, chapter: '1', moduleId: mod });
const onModule = (mod, user, body) => ({ params: params(mod), chapterNum: 1, user, body });
const onEdit = (user, editId, body = {}) => ({ params: { editId: String(editId) }, user, body });

async function view(mod, user, x) {
  const page = (await invoke(h.get, onModule(mod, user))).body;
  const rows = page.edits[sid(mod, x)];
  return {
    baseSha256: page.segments.find((s) => s.segmentId === sid(mod, x)).baseSha256,
    row: rows && rows.length ? rows[0] : null,
  };
}

/** A save as the page sends it: the served hash, and the row it displays. */
async function save(mod, user, x, text, extra = {}) {
  const v = await view(mod, user, x);
  const r = await act(() =>
    invoke(
      h.save,
      onModule(mod, user, {
        segmentId: sid(mod, x),
        editedContent: text,
        baseSha256: v.baseSha256,
        ...(v.row
          ? {
              baseEditId: v.row.id,
              displayedEditId: v.row.id,
              displayedEditSha256: v.row.contentSha256,
            }
          : {}),
        clientActionId: `rp-${++clientAct}`,
        ...extra,
      })
    )
  );
  expect(r.status).toBe(200);
  return r.body.editId;
}

async function review(handler, editId, body) {
  const r = await act(() => invoke(handler, onEdit(PH, editId, body)));
  expect(r.status).toBe(200);
}

const rowOf = (editId) => db.prepare('SELECT * FROM segment_edits WHERE id = ?').get(editId);

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
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
  concordance = require('../services/concordanceService');
  tmService = require('../services/tmService');
  pipelineStatusService = require('../services/pipelineStatusService');
  realBooksDir = segmentParser.BOOKS_DIR;
  root = path.join(work, 'books');
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);

  const EN1 = {
    a: 'Recurring sentence.',
    b: 'EN b',
    c: 'EN c',
    d: 'Spread me.',
    e: 'EN e',
    f: 'EN f',
  };
  writeModule(root, {
    book: CHEM,
    chapterDir: 'ch01',
    moduleId: M1,
    en: LETTERS.map((x) => [sid(M1, x), EN1[x]]),
    mt: LETTERS.map((x) => [sid(M1, x), `IS ${x}`]),
  });
  writeModule(root, {
    book: CHEM,
    chapterDir: 'ch01',
    moduleId: M2,
    en: [[sid(M2, 't'), 'Spread me.']],
    mt: [[sid(M2, 't'), 'IS t']],
  });
  writeModule(root, {
    book: CHEM,
    chapterDir: 'ch01',
    moduleId: M3,
    en: [[sid(M3, 'u'), 'Spread me.']],
    mt: [[sid(M3, 'u'), 'IS u']],
  });
  writeModule(root, {
    book: CHEM,
    chapterDir: 'ch02',
    moduleId: M9,
    en: [[sid(M9, 'r'), 'Recurring sentence.']],
    faithful: [[sid(M9, 'r'), 'Samþykkt þýðing.']],
  });
  concordance.indexModule(CHEM, 2, M9);
  for (const p of ['p-a', 'p-b', 'p-h']) consent(makeUser(p, p === 'p-h' ? 'admin' : 'editor'));
  const router = require('../routes/segment-editor');
  h = {
    get: handlerFor(router, 'get', '/:book/:chapter/:moduleId'),
    save: handlerFor(router, 'post', '/:book/:chapter/:moduleId/edit'),
    approve: handlerFor(router, 'post', '/edit/:editId/approve'),
    reject: handlerFor(router, 'post', '/edit/:editId/reject'),
    discuss: handlerFor(router, 'post', '/edit/:editId/discuss'),
    unapprove: handlerFor(router, 'post', '/edit/:editId/unapprove'),
    back: handlerFor(router, 'post', '/edit/:editId/return-to-pending'),
    propagate: handlerFor(router, 'post', '/:book/:chapter/:moduleId/propagate'),
    apply: handlerFor(router, 'post', '/:book/:chapter/:moduleId/apply'),
  };
  db = new Database(dbPath);

  // Decisions 59 and 60: the post-apply hooks have their own timers and databases, and chemistry is held.
  vi.spyOn(tmService, 'scheduleTmRegen').mockImplementation(() => {});
  vi.spyOn(concordance, 'indexModule').mockImplementation(() => {});
  vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});
  vi.spyOn(applyHold, 'assertFaithfulWritable').mockImplementation(() => {});

  // Act 1: the assists, as the client builds them.
  const rep = concordance.findRepetitions(CHEM, 1, M1).find((r) => r.segmentId === sid(M1, 'a'));
  expect(rep && rep.suggestion.is_text).toBe('Samþykkt þýðing.');
  const s = rep.suggestion;
  const repItem = (text) => ({
    itemType: 'repetition-insert',
    source: 'tm',
    clientTimeMs: Date.now(),
    detail: { text, book: s.book, chapter: s.chapter, moduleId: s.module_id },
  });
  ids.a1 = await save(M1, PA, 'a', 'A1', {
    editorNote: 'na',
    category: 'terminology',
    assists: [
      repItem(s.is_text),
      repItem('Fölsuð.'),
      {
        itemType: 'term-insert',
        source: 'termbase',
        clientTimeMs: Date.now(),
        detail: { term: 'hugtak' },
      },
      {
        itemType: 'markup-wrap',
        source: 'toolbar',
        clientTimeMs: Date.now(),
        detail: { marker: '__' },
      },
      {
        itemType: 'repetition-insert',
        source: 'tm',
        clientTimeMs: Date.now(),
        detail: {
          book: s.book,
          chapter: s.chapter,
          moduleId: s.module_id,
          textLength: 9000,
          textDropped: true,
        },
      },
    ],
  });
  // The fifth assist's text is not in the body (textDropped): its claim is unverified, see the claims case.

  // Act 2: a re-save with a new note.
  await save(M1, PA, 'a', 'A1b', { editorNote: 'nb', category: 'style' });
  // Act 3: save b, then withdraw it by saving b's base.
  await save(M1, PA, 'b', 'B?');
  await save(M1, PA, 'b', 'IS b');
  // Act 4: p-b saves c and f; p-a saves exactly p-b's f (decision 65).
  ids.c = await save(M1, PB, 'c', 'C1');
  ids.fb = await save(M1, PB, 'f', 'F-sameiginlegt');
  ids.fa = await save(M1, PA, 'f', 'F-sameiginlegt');
  // Act 5: the head editor's review of p-a's a.
  await review(h.approve, ids.a1, {});
  await review(h.unapprove, ids.a1, {});
  await review(h.reject, ids.a1, {});
  await review(h.back, ids.a1, {});
  await review(h.approve, ids.a1, {});
  // Act 6: discuss, back, approve with a note on c; then let SQLite's second-resolution clock tick.
  await review(h.discuss, ids.c, { note: 'rædum' });
  await review(h.back, ids.c, {});
  await review(h.approve, ids.c, { note: 'samþ.' });
  await new Promise((r) => setTimeout(r, 1100));
  // Act 7: a rejected row swept by the next insert.
  ids.e1 = await save(M1, PA, 'e', 'E1');
  await review(h.reject, ids.e1, {});
  ids.e2 = await save(M1, PA, 'e', 'E2');
  // Act 8: an own pending row on a propagation target.
  ids.u = await save(M3, PA, 'u', 'U-mitt');
  // Act 9: propagation from d: t inserted, u updated in place.
  await save(M1, PA, 'd', 'Fjölgað');
  const prop = await act(() =>
    invoke(
      h.propagate,
      onModule(M1, PA, {
        segmentId: sid(M1, 'd'),
        editedContent: 'Fjölgað',
        clientActionId: 'rp-prop',
      })
    )
  );
  expect(prop.status).toBe(200);
  // Act 10: p-b's newer a, approved.
  ids.ab = await save(M1, PB, 'a', 'Ab-nýrra');
  await review(h.approve, ids.ab, {});
  // Act 11: apply (winners p-b's a and c; loser p-a's a).
  expect((await act(() => invoke(h.apply, onModule(M1, PH)))).status).toBe(200);
  // Act 12: the faithful file gone, apply again (the self-heal).
  unlinkSync(path.join(root, CHEM, '03-faithful-translation', 'ch01', `${M1}-segments.is.md`));
  expect((await act(() => invoke(h.apply, onModule(M1, PH)))).status).toBe(200);
  notes.cReviewer = rowOf(ids.c).reviewer_note;
}, 60000);

afterAll(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  segmentParser._setTestBooksDir(realBooksDir);
  segmentEditor._setTestBooksDir(realBooksDir);
  researchConsentText._setTestApprovedTexts(null);
  serverCommit._setTestServerCommit(null);
  researchDb._reset();
  db.close();
  rmSync(work, { recursive: true, force: true });
});

describe('T11: the editing record rebuilt from the events', () => {
  it("T11: the rebuild from the events equals segment_edits on the spec's fields", () => {
    const actual = actualSegmentEdits(db);
    expect(actual.size).toBeGreaterThan(5);
    expect(diffRebuild(rebuildSegmentEdits(allEvents()), actual)).toEqual([]);
  });

  it('T11: positive controls — the note fields are compared on real values', () => {
    const actual = actualSegmentEdits(db);
    expect(actual.get(ids.a1).editor_note_sha256).toBe(sha256Text('nb'));
    expect(actual.get(ids.c).reviewer_note_sha256).toBe(sha256Text('samþ.'));
    expect(notes.cReviewer).toBe('samþ.');
    // c's last reviewer-side event is an edit-approve, not the apply.
    const types = allEvents()
      .filter((e) => e.editing_id === BigInt(ids.c))
      .map((e) => e.event_type);
    expect(types.filter((t) => t.startsWith('edit-')).at(-1)).toBe('edit-approve');
  });

  it("T11: a withheld text is resolved from the other editor's event, not compared by hash", () => {
    const events = allEvents();
    const fa = events.find((e) => e.editing_id === BigInt(ids.fa) && e.event_type === 'edit-save');
    expect(fa.content.text).toBeUndefined();
    expect(fa.content.textSha256).toBe(sha256Text('F-sameiginlegt'));
    expect(rebuildSegmentEdits(events).get(ids.fa).edited_content).toBe('F-sameiginlegt');
  });

  it('T11: timestamps agree as order', () => {
    const events = allEvents();
    const lastWrite = new Map();
    events.forEach((e, i) => {
      if (['edit-save', 'edit-resave', 'propagation'].includes(e.event_type)) {
        lastWrite.set(Number(e.editing_id), i);
      }
    });
    const rows = db.prepare('SELECT id, created_at FROM segment_edits').all();
    let compared = 0;
    for (const x of rows) {
      for (const y of rows) {
        if (x.created_at < y.created_at) {
          compared += 1;
          expect(lastWrite.get(x.id)).toBeLessThan(lastWrite.get(y.id));
        }
      }
    }
    expect(compared).toBeGreaterThan(0);
  });

  it('T11: claims — planted mismatch, real validated, untestable unverified', () => {
    const first = allEvents().find((e) => e.event_type === 'edit-save');
    expect(itemsOf(first.id).map((i) => [i.item_type, i.claim])).toEqual([
      ['repetition-insert', 'validated'],
      ['repetition-insert', 'mismatch'],
      ['term-insert', 'unverified'],
      ['markup-wrap', 'unverified'],
      ['repetition-insert', 'unverified'],
    ]);
  });

  it('control: a category the emitter dropped shows up as exactly that field', () => {
    const actual = actualSegmentEdits(db);
    expect(actual.get(ids.a1).category).toBe('style'); // a real, non-null value on the actual side
    const rebuilt = rebuildSegmentEdits(allEvents());
    expect(rebuilt.get(ids.a1).category).toBe('style');
    rebuilt.get(ids.a1).category = null;
    expect(diffRebuild(rebuilt, actual)).toEqual([
      { id: ids.a1, field: 'category', rebuilt: null, actual: 'style' },
    ]);
  });

  it('control: dropping one event makes the rebuild differ, at exactly the row and field it changed', () => {
    const actual = actualSegmentEdits(db);
    const events = allEvents();
    const rejectOfE1 = events.find(
      (e) => e.event_type === 'edit-reject' && e.editing_id === BigInt(ids.e1)
    );
    const without = (victim) => events.filter((e) => e !== victim);
    expect(diffRebuild(rebuildSegmentEdits(without(rejectOfE1)), actual)).toEqual([
      { id: ids.e1, field: 'reviewer_key', rebuilt: null, actual: keyOfProvider(db, 'p-h') },
    ]);
    const saveOfC = events.find(
      (e) => e.event_type === 'edit-save' && e.editing_id === BigInt(ids.c)
    );
    expect(diffRebuild(rebuildSegmentEdits(without(saveOfC)), actual)).toEqual([
      { id: ids.c, field: '<row>' },
    ]);
  });
});
