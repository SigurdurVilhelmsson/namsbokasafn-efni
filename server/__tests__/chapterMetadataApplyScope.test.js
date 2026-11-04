// server/__tests__/chapterMetadataApplyScope.test.js
//
// Register §C209: `chapter-metadata` is ONE module id shared by every chapter
// of a book (each chapter's `02-for-mt/chNN/chapter-metadata-segments.en.md`
// holds a single `chapter:title:chNN` segment). Applying one chapter must touch
// only that chapter's rows. Before the fix, applyApprovedEdits selected every
// approved row by (book, module_id), wrote only the applied chapter's file, and
// then stamped EVERY winner applied — other chapters' included, their text never
// written. lapseDrifted, selecting by (book, module_id) too, superseded every
// other chapter's active acceptance as content-drift, from apply and restore
// alike.
//
// Every assertion on another chapter compares the WHOLE ROW before and after
// (toEqual), never a count. Each test carries its own positive control: the
// applied chapter's rows DO change, so a harness that changed nothing would
// fail too.
//
// ⚠️ Schema comes from freshMigratedDb() — every real migration, not a
// hand-enumerated DDL (the importConcepts.test.js idiom). SESSIONS_DB_PATH is
// pointed at that same file BEFORE the services load, so activityLog (inside
// restoreVersion) writes there and never into the repo's pipeline-output/.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const built = freshMigratedDb();
process.env.SESSIONS_DB_PATH = built.path;

const service = require('../services/segmentEditorService');
const acceptance = require('../services/acceptanceService');
const contentVersionService = require('../services/contentVersionService');
const segmentParser = require('../services/segmentParser');
const tmService = require('../services/tmService');
const concordanceService = require('../services/concordanceService');
const pipelineStatusService = require('../services/pipelineStatusService');
const { HELD_BOOKS } = require('../lib/applyHold');
const { measureApplyExposure } = require('../scripts/read-apply-exposure');

const BOOK = 'c209metabook';
const META = 'chapter-metadata';
const ORD = 'm00001'; // an ordinary module in ch02
const APX = 'm00009'; // an ordinary module in appendices (-1)
const SENTINEL = '2001-02-03 04:05:06'; // an applied_at no apply could write

const TITLE = (ch) => `chapter:title:ch${String(ch).padStart(2, '0')}`;
const MT_TITLE = { 2: 'Frumeindir, sameindir og jónir', 3: 'Samsetning efna', 5: 'Varmafræði' };
const EN_TITLE = {
  2: 'Atoms, Molecules, and Ions',
  3: 'Composition of Substances',
  5: 'Thermochemistry',
};

const originalBooksDir = segmentParser.BOOKS_DIR;
const db = built.db;
let tmpDir;
let booksDir;

function writeModule(chDir, moduleId, pairs) {
  const en = join(booksDir, BOOK, '02-for-mt', chDir);
  const mt = join(booksDir, BOOK, '02-mt-output', chDir);
  mkdirSync(en, { recursive: true });
  mkdirSync(mt, { recursive: true });
  const body = (pick) =>
    pairs.map(([segId, enText, isText]) => `<!-- SEG:${segId} -->\n${pick(enText, isText)}\n`);
  writeFileSync(join(en, `${moduleId}-segments.en.md`), body((e) => e).join('\n'), 'utf-8');
  writeFileSync(join(mt, `${moduleId}-segments.is.md`), body((_, i) => i).join('\n'), 'utf-8');
}

beforeAll(() => {
  service._setTestDb(db);
  acceptance._setTestDb(db);
  contentVersionService._setTestDb(db);
  concordanceService._setTestDb(db);

  tmpDir = mkdtempSync(join(tmpdir(), 'c209-meta-'));
  booksDir = join(tmpDir, 'books');
  for (const ch of [2, 3, 5]) {
    writeModule(`ch0${ch}`, META, [[TITLE(ch), EN_TITLE[ch], MT_TITLE[ch]]]);
  }
  writeModule('ch02', ORD, [
    [`${ORD}:para:fs-id001`, 'Paragraph one.', 'Fyrsta efnisgrein.'],
    [`${ORD}:para:fs-id002`, 'Paragraph two.', 'Önnur efnisgrein.'],
  ]);
  writeModule('appendices', APX, [
    [`${APX}:para:fs-a01`, 'Appendix one.', 'Fyrsti viðaukatexti.'],
    [`${APX}:para:fs-a02`, 'Appendix two.', 'Annar viðaukatexti.'],
  ]);
  service._setTestBooksDir(booksDir);
  segmentParser._setTestBooksDir(booksDir);
});

afterAll(() => {
  service._setTestDb(null);
  acceptance._setTestDb(null);
  contentVersionService._setTestDb(null);
  concordanceService._setTestDb(null);
  service._setTestBooksDir(originalBooksDir);
  segmentParser._setTestBooksDir(originalBooksDir);
  rmSync(tmpDir, { recursive: true, force: true });
  db.close();
});

beforeEach(() => {
  db.exec('DELETE FROM segment_edits');
  db.exec('DELETE FROM segment_acceptances');
  db.exec('DELETE FROM content_versions');
  rmSync(join(booksDir, BOOK, '03-faithful-translation'), { recursive: true, force: true });
  vi.restoreAllMocks();
  // Post-apply hooks are best-effort side channels with their own DBs/timers;
  // this suite is about which ROWS an apply touches.
  vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});
  vi.spyOn(tmService, 'scheduleTmRegen').mockImplementation(() => {});
  vi.spyOn(concordanceService, 'indexModule').mockImplementation(() => {});
});

function saveAndApprove(chapter, moduleId, segmentId, editedContent) {
  const { id } = service.saveSegmentEdit({
    book: BOOK,
    chapter,
    moduleId,
    segmentId,
    originalContent: 'original',
    editedContent,
    editorId: 'editor-1',
    editorUsername: 'editor1',
  });
  service.approveEdit(id, 'reviewer-1', 'reviewer1');
  return id;
}

function accept(chapter, moduleId, segmentId, content) {
  return acceptance.acceptSegment({
    book: BOOK,
    chapter,
    moduleId,
    segmentId,
    acceptedContent: content,
    userId: 'user-1',
    username: 'editor1',
  }).acceptance.id;
}

// The editor cannot create these through acceptSegment (a published human text
// is refused as HUMAN_CONTENT, a gone segment as SEGMENT_NOT_FOUND); a direct
// insert is the acceptanceApply.test.js idiom for exactly those edges.
function insertAcceptance(chapter, moduleId, segmentId, content) {
  return db
    .prepare(
      `INSERT INTO segment_acceptances
         (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
       VALUES (?, ?, ?, ?, ?, 'u1', 'editor1')`
    )
    .run(BOOK, chapter, moduleId, segmentId, content).lastInsertRowid;
}

const editRow = (id) => db.prepare('SELECT * FROM segment_edits WHERE id = ?').get(id);
const accRow = (id) => db.prepare('SELECT * FROM segment_acceptances WHERE id = ?').get(id);
const faithfulPath = (ch, moduleId) => segmentParser.getModulePaths(BOOK, ch, moduleId).faithful;
const faithfulSegment = (ch, moduleId, segId) =>
  segmentParser
    .parseSegments(readFileSync(faithfulPath(ch, moduleId), 'utf-8'))
    .find((s) => s.segmentId === segId)?.content;

describe('§C209 fixture sanity', () => {
  it('the fixture book is not held, so the apply path is live for it', () => {
    expect(HELD_BOOKS).not.toContain(BOOK);
  });
});

describe('§C209 chapter-metadata: applying one chapter touches only that chapter', () => {
  it("apply ch02: ch02's edit is applied and written; ch05's approved edit and ch03's acceptance are untouched", () => {
    // ch05 already carries a published faithful file from an earlier apply.
    saveAndApprove(5, META, TITLE(5), 'Varmafræði (birt)');
    service.applyApprovedEdits(BOOK, 5, META);
    const ch05FileBefore = readFileSync(faithfulPath(5, META), 'utf-8');

    const e5 = saveAndApprove(5, META, TITLE(5), 'Varmafræði (endurskoðuð)');
    const a3 = accept(3, META, TITLE(3), MT_TITLE[3]);
    const e5Before = editRow(e5);
    const a3Before = accRow(a3);

    // ch02 holds no row of its own yet: other chapters' rows give it nothing to
    // apply (pre-fix this call published ch05's edit as ch02's work).
    expect(() => service.applyApprovedEdits(BOOK, 2, META)).toThrow(
      'No approved edits to apply for this module'
    );

    const e2 = saveAndApprove(2, META, TITLE(2), 'Atóm, sameindir og jónir');

    const result = service.applyApprovedEdits(BOOK, 2, META);

    // Positive control: ch02's own edit is stamped AND its text is in ch02's file.
    expect(result.savedPath).toBe(faithfulPath(2, META));
    expect(editRow(e2).status).toBe('approved');
    expect(editRow(e2).applied_at).not.toBeNull();
    expect(faithfulSegment(2, META, TITLE(2))).toBe('Atóm, sameindir og jónir');

    // The defect: ch05's edit was stamped applied with its text never written,
    // and ch03's acceptance was superseded as content-drift.
    expect(editRow(e5)).toEqual(e5Before);
    expect(editRow(e5)).toMatchObject({ status: 'approved', applied_at: null });
    expect(accRow(a3)).toEqual(a3Before);
    expect(accRow(a3)).toMatchObject({
      status: 'active',
      applied_at: null,
      superseded_at: null,
      superseded_reason: null,
    });
    expect(readFileSync(faithfulPath(5, META), 'utf-8')).toBe(ch05FileBefore);
    expect(existsSync(faithfulPath(3, META))).toBe(false);

    // Each other chapter's own apply still finds its own work — the reader-visible
    // half: pre-fix, ch05's text could never reach its file.
    service.applyApprovedEdits(BOOK, 3, META);
    expect(accRow(a3)).toMatchObject({ status: 'active', superseded_reason: null });
    expect(accRow(a3).applied_at).not.toBeNull();
    expect(editRow(e5)).toEqual(e5Before);

    service.applyApprovedEdits(BOOK, 5, META);
    expect(editRow(e5).applied_at).not.toBeNull();
    expect(faithfulSegment(5, META, TITLE(5))).toBe('Varmafræði (endurskoðuð)');
  });

  it("an acceptance-only apply of ch02 stamps ch02's acceptance and leaves ch05's active and unstamped", () => {
    const a2 = accept(2, META, TITLE(2), MT_TITLE[2]);
    const a5 = accept(5, META, TITLE(5), MT_TITLE[5]);
    const a5Before = accRow(a5);

    const result = service.applyApprovedEdits(BOOK, 2, META);

    // Positive control, same apply: the applied chapter's acceptance is stamped.
    expect(accRow(a2)).toMatchObject({ status: 'active', superseded_reason: null });
    expect(accRow(a2).applied_at).not.toBeNull();
    expect(result).toMatchObject({ acceptedCount: 1, lapsedAcceptances: 0 });

    expect(accRow(a5)).toEqual(a5Before);
    expect(existsSync(faithfulPath(5, META))).toBe(false);
  });

  it("restoring ch02 lapses ch02's drifted acceptance and never ch05's", () => {
    saveAndApprove(2, META, TITLE(2), 'Útgáfa eitt');
    service.applyApprovedEdits(BOOK, 2, META); // snapshots the MT text as version 1
    saveAndApprove(2, META, TITLE(2), 'Útgáfa tvö');
    service.applyApprovedEdits(BOOK, 2, META); // snapshots 'Útgáfa eitt' as version 2
    const a2 = insertAcceptance(2, META, TITLE(2), 'Útgáfa tvö');
    const a5 = accept(5, META, TITLE(5), MT_TITLE[5]);
    const a5Before = accRow(a5);

    contentVersionService.restoreVersion(BOOK, 2, META, 2, { username: 'he1' });

    // Positive control: the restore rewrote ch02's bytes and lapsed ch02's acceptance.
    expect(faithfulSegment(2, META, TITLE(2))).toBe('Útgáfa eitt');
    expect(accRow(a2)).toMatchObject({ status: 'superseded', superseded_reason: 'content-drift' });

    expect(accRow(a5)).toEqual(a5Before);
  });

  it("a ch02 self-heal (its file gone) resets and re-stamps ch02's rows only", () => {
    const e2 = saveAndApprove(2, META, TITLE(2), 'Atóm, sameindir og jónir');
    service.applyApprovedEdits(BOOK, 2, META);
    const e5 = saveAndApprove(5, META, TITLE(5), 'Varmafræði (birt)');
    service.applyApprovedEdits(BOOK, 5, META);
    const a3 = accept(3, META, TITLE(3), MT_TITLE[3]);
    service.applyApprovedEdits(BOOK, 3, META);
    // Pin the other chapters' publication stamps to a value no apply can write, so
    // a reset-then-restamp within the same second cannot pass for "untouched".
    db.prepare('UPDATE segment_edits SET applied_at = ? WHERE id = ?').run(SENTINEL, e5);
    db.prepare('UPDATE segment_acceptances SET applied_at = ? WHERE id = ?').run(SENTINEL, a3);
    const e5Before = editRow(e5);
    const a3Before = accRow(a3);

    rmSync(faithfulPath(2, META));
    const result = service.applyApprovedEdits(BOOK, 2, META);

    // Positive control: the self-heal ran for ch02 and rebuilt its file.
    expect(result.appliedCount).toBe(1);
    expect(editRow(e2).applied_at).not.toBeNull();
    expect(faithfulSegment(2, META, TITLE(2))).toBe('Atóm, sameindir og jónir');

    expect(editRow(e5)).toEqual(e5Before);
    expect(accRow(a3)).toEqual(a3Before);
  });

  it('apply-status for a chapter counts that chapter only, so it agrees with that chapter’s apply', () => {
    saveAndApprove(2, META, TITLE(2), 'Atóm, sameindir og jónir');
    service.applyApprovedEdits(BOOK, 2, META);
    saveAndApprove(5, META, TITLE(5), 'Varmafræði (endurskoðuð)'); // approved, unapplied
    accept(3, META, TITLE(3), MT_TITLE[3]); // active, unapplied

    expect(service.getApplyStatus(BOOK, META, 2)).toMatchObject({
      unapplied_count: 0,
      applied_count: 1,
      total_approved: 1,
      unapplied_acceptances: 0,
      applied_acceptances: 0,
    });
    // Positive controls: the other chapters' work is reported where it lives.
    expect(service.getApplyStatus(BOOK, META, 5)).toMatchObject({
      unapplied_count: 1,
      applied_count: 0,
      total_approved: 1,
    });
    expect(service.getApplyStatus(BOOK, META, 3)).toMatchObject({
      total_approved: 0,
      unapplied_acceptances: 1,
    });
    // ...and ch02's apply agrees there is nothing left for ch02.
    expect(() => service.applyApprovedEdits(BOOK, 2, META)).toThrow(
      'All approved edits have already been applied'
    );

    rmSync(faithfulPath(2, META));
    expect(service.getApplyStatus(BOOK, META, 2)).toMatchObject({
      faithful_exists: false,
      can_rebuild: true,
    });

    // No chapter given (no production caller does this): the module-wide count, as before.
    expect(service.getApplyStatus(BOOK, META)).toMatchObject({
      unapplied_count: 1,
      applied_count: 1,
      total_approved: 2,
      unapplied_acceptances: 1,
      faithful_exists: null,
    });
  });
});

describe('§C209 controls: ordinary modules apply exactly as before', () => {
  it("an ordinary module: a gone segment's winner is still stamped and a gone segment's acceptance still lapses", () => {
    // These are the two behaviours a segment-id scoping rule would have changed;
    // chapter scoping must leave both alone.
    const live = saveAndApprove(2, ORD, `${ORD}:para:fs-id001`, 'Yfirfarin efnisgrein.');
    const gone = saveAndApprove(2, ORD, `${ORD}:para:fs-gone`, 'Bútur sem er horfinn.');
    const kept = accept(2, ORD, `${ORD}:para:fs-id002`, 'Önnur efnisgrein.');
    const lapsed = insertAcceptance(2, ORD, `${ORD}:para:fs-gone`, 'Horfinn texti.');

    const result = service.applyApprovedEdits(BOOK, 2, ORD);

    expect(result).toMatchObject({ appliedCount: 2, acceptedCount: 1, lapsedAcceptances: 1 });
    expect(faithfulSegment(2, ORD, `${ORD}:para:fs-id001`)).toBe('Yfirfarin efnisgrein.');
    expect(editRow(live).applied_at).not.toBeNull();
    expect(editRow(gone).applied_at).not.toBeNull(); // stamped though unwritable, as before
    expect(faithfulSegment(2, ORD, `${ORD}:para:fs-gone`)).toBeUndefined();
    expect(accRow(kept)).toMatchObject({ status: 'active', superseded_reason: null });
    expect(accRow(kept).applied_at).not.toBeNull();
    expect(accRow(lapsed)).toMatchObject({
      status: 'superseded',
      superseded_reason: 'content-drift',
    });
  });

  it('an appendices module: rows stored under -1 are the rows an apply under -1 sees', () => {
    const e = saveAndApprove(-1, APX, `${APX}:para:fs-a01`, 'Viðauki yfirfarinn.');
    const a = accept(-1, APX, `${APX}:para:fs-a02`, 'Annar viðaukatexti.');

    const result = service.applyApprovedEdits(BOOK, -1, APX);

    expect(result.savedPath).toBe(
      join(booksDir, BOOK, '03-faithful-translation', 'appendices', `${APX}-segments.is.md`)
    );
    expect(result).toMatchObject({ appliedCount: 1, acceptedCount: 1, lapsedAcceptances: 0 });
    expect(editRow(e).applied_at).not.toBeNull();
    expect(accRow(a).applied_at).not.toBeNull();
    expect(faithfulSegment(-1, APX, `${APX}:para:fs-a01`)).toBe('Viðauki yfirfarinn.');
  });
});

describe('§C209 concordance: indexing one chapter keeps every other chapter’s rows', () => {
  // The real indexer here, not the outer beforeEach's mock: the apply path's
  // post-commit hook (and restore's) rebuilds tm_segments for the module it wrote.
  const tmRows = () =>
    db
      .prepare(
        `SELECT chapter, module_id, segment_id, en_text, is_text FROM tm_segments
         WHERE book = ? ORDER BY module_id, segment_id`
      )
      .all(BOOK);
  const ftsHits = (q) =>
    db
      .prepare(
        `SELECT t.segment_id FROM tm_segments_fts f JOIN tm_segments t ON t.id = f.rowid
         WHERE f.tm_segments_fts MATCH ? ORDER BY t.segment_id`
      )
      .all(q)
      .map((r) => r.segment_id);
  // A planted row carries its FTS mirror row too, as indexModule writes them: deleting
  // an external-content FTS row that was never indexed would corrupt the index.
  function plantTmRow(chapterLabel, moduleId, segmentId, en, is) {
    const id = db
      .prepare(
        `INSERT INTO tm_segments(book, chapter, module_id, segment_id, en_text, is_text, en_norm)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(BOOK, chapterLabel, moduleId, segmentId, en, is, en.toLowerCase()).lastInsertRowid;
    db.prepare(`INSERT INTO tm_segments_fts(rowid, en_text, is_text) VALUES (?, ?, ?)`).run(
      id,
      en,
      is
    );
  }
  const metaRow = (ch, is) => ({
    chapter: String(ch),
    module_id: META,
    segment_id: TITLE(ch),
    en_text: EN_TITLE[ch],
    is_text: is,
  });

  beforeEach(() => {
    concordanceService.indexModule.mockRestore();
    db.exec(`INSERT INTO tm_segments_fts(tm_segments_fts) VALUES('delete-all')`);
    db.exec('DELETE FROM tm_segments');
  });

  it("apply ch02 then ch05: both chapters' titles stay indexed, in the table and its FTS mirror", () => {
    saveAndApprove(2, META, TITLE(2), 'Atóm, sameindir og jónir');
    service.applyApprovedEdits(BOOK, 2, META);
    // Positive control: the real indexer ran for ch02.
    expect(tmRows()).toEqual([metaRow(2, 'Atóm, sameindir og jónir')]);

    saveAndApprove(5, META, TITLE(5), 'Varmafræði (endurskoðuð)');
    service.applyApprovedEdits(BOOK, 5, META);

    // The defect: ch05's re-index deleted every (book, chapter-metadata) row, ch02's included.
    expect(tmRows()).toEqual([
      metaRow(2, 'Atóm, sameindir og jónir'),
      metaRow(5, 'Varmafræði (endurskoðuð)'),
    ]);
    expect(ftsHits('Atoms')).toEqual([TITLE(2)]);
    expect(ftsHits('Thermochemistry')).toEqual([TITLE(5)]);

    // Re-applying ch02 still REPLACES ch02's row (no duplicate, old text gone from
    // the FTS mirror) and leaves ch05's alone.
    saveAndApprove(2, META, TITLE(2), 'Frumeindir (endurskoðað)');
    service.applyApprovedEdits(BOOK, 2, META);
    expect(tmRows()).toEqual([
      metaRow(2, 'Frumeindir (endurskoðað)'),
      metaRow(5, 'Varmafræði (endurskoðuð)'),
    ]);
    expect(ftsHits('sameindir')).toEqual([]);
    expect(ftsHits('Frumeindir')).toEqual([TITLE(2)]);
  });

  it('a restore of ch02 re-indexes ch02 and keeps ch05’s row', () => {
    saveAndApprove(5, META, TITLE(5), 'Varmafræði (birt)');
    service.applyApprovedEdits(BOOK, 5, META);
    saveAndApprove(2, META, TITLE(2), 'Útgáfa eitt');
    // Versions are numbered per chapter (§C209 (b)): ch05's snapshot above is ch05's
    // version 1, and does not move ch02's numbering.
    service.applyApprovedEdits(BOOK, 2, META); // snapshots ch02's MT text as ch02's version 1
    saveAndApprove(2, META, TITLE(2), 'Útgáfa tvö');
    service.applyApprovedEdits(BOOK, 2, META); // snapshots 'Útgáfa eitt' as ch02's version 2
    expect(tmRows()).toEqual([metaRow(2, 'Útgáfa tvö'), metaRow(5, 'Varmafræði (birt)')]);

    contentVersionService.restoreVersion(BOOK, 2, META, 2, { username: 'he1' });

    // Positive control: the restore re-indexed ch02 with the restored text.
    expect(tmRows()).toEqual([metaRow(2, 'Útgáfa eitt'), metaRow(5, 'Varmafræði (birt)')]);
  });

  it('an ordinary module re-indexes exactly as before: every prior row of the module is replaced', () => {
    // A row for a segment no longer in the file, under the module's own chapter label:
    // the re-index removes it, as the module-wide delete always did.
    plantTmRow('2', ORD, `${ORD}:para:fs-gone`, 'Gone paragraph.', 'Horfin efnisgrein.');
    // A row for a segment still in the file under a label no current writer produces
    // ('02'): scoping the delete by chapter alone would leave it, and the insert would
    // then fail UNIQUE(book, module_id, segment_id) and throw.
    plantTmRow('02', ORD, `${ORD}:para:fs-id001`, 'Paragraph one.', 'Gömul þýðing.');

    expect(concordanceService.indexModule(BOOK, 2, ORD)).toEqual({ indexed: 2, skipped: 0 });

    expect(tmRows()).toEqual([
      {
        chapter: '2',
        module_id: ORD,
        segment_id: `${ORD}:para:fs-id001`,
        en_text: 'Paragraph one.',
        is_text: 'Fyrsta efnisgrein.',
      },
      {
        chapter: '2',
        module_id: ORD,
        segment_id: `${ORD}:para:fs-id002`,
        en_text: 'Paragraph two.',
        is_text: 'Önnur efnisgrein.',
      },
    ]);
    expect(ftsHits('Gone')).toEqual([]);
    expect(ftsHits('Gömul')).toEqual([]);
    expect(ftsHits('Paragraph')).toEqual([`${ORD}:para:fs-id001`, `${ORD}:para:fs-id002`]);
  });
});

describe('§C209 the read-only exposure mirror predicts what one chapter’s click does', () => {
  const ZERO = {
    'already-present': 0,
    clean: 0,
    'base-changed': 0,
    'segment-gone': 0,
    'not-written': 0,
  };

  it("one entry per (module, chapter), read from that chapter's file; ch02's entry names exactly the rows a ch02 apply stamps", () => {
    const e2 = saveAndApprove(2, META, TITLE(2), 'Atóm, sameindir og jónir');
    const e5 = saveAndApprove(5, META, TITLE(5), 'Varmafræði (endurskoðuð)');
    accept(3, META, TITLE(3), MT_TITLE[3]);

    const report = measureApplyExposure(db, BOOK, segmentParser.loadModuleForEditing);
    const meta = report.modules.filter((m) => m.module === META);
    // 'base-changed': the fixture's original_content is 'original', not today's text.
    expect(
      meta.map((m) => ({
        chapter: m.chapter,
        path: m.path,
        winners: m.winners,
        ids: m.baseChangedEditIds,
      }))
    ).toEqual([
      { chapter: 2, path: 'normal', winners: { ...ZERO, 'base-changed': 1 }, ids: [e2] },
      { chapter: 5, path: 'normal', winners: { ...ZERO, 'base-changed': 1 }, ids: [e5] },
    ]);
    // ch03 holds only an acceptance, and a ch03 click writes it.
    expect(report.acceptanceOnly).toEqual([
      { module: META, chapter: 3, activeUnappliedAcceptances: 1 },
    ]);

    const result = service.applyApprovedEdits(BOOK, 2, META);

    const stamped = db
      .prepare('SELECT id FROM segment_edits WHERE book = ? AND applied_at IS NOT NULL ORDER BY id')
      .all(BOOK)
      .map((r) => r.id);
    expect(result.appliedCount).toBe(1);
    expect(stamped).toEqual(meta[0].baseChangedEditIds);
  });
});

describe('§C209 the in-transaction re-query is chapter-scoped too', () => {
  // A concurrent publish lands between the pre-check and the IMMEDIATE transaction's
  // re-query. The spy wraps the REAL transaction and, when the apply starts it, first
  // stamps the given row the way the winning request would have.
  function concurrentPublishOf(table, id) {
    const realTransaction = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementationOnce((fn) => {
      const tx = realTransaction(fn);
      return {
        immediate: () => {
          db.prepare(`UPDATE ${table} SET applied_at = ? WHERE id = ?`).run(SENTINEL, id);
          return tx.immediate();
        },
      };
    });
  }
  const versionRows = () => db.prepare('SELECT COUNT(*) AS n FROM content_versions').get().n;

  it('edits: a ch02 apply that lost the race aborts although ch05 holds unapplied work', () => {
    const e5 = saveAndApprove(5, META, TITLE(5), 'Varmafræði (endurskoðuð)');
    const e2 = saveAndApprove(2, META, TITLE(2), 'Atóm, sameindir og jónir');
    const e5Before = editRow(e5);
    concurrentPublishOf('segment_edits', e2);

    expect(() => service.applyApprovedEdits(BOOK, 2, META)).toThrow(
      'Edits were applied by a concurrent request'
    );
    expect(existsSync(faithfulPath(2, META))).toBe(false);
    expect(versionRows()).toBe(0);
    expect(editRow(e5)).toEqual(e5Before);
    expect(editRow(e2).applied_at).toBe(SENTINEL);

    // Positive control: the same call with ch02's row unapplied goes ahead.
    db.prepare('UPDATE segment_edits SET applied_at = NULL WHERE id = ?').run(e2);
    expect(service.applyApprovedEdits(BOOK, 2, META).appliedCount).toBe(1);
    expect(editRow(e5)).toEqual(e5Before);
  });

  it('acceptances: a ch02 apply that lost the race aborts although ch05 holds an unapplied acceptance', () => {
    const a5 = accept(5, META, TITLE(5), MT_TITLE[5]);
    const a2 = accept(2, META, TITLE(2), MT_TITLE[2]);
    const a5Before = accRow(a5);
    concurrentPublishOf('segment_acceptances', a2);

    expect(() => service.applyApprovedEdits(BOOK, 2, META)).toThrow(
      'Edits were applied by a concurrent request'
    );
    expect(existsSync(faithfulPath(2, META))).toBe(false);
    expect(versionRows()).toBe(0);
    expect(accRow(a5)).toEqual(a5Before);
    expect(accRow(a2).applied_at).toBe(SENTINEL);

    // Positive control: the same call with ch02's acceptance unapplied goes ahead.
    db.prepare('UPDATE segment_acceptances SET applied_at = NULL WHERE id = ?').run(a2);
    expect(service.applyApprovedEdits(BOOK, 2, META).acceptedCount).toBe(1);
    expect(accRow(a5)).toEqual(a5Before);
  });
});
