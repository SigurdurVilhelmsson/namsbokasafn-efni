/**
 * Decision 65 follows a propagated copy into its later before-images (G1.2 PR3, finding C1; spec ✏️ AMENDED
 * 2026-11-07). Editor A propagates editor B's live text X, so A owns a copy of X on each target. A later act of A's on
 * that copy (a re-save, a withdraw, a delete, an apply that carries the row) writes a before-image whose own
 * `edited_content` is X. The check covers the source segment the copy's `propagation` event recorded; when no such
 * event exists, it checks the copy's text against other editors' live edits anywhere in the book. The controls show
 * it does not over-withhold: A's own text, a book where nobody else holds the text, and a source edit since rejected.
 * Since the refinement of the same day (finding I1), the copy is found by its row id and the sha256 of its current
 * text, not by its `origin`: an unchanged re-save and a copy edited away and back both carry X under another origin.
 * The book-wide check stays only for a row whose origin is still `propagation`. The event's own content is looked up the
 * same way (the residual, approved the same day): a save that types X back into the copy names the copy as its own row,
 * so the propagation that wrote X there is found by the row and sha256(X), and the save's content holds X only as its
 * hash. No book-wide check runs for content.
 *
 * Drives the real handlers on a real migrated database (SESSIONS_DB_PATH in a temp dir, so the research file
 * derives into it too) over synthetic modules under a temp books root: nothing under books/ or pipeline-output/ is
 * read or written. Each family of cases has its own English sentence, so a propagation reaches only that family's
 * targets, and its own sentinel texts, so the book-wide check of one family cannot see another's. The byte scans are
 * `researchBytes()`, the file and its WAL; the own-text control is their positive control. The cases share one
 * database and run in declaration order.
 */
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath(), the research path and the JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'research-propagated-copies-'));
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
const { APPROVED, makeUser, consent, decline } = require('./helpers/researchFixture.cjs');
const {
  allEvents,
  eventMark,
  eventsSince,
  researchBytes,
  withdrawConsent,
} = require('./helpers/researchEventsFixture.cjs');

const CHEM = 'efnafraedi-2e';
const sid = (mod, x) => `${mod}:para:${x}`;
const userOf = (p, role = 'editor') => Object.freeze({ id: p, username: p, role, books: [] });
const A = userOf('p-a'); // consenting from the start
const B = userOf('p-b'); // a decliner: the holder of the live texts
const LATE1 = userOf('p-late1'); // consents only after propagating
const LATE2 = userOf('p-late2'); // consents only after propagating
const ADM = userOf('p-adm', 'admin'); // consenting; may approve and apply
const IP = userOf('p-ip'); // consenting, withdraws, consents again

// One family per English sentence: a source segment `s` and its targets, each a module with one segment `t`.
const FAMILIES = Object.freeze({
  c1: { en: 'Family one sentence.', src: 'm97801', targets: ['m97802', 'm97803', 'm97804'] },
  late: { en: 'Family three sentence.', src: 'm97811', targets: ['m97812'] },
  own: { en: 'Family four sentence.', src: 'm97821', targets: ['m97822'] },
  lateOwn: { en: 'Family five sentence.', src: 'm97831', targets: ['m97832'] },
  rejected: { en: 'Family six sentence.', src: 'm97841', targets: ['m97842'] },
  apply: { en: 'Family seven sentence.', src: 'm97851', targets: ['m97852'] },
  // m97862 is a second source (B holds a live text on it), m97863 the target both propagations reach.
  inPlace: { en: 'Family eight sentence.', src: 'm97861', targets: ['m97862', 'm97863'] },
  elsewhere: { en: 'Family nine sentence.', src: 'm97871', targets: ['m97872'] },
  same: { en: 'Family ten sentence.', src: 'm97881', targets: ['m97882'] },
  awayBack: { en: 'Family eleven sentence.', src: 'm97891', targets: ['m97892'] },
  typedBack: { en: 'Family twelve sentence.', src: 'm97911', targets: ['m97912'] },
  ownBack: { en: 'Family thirteen sentence.', src: 'm97921', targets: ['m97922'] },
});
// Modules of their own (no other module shares their English), so nothing propagates onto them.
const UNRELATED = 'm97879'; // B holds a live text here, elsewhere in the book
const HOLDER = 'm97901'; // B holds a live text here, elsewhere in the book
const NEVER = 'm97902'; // A's own row, which no propagation ever wrote
const STANDALONE = Object.freeze({
  [UNRELATED]: 'An unrelated sentence.',
  [HOLDER]: 'A holder sentence.',
  [NEVER]: 'A never-propagated sentence.',
});

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let tmService;
let concordance;
let pipelineStatusService;
let db;
let h;
let late1Id;
let late2Id;
let ipId;

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
  tmService = require('../services/tmService');
  concordance = require('../services/concordanceService');
  pipelineStatusService = require('../services/pipelineStatusService');
  realBooksDir = segmentParser.BOOKS_DIR;
  root = path.join(work, 'books');
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);
  for (const { en, src, targets } of Object.values(FAMILIES)) {
    writeModule(root, {
      book: CHEM,
      chapterDir: 'ch01',
      moduleId: src,
      en: [[sid(src, 's'), en]],
      mt: [[sid(src, 's'), `IS ${src}`]],
    });
    for (const t of targets) {
      writeModule(root, {
        book: CHEM,
        chapterDir: 'ch01',
        moduleId: t,
        en: [[sid(t, 't'), en]],
        mt: [[sid(t, 't'), `IS ${t}`]],
      });
    }
  }
  for (const [moduleId, en] of Object.entries(STANDALONE)) {
    writeModule(root, {
      book: CHEM,
      chapterDir: 'ch01',
      moduleId,
      en: [[sid(moduleId, 's'), en]],
      mt: [[sid(moduleId, 's'), `IS ${moduleId}`]],
    });
  }
  consent(makeUser('p-a'));
  decline(makeUser('p-b'));
  late1Id = makeUser('p-late1'); // no decision yet: not capturing
  late2Id = makeUser('p-late2');
  consent(makeUser('p-adm', 'admin'));
  ipId = makeUser('p-ip');
  consent(ipId);
  const router = require('../routes/segment-editor');
  h = {
    get: handlerFor(router, 'get', '/:book/:chapter/:moduleId'),
    save: handlerFor(router, 'post', '/:book/:chapter/:moduleId/edit'),
    propagate: handlerFor(router, 'post', '/:book/:chapter/:moduleId/propagate'),
    del: handlerFor(router, 'delete', '/edit/:editId'),
    approve: handlerFor(router, 'post', '/edit/:editId/approve'),
    apply: handlerFor(router, 'post', '/:book/:chapter/:moduleId/apply'),
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

const onModule = (moduleId, user, body = {}) => ({
  params: { book: CHEM, chapter: '1', moduleId },
  chapterNum: 1,
  user,
  body,
});

let actSeq = 0;

/**
 * A save as the page sends it: the served hash, and the row it displays. The client action id is a counter, never
 * the text, so a sentinel never reaches research.db through it.
 */
async function save(moduleId, x, user, text) {
  const page = (await invoke(h.get, onModule(moduleId, user))).body;
  const rows = page.edits[sid(moduleId, x)];
  const shown = rows && rows.length ? rows[0] : null;
  const r = await invoke(
    h.save,
    onModule(moduleId, user, {
      segmentId: sid(moduleId, x),
      editedContent: text,
      baseSha256: page.segments.find((s) => s.segmentId === sid(moduleId, x)).baseSha256,
      ...(shown
        ? {
            baseEditId: shown.id,
            displayedEditId: shown.id,
            displayedEditSha256: shown.contentSha256,
          }
        : {}),
      clientActionId: `pc-${++actSeq}`,
    })
  );
  expect(r.status).toBe(200);
  return r.body;
}

async function propagate(family, user, text) {
  const { src } = FAMILIES[family];
  const r = await invoke(
    h.propagate,
    onModule(src, user, { segmentId: sid(src, 's'), editedContent: text })
  );
  expect(r.status).toBe(200);
  expect(r.body.created.map((c) => c.moduleId).sort()).toEqual(FAMILIES[family].targets);
}

/** The propagated copy `user` holds on target module `t`. */
const copyOf = (t, user) =>
  db
    .prepare(
      `SELECT * FROM segment_edits WHERE module_id = ? AND editor_id = ?
       AND status NOT IN ('rejected', 'superseded') ORDER BY id DESC LIMIT 1`
    )
    .get(t, user.id);

const bytesHold = (needle) => researchBytes().includes(needle);
const propagationEventsFor = (editId) =>
  allEvents().filter((e) => e.event_type === 'propagation' && e.editing_id === BigInt(editId));

/** The one event of `type` written since `mark`. */
function onlyEvent(mark, type) {
  const ev = eventsSince(mark).filter((e) => e.event_type === type);
  expect(ev).toHaveLength(1);
  return ev[0];
}

/** The before-image row a filtered event carries for `editId`. */
const beforeRow = (e, editId) => e.before.find((b) => b.row.id === editId).row;

/** The row holds the text only as its hash: no raw edited_content. */
function expectHashed(row, text, origin = 'propagation') {
  expect(row.origin).toBe(origin);
  expect(row.edited_content_sha256).toBe(sha256Text(text));
  expect('edited_content' in row).toBe(false);
}

describe("C1: a propagated copy of another editor's live text stays hashed in the copy's later before-images", () => {
  const X1 = 'SENTINEL-C1-DECLINER-TEXT fjölgaður';
  const { src, targets } = FAMILIES.c1;
  const [T_RESAVE, T_WITHDRAW, T_DELETE] = targets;

  it("precondition: the propagation of B's live text stores only its hash", async () => {
    await save(src, 's', B, X1); // B declines: nothing recorded
    const mark = eventMark();
    await propagate('c1', A, X1);
    const ev = eventsSince(mark).filter((e) => e.event_type === 'propagation');
    expect(ev.map((e) => e.module_id).sort()).toEqual(targets);
    for (const e of ev) expect(e.content.textSha256).toBe(sha256Text(X1));
    expect(bytesHold(X1)).toBe(false);
  });

  it("the C1 reproduction: A re-saves the copy; the edit-resave's before-image holds X only as its hash", async () => {
    const copy = copyOf(T_RESAVE, A);
    expect(copy.edited_content).toBe(X1);
    expect(copy.origin).toBe('propagation');
    const mark = eventMark();
    const saved = await save(T_RESAVE, 't', A, 'Y1 endurbætt af A');
    expect(saved.editId).toBe(copy.id); // updated in place
    const e = onlyEvent(mark, 'edit-resave');
    expectHashed(beforeRow(e, copy.id), X1);
    expect(e.content.text).toBe('Y1 endurbætt af A'); // A's new text is A's own and is kept
    expect(bytesHold(X1)).toBe(false);
  });

  it("A withdraws the copy: the edit-withdraw's before-image holds X only as its hash", async () => {
    const copy = copyOf(T_WITHDRAW, A);
    expect(copy.edited_content).toBe(X1);
    const mark = eventMark();
    await save(T_WITHDRAW, 't', A, `IS ${T_WITHDRAW}`); // the base text: a withdraw
    const e = onlyEvent(mark, 'edit-withdraw');
    expectHashed(beforeRow(e, copy.id), X1);
    expect(copyOf(T_WITHDRAW, A)).toBeUndefined();
    expect(bytesHold(X1)).toBe(false);
  });

  it("A deletes the copy: the edit-delete's before-image holds X only as its hash", async () => {
    const copy = copyOf(T_DELETE, A);
    expect(copy.edited_content).toBe(X1);
    const mark = eventMark();
    const r = await invoke(h.del, { params: { editId: String(copy.id) }, user: A });
    expect(r.status).toBe(200);
    const e = onlyEvent(mark, 'edit-delete');
    expectHashed(beforeRow(e, copy.id), X1);
    expect(bytesHold(X1)).toBe(false);
  });
});

describe('the unknown-source fallback: no propagation event, so the copy is checked book-wide', () => {
  it("A propagated B's live text before consenting; the re-save after consent holds it only as its hash", async () => {
    const X3 = 'SENTINEL-C1-LATE-DECLINER-TEXT';
    const { src, targets } = FAMILIES.late;
    await save(src, 's', B, X3);
    await propagate('late', LATE1, X3); // not yet consenting: no propagation event
    const copy = copyOf(targets[0], LATE1);
    expect(copy.edited_content).toBe(X3);
    expect(propagationEventsFor(copy.id)).toEqual([]);
    consent(late1Id);
    const mark = eventMark();
    await save(targets[0], 't', LATE1, 'Y3 eftir samþykki');
    const e = onlyEvent(mark, 'edit-resave');
    expectHashed(beforeRow(e, copy.id), X3);
    expect(bytesHold(X3)).toBe(false);
  });
});

describe('controls: the check does not over-withhold', () => {
  it("A propagates A's own text (another editor holds a different text on the source): the re-save keeps it", async () => {
    const OWN = 'CONTROL-OWN-TEXT frá A';
    const { src, targets } = FAMILIES.own;
    await save(src, 's', B, 'CONTROL-OTHER-LIVE-TEXT');
    await save(src, 's', A, OWN);
    await propagate('own', A, OWN);
    const copy = copyOf(targets[0], A);
    expect(propagationEventsFor(copy.id)).toHaveLength(1); // the source is known
    const mark = eventMark();
    await save(targets[0], 't', A, 'Y4 eigið');
    const row = beforeRow(onlyEvent(mark, 'edit-resave'), copy.id);
    expect(row.edited_content).toBe(OWN);
    expect('edited_content_sha256' in row).toBe(false);
    expect(bytesHold(OWN)).toBe(true); // positive control: the scan finds a kept text
  });

  it('the unknown-source fallback where no other editor holds the text anywhere: the re-save keeps it', async () => {
    const OWN = 'CONTROL-LATE-OWN-TEXT';
    const { src, targets } = FAMILIES.lateOwn;
    await save(src, 's', LATE2, OWN); // not yet consenting: nothing recorded
    await propagate('lateOwn', LATE2, OWN);
    const copy = copyOf(targets[0], LATE2);
    expect(propagationEventsFor(copy.id)).toEqual([]);
    consent(late2Id);
    const mark = eventMark();
    await save(targets[0], 't', LATE2, 'Y5 eigið');
    const row = beforeRow(onlyEvent(mark, 'edit-resave'), copy.id);
    expect(row.edited_content).toBe(OWN);
  });

  it("the source's other-editor text was since rejected (no longer live): the re-save keeps the copy's text", async () => {
    const X6 = 'CONTROL-REJECTED-SOURCE-TEXT';
    const { src, targets } = FAMILIES.rejected;
    await save(src, 's', B, X6);
    await propagate('rejected', A, X6);
    const copy = copyOf(targets[0], A);
    expect(propagationEventsFor(copy.id)).toHaveLength(1);
    const changed = db
      .prepare(
        `UPDATE segment_edits SET status = 'rejected'
         WHERE module_id = ? AND editor_id = ? AND edited_content = ?`
      )
      .run(src, B.id, X6).changes;
    expect(changed).toBe(1);
    const mark = eventMark();
    await save(targets[0], 't', A, 'Y6 endurbætt');
    const row = beforeRow(onlyEvent(mark, 'edit-resave'), copy.id);
    expect(row.edited_content).toBe(X6);
  });
});

describe('a known source is checked alone: the book-wide check is only for an unknown source', () => {
  it("the source is known and holds no other editor's copy of the text; another editor holds it elsewhere in the book: kept", async () => {
    const OWN = 'CONTROL-KNOWN-SOURCE-TEXT';
    const { src, targets } = FAMILIES.elsewhere;
    await save(UNRELATED, 's', B, OWN); // live, another editor's, but not on the copy's source
    await save(src, 's', A, OWN);
    await propagate('elsewhere', A, OWN);
    const copy = copyOf(targets[0], A);
    expect(propagationEventsFor(copy.id)).toHaveLength(1);
    const mark = eventMark();
    await save(targets[0], 't', A, 'Y9 eigið');
    const row = beforeRow(onlyEvent(mark, 'edit-resave'), copy.id);
    expect(row.edited_content).toBe(OWN);
  });
});

describe('an event that names no segment follows the row too', () => {
  it("an apply whose before-image carries the applier's own propagated copy of B's live text holds it only as its hash", async () => {
    const X7 = 'SENTINEL-C1-APPLY-DECLINER-TEXT';
    const { src, targets } = FAMILIES.apply;
    const [T] = targets;
    vi.spyOn(tmService, 'scheduleTmRegen').mockImplementation(() => {});
    vi.spyOn(concordance, 'indexModule').mockImplementation(() => {});
    vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});
    vi.spyOn(applyHold, 'assertFaithfulWritable').mockImplementation(() => {});
    try {
      await save(src, 's', B, X7);
      await propagate('apply', ADM, X7);
      const copy = copyOf(T, ADM);
      expect(copy.edited_content).toBe(X7);
      // ADM approves its own copy (self-approval is a head editor's and an admin's): a review event whose
      // before-image is the copy.
      let mark = eventMark();
      let r = await invoke(h.approve, { params: { editId: String(copy.id) }, user: ADM, body: {} });
      expect(r.status).toBe(200);
      const approval = onlyEvent(mark, 'edit-approve'); // asserted after the apply's, below
      // A newer approved edit on the same segment makes the copy the apply's loser.
      const newer = await save(T, 't', ADM, 'Y7 nýrri');
      expect(newer.editId).not.toBe(copy.id);
      r = await invoke(h.approve, {
        params: { editId: String(newer.editId) },
        user: ADM,
        body: {},
      });
      expect(r.status).toBe(200);
      mark = eventMark();
      r = await invoke(h.apply, onModule(T, ADM));
      expect(r.status).toBe(200);
      const e = onlyEvent(mark, 'apply');
      expect(e.segment_id).toBeNull();
      expect(e.detail.superseded).toEqual([copy.id]);
      expectHashed(beforeRow(e, copy.id), X7);
      expectHashed(beforeRow(approval, copy.id), X7);
      expect(bytesHold(X7)).toBe(false);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("the event is the one that wrote the copy's current text, not merely one that wrote the row", () => {
  it("an in-place re-propagation of B's live text that was not captured: the earlier write's source does not stand in for it", async () => {
    const OWN = 'IP-OWN-FIRST-TEXT';
    const X8 = 'SENTINEL-C1-INPLACE-DECLINER-TEXT';
    const { src, targets } = FAMILIES.inPlace;
    const [S2, T] = targets;
    await save(S2, 't', B, X8);
    await save(src, 's', IP, OWN);
    let r = await invoke(
      h.propagate,
      onModule(src, IP, { segmentId: sid(src, 's'), editedContent: OWN })
    );
    expect(r.status).toBe(200);
    expect(r.body.created.map((c) => c.moduleId)).toEqual([T]); // S2 holds B's live edit: skipped
    const copy = copyOf(T, IP);
    expect(propagationEventsFor(copy.id).map((e) => e.detail.source)).toEqual([
      { moduleId: src, segmentId: sid(src, 's') },
    ]);
    // Withdrawn: the in-place re-propagation from S2 is not captured, so no event records where X8 came from.
    withdrawConsent(ipId);
    r = await invoke(h.propagate, onModule(S2, IP, { segmentId: sid(S2, 't'), editedContent: X8 }));
    expect(r.status).toBe(200);
    expect(copyOf(T, IP)).toMatchObject({ id: copy.id, edited_content: X8, origin: 'propagation' });
    expect(propagationEventsFor(copy.id)).toHaveLength(1); // still only the first write's
    consent(ipId);
    const mark = eventMark();
    await save(T, 't', IP, 'Y8 eftir endursamþykki');
    expectHashed(beforeRow(onlyEvent(mark, 'edit-resave'), copy.id), X8);
    expect(bytesHold(X8)).toBe(false);
  });
});

describe('I1: the copy is found by its row and its text, not by its origin (spec AMENDED 2026-11-07, refined)', () => {
  it("PROBE-SAME: an unchanged re-save resets the copy's origin; the next act's before-image still holds X only as its hash", async () => {
    const X = 'SENTINEL-I1-SAME-DECLINER-TEXT';
    const { src, targets } = FAMILIES.same;
    const [T] = targets;
    await save(src, 's', B, X);
    await propagate('same', A, X);
    const copy = copyOf(T, A);
    expect(copy).toMatchObject({ edited_content: X, origin: 'propagation' });
    expect(propagationEventsFor(copy.id)).toHaveLength(1);
    let mark = eventMark();
    const same = await save(T, 't', A, X); // the same text: accepted, and it rewrites the row's origin
    expect(same.editId).toBe(copy.id);
    expect(copyOf(T, A)).toMatchObject({ id: copy.id, edited_content: X, origin: 'editor-save' });
    expectHashed(beforeRow(onlyEvent(mark, 'edit-resave'), copy.id), X);
    expect(bytesHold(X)).toBe(false);
    mark = eventMark();
    await save(T, 't', A, 'Y-I1-SAME endurbætt af A');
    expectHashed(beforeRow(onlyEvent(mark, 'edit-resave'), copy.id), X, 'editor-save');
    expect(bytesHold(X)).toBe(false);
  });

  it("a copy edited away and back to X: the next act's before-image holds X only as its hash", async () => {
    const X = 'SENTINEL-I1-BACK-DECLINER-TEXT';
    const { src, targets } = FAMILIES.awayBack;
    const [T] = targets;
    await save(src, 's', B, X);
    await propagate('awayBack', A, X);
    const copy = copyOf(T, A);
    expect(copy).toMatchObject({ edited_content: X, origin: 'propagation' });
    await save(T, 't', A, 'X-prime-I1 frá A');
    // A types X back. Its before-row (X') came from no propagation; its own content is found by the row and sha256(X)
    // (the residual, below), so that save holds X only as its hash too and the byte scan can see the whole case.
    await save(T, 't', A, X);
    expect(copyOf(T, A)).toMatchObject({ id: copy.id, edited_content: X, origin: 'editor-save' });
    const mark = eventMark();
    await save(T, 't', A, 'Y-I1-BACK endurbætt af A');
    expectHashed(beforeRow(onlyEvent(mark, 'edit-resave'), copy.id), X, 'editor-save');
    expect(bytesHold(X)).toBe(false);
  });

  it('control: an own row no propagation wrote keeps its text, even one another editor holds live elsewhere in the book', async () => {
    const NOBODY = 'CONTROL-I1-HELD-BY-NOBODY-ELSE';
    const W = 'CONTROL-I1-HELD-ELSEWHERE-BY-B';
    await save(HOLDER, 's', B, W); // live, another editor's, on another segment of the book
    await save(NEVER, 's', A, NOBODY);
    const own = copyOf(NEVER, A);
    expect(own).toMatchObject({ edited_content: NOBODY, origin: 'editor-save' });
    expect(propagationEventsFor(own.id)).toEqual([]); // no propagation event matches the row
    let mark = eventMark();
    await save(NEVER, 's', A, W);
    const resave = onlyEvent(mark, 'edit-resave');
    // The residual's control: the content's lookup finds no propagation for this row, and content has no book-wide
    // check, so B's live W on another segment does not withhold the W A saved.
    expect(resave.content.text).toBe(W);
    expect('textSha256' in resave.content).toBe(false);
    let row = beforeRow(resave, own.id);
    expect(row.edited_content).toBe(NOBODY);
    expect('edited_content_sha256' in row).toBe(false);
    mark = eventMark();
    await save(NEVER, 's', A, 'Y-I1-NEVER eigið');
    // The book-wide check is only for a row whose origin is still propagation: this one's is not, so B's live W
    // elsewhere does not withhold A's own W.
    row = beforeRow(onlyEvent(mark, 'edit-resave'), own.id);
    expect(row).toMatchObject({ origin: 'editor-save', edited_content: W });
    expect('edited_content_sha256' in row).toBe(false);
  });
});

describe("the residual: the event's own content is looked up by its row and its text too (spec AMENDED 2026-11-07)", () => {
  it("A types B's propagated text X back into the copy: that save's content holds X only as its hash", async () => {
    const X = 'SENTINEL-RESIDUAL-TYPED-BACK-DECLINER-TEXT';
    const { src, targets } = FAMILIES.typedBack;
    const [T] = targets;
    await save(src, 's', B, X); // B declines: nothing recorded
    await propagate('typedBack', A, X);
    const copy = copyOf(T, A);
    expect(copy).toMatchObject({ edited_content: X, origin: 'propagation' });
    expect(propagationEventsFor(copy.id)).toHaveLength(1);
    await save(T, 't', A, 'X-prime-RESIDUAL frá A');
    expect(bytesHold(X)).toBe(false); // the earlier events (the propagation, the re-save away) hold X only as its hash
    const mark = eventMark();
    const back = await save(T, 't', A, X); // its before-row holds X', which no propagation wrote
    expect(back.editId).toBe(copy.id);
    const e = onlyEvent(mark, 'edit-resave');
    expect(e.content.textSha256).toBe(sha256Text(X));
    expect('text' in e.content).toBe(false);
    expect(bytesHold(X)).toBe(false);
  });

  it("control: A types A's own propagated text back into the copy: that save's content keeps it", async () => {
    const OWN = 'CONTROL-RESIDUAL-OWN-TYPED-BACK frá A';
    const { src, targets } = FAMILIES.ownBack;
    const [T] = targets;
    // B holds a different live text on the source, so the source's check runs and has a text to find.
    await save(src, 's', B, 'CONTROL-RESIDUAL-OTHER-LIVE-TEXT');
    await save(src, 's', A, OWN);
    await propagate('ownBack', A, OWN);
    const copy = copyOf(T, A);
    expect(propagationEventsFor(copy.id)).toHaveLength(1); // the content's lookup finds this event
    await save(T, 't', A, 'OWN-prime-RESIDUAL frá A');
    const mark = eventMark();
    await save(T, 't', A, OWN);
    const e = onlyEvent(mark, 'edit-resave');
    expect(e.content.text).toBe(OWN);
    expect('textSha256' in e.content).toBe(false);
  });
});
