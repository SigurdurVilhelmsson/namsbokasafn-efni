/**
 * Apply and restore return their before-images (G1.2; spec §5.9; plan Task 17, decisions 46, 47,
 * 48; Review Focus 28). The keys are additive: `before` holds the rows the apply changed, read in
 * its own transaction before its writes (the winners it applied, the losers it superseded, the rows
 * a self-heal reset), and the ids of the acceptances it lapsed and stamped. Task 24 turns them into
 * research events; the routes strip them (applyRoutesNoBefore.test.js).
 *
 * The chapter-metadata describe is the controller's Ruling C: `chapter-metadata` is one module id
 * shared by every chapter (§C209), so a before-image whose SELECT drops the chapter would list
 * another chapter's rows that the write never touched.
 *
 * On a database built by every real migration (freshMigratedDb); SESSIONS_DB_PATH points at the
 * same file before any service loads, so activityLog (inside restoreVersion) writes there. The
 * books root is a temp directory, so nothing under books/ or pipeline-output/ is written.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const built = freshMigratedDb();
process.env.SESSIONS_DB_PATH = built.path;

const service = require('../services/segmentEditorService');
const acceptanceService = require('../services/acceptanceService');
const contentVersionService = require('../services/contentVersionService');
const segmentParser = require('../services/segmentParser');
const tmService = require('../services/tmService');
const concordanceService = require('../services/concordanceService');
const pipelineStatusService = require('../services/pipelineStatusService');
const { HELD_BOOKS } = require('../lib/applyHold');
const { writeModule, writeRaw } = require('./helpers/servedFixture');

const BOOK = 'testbook';
const M = 'm96801';
const LOC = 'm96802';
const META = 'chapter-metadata';
const seg = (x) => `${M}:para:${x}`;
const TITLE = (ch) => `chapter:title:ch${String(ch).padStart(2, '0')}`;
const MT_TITLE = { 2: 'Frumeindir, sameindir og jónir', 5: 'Varmafræði' };
const SENTINEL = '2001-02-03 04:05:06'; // an applied_at no apply could write

const db = built.db;
let root;
let realBooksDir;

beforeAll(() => {
  service._setTestDb(db);
  acceptanceService._setTestDb(db);
  contentVersionService._setTestDb(db);
  concordanceService._setTestDb(db);
  realBooksDir = segmentParser.BOOKS_DIR;
  root = mkdtempSync(path.join(tmpdir(), 'apply-before-images-'));
  writeModule(root, {
    book: BOOK,
    chapterDir: 'ch01',
    moduleId: M,
    en: ['a', 'b', 'c'].map((x) => [seg(x), `EN ${x}`]),
    mt: ['a', 'b', 'c'].map((x) => [seg(x), `IS ${x}`]),
  });
  for (const ch of [2, 5]) {
    writeModule(root, {
      book: BOOK,
      chapterDir: `ch0${ch}`,
      moduleId: META,
      en: [[TITLE(ch), `EN title ${ch}`]],
      mt: [[TITLE(ch), MT_TITLE[ch]]],
    });
  }
  service._setTestBooksDir(root);
  segmentParser._setTestBooksDir(root);
});

afterAll(() => {
  service._setTestBooksDir(realBooksDir);
  segmentParser._setTestBooksDir(realBooksDir);
  service._setTestDb(null);
  acceptanceService._setTestDb(null);
  contentVersionService._setTestDb(null);
  concordanceService._setTestDb(null);
  db.close();
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec(
    'DELETE FROM segment_acceptances; DELETE FROM segment_edits; DELETE FROM content_versions;'
  );
  rmSync(path.join(root, BOOK, '03-faithful-translation'), { recursive: true, force: true });
  rmSync(path.join(root, BOOK, '04-localized-content'), { recursive: true, force: true });
  vi.restoreAllMocks();
  // Decision 59: the post-apply hooks have their own timers and databases.
  vi.spyOn(tmService, 'scheduleTmRegen').mockImplementation(() => {});
  vi.spyOn(concordanceService, 'indexModule').mockImplementation(() => {});
  vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});
});

const rowOf = (id) => db.prepare('SELECT * FROM segment_edits WHERE id = ?').get(id);
const accOf = (id) => db.prepare('SELECT * FROM segment_acceptances WHERE id = ?').get(id);

/** An approved edit, straight into the table: two approved rows on one segment is the shape. */
function approved(segmentId, text, { editor, createdAt, note = null, chapter = 1, module = M }) {
  return Number(
    db
      .prepare(
        `INSERT INTO segment_edits
           (book, chapter, module_id, segment_id, original_content, edited_content,
            editor_id, editor_username, status, reviewer_note, created_at)
         VALUES (?, ?, ?, ?, 'BASE', ?, ?, ?, 'approved', ?, ?)`
      )
      .run(BOOK, chapter, module, segmentId, text, editor, editor, note, createdAt).lastInsertRowid
  );
}

/** An active, unapplied acceptance (the chapterMetadataApplyScope.test.js idiom). */
function acceptance(segmentId, content, { chapter = 1, module = M } = {}) {
  return Number(
    db
      .prepare(
        `INSERT INTO segment_acceptances
           (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
         VALUES (?, ?, ?, ?, ?, 'p-z', 'z')`
      )
      .run(BOOK, chapter, module, segmentId, content).lastInsertRowid
  );
}

const faithfulPath = (ch, moduleId) => segmentParser.getModulePaths(BOOK, ch, moduleId).faithful;

// p-a's A1 (older) and p-b's B1 (newer) on `a`, p-b's B2 on `b`; X on `c` attests the served
// text (unchanged by the apply), Y on `b` attests a text the apply replaces.
function seedModule() {
  const A1 = approved(seg('a'), 'A1 texti', {
    editor: 'p-a',
    createdAt: '2026-01-01 00:00:00',
    note: 'fyrri athugasemd',
  });
  const B1 = approved(seg('a'), 'B1 texti', { editor: 'p-b', createdAt: '2026-01-02 00:00:00' });
  const B2 = approved(seg('b'), 'B2 texti', { editor: 'p-b', createdAt: '2026-01-02 00:00:01' });
  const X = acceptance(seg('c'), 'IS c');
  const Y = acceptance(seg('b'), 'IS b');
  return { A1, B1, B2, X, Y };
}

describe('fixture sanity', () => {
  it('the fixture book is not held, so the apply path is live for it', () => {
    expect(HELD_BOOKS).not.toContain(BOOK);
  });
});

describe('applyApprovedEdits returns its before-images', () => {
  it('apply returns the winners and losers as they were, and the acceptances it lapsed', () => {
    const { A1, B1, B2, X, Y } = seedModule();
    const snap = { A1: rowOf(A1), B1: rowOf(B1), B2: rowOf(B2) };

    const r = service.applyApprovedEdits(BOOK, 1, M);

    expect(r.before.applied).toEqual([snap.B1, snap.B2]);
    expect(r.before.applied.map((e) => e.applied_at)).toEqual([null, null]);
    expect(r.before.superseded).toEqual([snap.A1]);
    expect(r.before.superseded[0].reviewer_note).toBe('fyrri athugasemd');
    expect(r.before.lapsedAcceptanceIds).toEqual([Y]);
    expect(r.lapsedAcceptances).toBe(1);
    expect(r.before.stampedAcceptanceIds).toEqual([X]);
    expect(r.acceptedCount).toBe(1);
    expect(accOf(X).applied_at).not.toBeNull();
    expect(rowOf(A1).reviewer_note).toBe(service.SUPERSEDED_BY_NEWER_NOTE);
    expect(r.before.selfHealReset).toEqual({ edits: [], acceptances: [] });
    expect(Object.keys(r).sort()).toEqual([
      'acceptedCount',
      'appliedCount',
      'before',
      'lapsedAcceptances',
      'savedPath',
      'supersededCount',
      'totalEditsMarked',
    ]);
  });

  it('the superseded note is the one the apply writes (decision 48)', () => {
    expect(service.SUPERSEDED_BY_NEWER_NOTE).toBe('Leyst úr gildi af nýrri samþykktri breytingu');
  });

  it('the self-heal reports the rows whose applied_at it reset, as they were', () => {
    const { B1, B2, X } = seedModule();
    service.applyApprovedEdits(BOOK, 1, M);
    rmSync(faithfulPath(1, M));
    const snap = { B1: rowOf(B1), B2: rowOf(B2), X: accOf(X) };
    expect(snap.B1.applied_at).not.toBeNull();
    expect(snap.X.applied_at).not.toBeNull();

    const r2 = service.applyApprovedEdits(BOOK, 1, M);

    expect(r2.before.selfHealReset.edits).toEqual([snap.B1, snap.B2]);
    expect(r2.before.selfHealReset.acceptances).toEqual([snap.X]);
    expect(r2.before.applied.map((e) => e.id)).toEqual([B1, B2]);
    expect(r2.before.applied.map((e) => e.applied_at)).toEqual([null, null]);
    expect(r2.before.stampedAcceptanceIds).toEqual([X]);
    expect(r2.before.lapsedAcceptanceIds).toEqual([]);
    expect(readFileSync(faithfulPath(1, M), 'utf-8')).toContain('B1 texti');
  });

  it('a self-heal whose recursive apply throws leaves the reset committed and returns nothing (Review Focus 28)', () => {
    const { B1 } = seedModule();
    service.applyApprovedEdits(BOOK, 1, M);
    rmSync(faithfulPath(1, M));
    expect(rowOf(B1).applied_at).not.toBeNull();
    vi.spyOn(segmentParser, 'saveModuleSegments').mockImplementationOnce(() => {
      throw new Error('boom');
    });

    expect(() => service.applyApprovedEdits(BOOK, 1, M)).toThrow(/boom/);
    expect(rowOf(B1).applied_at).toBeNull();
  });
});

describe('the acceptance writers return the ids they changed', () => {
  it('lapseDriftedIds returns the ids lapseDrifted counts', () => {
    const kept = acceptance(seg('a'), 'same');
    const drifted = acceptance(seg('b'), 'old');
    expect(
      acceptanceService.lapseDriftedIds(BOOK, 1, M, [
        { segmentId: seg('a'), content: 'same' },
        { segmentId: seg('b'), content: 'new' },
        { segmentId: seg('c'), content: 'IS c' },
      ])
    ).toEqual([drifted]);
    expect(accOf(kept).status).toBe('active');
    expect(accOf(drifted).superseded_reason).toBe('content-drift');

    db.exec('DELETE FROM segment_acceptances');
    acceptance(seg('a'), 'same');
    acceptance(seg('b'), 'old');
    expect(
      acceptanceService.lapseDrifted(BOOK, 1, M, [
        { segmentId: seg('a'), content: 'same' },
        { segmentId: seg('b'), content: 'new' },
      ])
    ).toBe(1);
  });

  it('stampAppliedIds returns the ids stampApplied counts (Ruling B)', () => {
    const first = acceptance(seg('a'), 'A');
    const second = acceptance(seg('b'), 'B');
    const lapsed = acceptance(seg('c'), 'C');
    db.prepare(`UPDATE segment_acceptances SET status = 'superseded' WHERE id = ?`).run(lapsed);
    expect(acceptanceService.stampAppliedIds(BOOK, 1, M)).toEqual([first, second]);
    expect(accOf(first).applied_at).not.toBeNull();
    expect(accOf(lapsed).applied_at).toBeNull();
    expect(acceptanceService.stampAppliedIds(BOOK, 1, M)).toEqual([]);

    db.exec('DELETE FROM segment_acceptances');
    acceptance(seg('a'), 'A');
    acceptance(seg('b'), 'B');
    expect(acceptanceService.stampApplied(BOOK, 1, M)).toBe(2);
  });

  it('the ids functions check the chapter as the count functions do', () => {
    expect(() => acceptanceService.lapseDriftedIds(BOOK, M, [])).toThrow(
      /lapseDriftedIds: chapter must be an integer/
    );
    expect(() => acceptanceService.stampAppliedIds(BOOK, M)).toThrow(
      /stampAppliedIds: chapter must be an integer/
    );
  });
});

describe('restoreVersion reports the acceptances it lapsed', () => {
  it("a faithful restore reports the acceptances it lapsed; a localized restore's result is unchanged", () => {
    const { X } = seedModule();
    service.applyApprovedEdits(BOOK, 1, M); // snapshots the MT text as version 1
    const Z = acceptance(seg('b'), 'B2 texti'); // attests today's faithful text, which v1 replaces

    const r = contentVersionService.restoreVersion(BOOK, 1, M, 1, { username: 'h' });

    expect(r.before).toEqual({ lapsedAcceptanceIds: [Z] });
    expect(accOf(Z).superseded_reason).toBe('content-drift');
    expect(accOf(X).status).toBe('active'); // its bytes ('IS c') are the same in v1

    writeModule(root, {
      book: BOOK,
      chapterDir: 'ch01',
      moduleId: LOC,
      en: [[`${LOC}:para:a`, 'EN one']],
      faithful: [[`${LOC}:para:a`, 'trúr A']],
    });
    writeRaw(
      root,
      `${BOOK}/04-localized-content/ch01/${LOC}-segments.is.md`,
      `<!-- SEG:${LOC}:para:a -->\nstaðfært A v2\n`
    );
    contentVersionService.snapshotModule(
      BOOK,
      1,
      LOC,
      [{ segmentId: `${LOC}:para:a`, content: 'staðfært A v1' }],
      'ed1',
      undefined,
      'localized'
    );
    const loc = contentVersionService.restoreVersion(BOOK, 1, LOC, 1, {}, 'localized');
    expect(loc.segmentsRestored).toBe(1); // positive control: the localized restore ran
    expect('before' in loc).toBe(false);
  });
});

describe('chapter-metadata: one chapter’s before-images hold that chapter’s rows only (§C209, Ruling C)', () => {
  const editIn = (ch, text, createdAt) =>
    approved(TITLE(ch), text, { editor: 'p-a', createdAt, chapter: ch, module: META });
  const accIn = (ch, content) => acceptance(TITLE(ch), content, { chapter: ch, module: META });

  it("apply ch02: the stamped, lapsed and applied lists are ch02's; ch05's unapplied rows are untouched", () => {
    const e5 = editIn(5, 'Varmafræði (ný)', '2026-01-01 00:00:00');
    const u5 = accIn(5, MT_TITLE[5]);
    const before5 = { e5: rowOf(e5), u5: accOf(u5) };

    const a2 = accIn(2, MT_TITLE[2]);
    const r1 = service.applyApprovedEdits(BOOK, 2, META);
    expect(r1.before.stampedAcceptanceIds).toEqual([a2]);
    expect(r1.before.lapsedAcceptanceIds).toEqual([]);
    expect(r1.before.applied).toEqual([]);

    const e2 = editIn(2, 'Atóm, sameindir og jónir', '2026-01-02 00:00:00');
    const r2 = service.applyApprovedEdits(BOOK, 2, META);
    expect(r2.before.applied.map((e) => e.id)).toEqual([e2]);
    expect(r2.before.lapsedAcceptanceIds).toEqual([a2]);
    expect(r2.before.stampedAcceptanceIds).toEqual([]);

    expect(rowOf(e5)).toEqual(before5.e5);
    expect(accOf(u5)).toEqual(before5.u5);
  });

  it("a ch02 self-heal reports ch02's reset rows only; ch05's applied rows keep their stamps", () => {
    const e5 = editIn(5, 'Varmafræði (birt)', '2026-01-01 00:00:00');
    service.applyApprovedEdits(BOOK, 5, META);
    const a5 = accIn(5, 'Varmafræði (birt)');
    service.applyApprovedEdits(BOOK, 5, META);
    db.prepare('UPDATE segment_edits SET applied_at = ? WHERE id = ?').run(SENTINEL, e5);
    db.prepare('UPDATE segment_acceptances SET applied_at = ? WHERE id = ?').run(SENTINEL, a5);
    const before5 = { e5: rowOf(e5), a5: accOf(a5) };

    const e2 = editIn(2, 'Atóm, sameindir og jónir', '2026-01-02 00:00:00');
    service.applyApprovedEdits(BOOK, 2, META);
    const a2 = accIn(2, 'Atóm, sameindir og jónir');
    service.applyApprovedEdits(BOOK, 2, META);
    const snap2 = { e2: rowOf(e2), a2: accOf(a2) };
    expect(snap2.e2.applied_at).not.toBeNull();
    expect(snap2.a2.applied_at).not.toBeNull();

    rmSync(faithfulPath(2, META));
    const r = service.applyApprovedEdits(BOOK, 2, META);

    expect(r.before.selfHealReset).toEqual({ edits: [snap2.e2], acceptances: [snap2.a2] });
    expect(r.before.applied.map((e) => e.id)).toEqual([e2]);
    expect(r.before.stampedAcceptanceIds).toEqual([a2]);
    expect(r.before.lapsedAcceptanceIds).toEqual([]);
    expect(rowOf(e5)).toEqual(before5.e5);
    expect(accOf(a5)).toEqual(before5.a5);
  });

  it("restoring ch02 lapses and reports ch02's acceptance only", () => {
    editIn(2, 'Útgáfa eitt', '2026-01-01 00:00:00');
    service.applyApprovedEdits(BOOK, 2, META); // snapshots the MT title as ch02's version 1
    const a2 = accIn(2, 'Útgáfa eitt');
    const u5 = accIn(5, MT_TITLE[5]);
    const before5 = accOf(u5);

    const r = contentVersionService.restoreVersion(BOOK, 2, META, 1, { username: 'h' });

    expect(r.before).toEqual({ lapsedAcceptanceIds: [a2] });
    expect(accOf(a2).superseded_reason).toBe('content-drift');
    expect(accOf(u5)).toEqual(before5);
  });
});
