// server/__tests__/chapterMetadataReviewVersions.test.js
//
// Register §C209 follow-ups (a) and (b). `chapter-metadata` is ONE module id
// shared by every chapter of a book (each chapter's file holds a single
// `chapter:title:chNN` segment). #621 scoped the apply path to the chapter; two
// paths of the same class were left keyed by (book, module_id):
//
//  (a) module review: submitModuleForReview's pending-review check, its edit
//      count and its review_id stamp, getModuleReviewWithEdits, and the module
//      stats that gate the editor's submit button. A ch02 submit claimed ch05's
//      edits and blocked a ch05 submit.
//  (b) version history ("Útgáfusaga"): content_versions numbering, listing and
//      reading. A chapter's history listed other chapters' snapshots, and a
//      restore of another chapter's version number wrote a pointless snapshot.
//
// Every assertion on another chapter compares VALUES (whole rows, ids, texts),
// never a bare count, and each test carries a positive control: the chapter
// acted on DOES change, so a harness that changed nothing would fail too.
//
// The version tests drive the surfaces whose signatures do not change (the
// route handlers, snapshotModule's return value, restoreVersion), so the same
// assertions read the defect before the fix and the fix after it.
//
// ⚠️ Schema comes from freshMigratedDb() — every real migration, not a
// hand-enumerated DDL (the importConcepts.test.js idiom). SESSIONS_DB_PATH is
// pointed at that same file BEFORE the services and routes load, so
// activityLog (inside restoreVersion) writes there and never into the repo's
// pipeline-output/.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const built = freshMigratedDb();
process.env.SESSIONS_DB_PATH = built.path;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const service = require('../services/segmentEditorService');
const acceptance = require('../services/acceptanceService');
const contentVersionService = require('../services/contentVersionService');
const segmentParser = require('../services/segmentParser');
const tmService = require('../services/tmService');
const concordanceService = require('../services/concordanceService');
const pipelineStatusService = require('../services/pipelineStatusService');
const { HELD_BOOKS } = require('../lib/applyHold');
const segmentEditorRouter = require('../routes/segment-editor');
const localizationEditorRouter = require('../routes/localization-editor');

const BOOK = 'c209metabook';
const META = 'chapter-metadata';
const ORD = 'm00001'; // an ordinary module in ch02

const TITLE = (ch) => `chapter:title:ch${String(ch).padStart(2, '0')}`;
const MT_TITLE = { 2: 'Frumeindir, sameindir og jónir', 5: 'Varmafræði' };
const EN_TITLE = { 2: 'Atoms, Molecules, and Ions', 5: 'Thermochemistry' };
const ORD_SEG = (n) => `${ORD}:para:fs-id00${n}`;

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

// ─── Route handlers, invoked past their auth/validation middleware ───────────
// (the locRestoreRoutes.test.js idiom: validateBookChapter is what sets
// req.chapterNum, so each request carries the value it would have set).
function handler(router, routePath, method) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method]
  );
  if (!layer) throw new Error(`route not found: ${method} ${routePath}`);
  return layer.route.stack.at(-1).handle;
}

function invoke(h, req) {
  let resolveResult;
  const done = new Promise((resolve) => {
    resolveResult = resolve;
  });
  const res = {
    statusCode: 200,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(body) {
      resolveResult({ status: this.statusCode, body });
    },
  };
  return Promise.resolve(h(req, res)).then(() => done);
}

const req = (chapter, moduleId, extra = {}) => ({
  params: { book: BOOK, chapter: String(chapter), moduleId, ...extra },
  chapterNum: chapter,
  user: { id: 'editor-1', username: 'editor1' },
  body: {},
});

const routes = {
  load: handler(segmentEditorRouter, '/:book/:chapter/:moduleId', 'get'),
  stats: handler(segmentEditorRouter, '/:book/:chapter/:moduleId/stats', 'get'),
  versions: handler(segmentEditorRouter, '/:book/:chapter/:moduleId/versions', 'get'),
  version: handler(segmentEditorRouter, '/:book/:chapter/:moduleId/versions/:version', 'get'),
  locVersions: handler(localizationEditorRouter, '/:book/:chapter/:moduleId/versions', 'get'),
  locVersion: handler(
    localizationEditorRouter,
    '/:book/:chapter/:moduleId/versions/:version',
    'get'
  ),
};

beforeAll(() => {
  service._setTestDb(db);
  acceptance._setTestDb(db);
  contentVersionService._setTestDb(db);
  concordanceService._setTestDb(db);

  tmpDir = mkdtempSync(join(tmpdir(), 'c209-rev-'));
  booksDir = join(tmpDir, 'books');
  for (const ch of [2, 5]) {
    writeModule(`ch0${ch}`, META, [[TITLE(ch), EN_TITLE[ch], MT_TITLE[ch]]]);
  }
  writeModule('ch02', ORD, [
    [ORD_SEG(1), 'Paragraph one.', 'Fyrsta efnisgrein.'],
    [ORD_SEG(2), 'Paragraph two.', 'Önnur efnisgrein.'],
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
  db.exec('UPDATE segment_edits SET review_id = NULL');
  db.exec('DELETE FROM module_reviews');
  db.exec('DELETE FROM segment_edits');
  db.exec('DELETE FROM segment_acceptances');
  db.exec('DELETE FROM content_versions');
  rmSync(join(booksDir, BOOK, '03-faithful-translation'), { recursive: true, force: true });
  rmSync(join(booksDir, BOOK, '04-localized-content'), { recursive: true, force: true });
  vi.restoreAllMocks();
  // Post-apply/restore hooks are best-effort side channels with their own
  // DBs/timers; this suite is about which ROWS review and history touch.
  vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});
  vi.spyOn(tmService, 'scheduleTmRegen').mockImplementation(() => {});
  vi.spyOn(concordanceService, 'indexModule').mockImplementation(() => {});
});

function saveEdit(chapter, moduleId, segmentId, editedContent) {
  return service.saveSegmentEdit({
    book: BOOK,
    chapter,
    moduleId,
    segmentId,
    originalContent: 'original',
    editedContent,
    editorId: 'editor-1',
    editorUsername: 'editor1',
  }).id;
}

function saveAndApprove(chapter, moduleId, segmentId, editedContent) {
  const id = saveEdit(chapter, moduleId, segmentId, editedContent);
  service.approveEdit(id, 'reviewer-1', 'reviewer1');
  return id;
}

const submit = (chapter, moduleId) =>
  service.submitModuleForReview({
    book: BOOK,
    chapter,
    moduleId,
    submittedBy: 'editor-1',
    submittedByUsername: 'editor1',
  });

const editRow = (id) => db.prepare('SELECT * FROM segment_edits WHERE id = ?').get(id);
const reviewRow = (id) => db.prepare('SELECT * FROM module_reviews WHERE id = ?').get(id);
const versionTable = () => db.prepare('SELECT * FROM content_versions ORDER BY id').all();
const versionRows = (chapter) =>
  db
    .prepare(
      `SELECT chapter, segment_id, content, version, track FROM content_versions
       WHERE book = ? AND module_id = ? AND chapter = ? ORDER BY id`
    )
    .all(BOOK, META, chapter);
const faithfulPath = (ch, moduleId) => segmentParser.getModulePaths(BOOK, ch, moduleId).faithful;
const faithfulSegment = (ch, moduleId, segId) =>
  segmentParser
    .parseSegments(readFileSync(faithfulPath(ch, moduleId), 'utf-8'))
    .find((s) => s.segmentId === segId)?.content;

// A row as a deployment from before the fix may hold it: content_versions
// numbered across the module id, so chapters interleave.
function plantVersion(chapter, moduleId, segmentId, content, version, track = 'faithful') {
  db.prepare(
    `INSERT INTO content_versions (book, chapter, module_id, segment_id, content, version, track, applied_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'legacy')`
  ).run(BOOK, chapter, moduleId, segmentId, content, version, track);
}

const listed = async (route, chapter, moduleId) => {
  const r = await invoke(route, req(chapter, moduleId));
  expect(r.status).toBe(200);
  return r.body.versions.map((v) => ({ version: v.version, segments: v.segments }));
};
const versionContent = async (route, chapter, moduleId, version) => {
  const r = await invoke(route, req(chapter, moduleId, { version: String(version) }));
  expect(r.status).toBe(200);
  return r.body.segments;
};

describe('§C209 fixture sanity', () => {
  it('the fixture book is not held, so apply and restore are live for it', () => {
    expect(HELD_BOOKS).not.toContain(BOOK);
  });
});

// =====================================================================
// (a) Module review
// =====================================================================

describe('§C209 (a) chapter-metadata: a module review covers one chapter', () => {
  it("submitting ch02 stamps and counts ch02's edits only", () => {
    const e2 = saveEdit(2, META, TITLE(2), 'Atóm, sameindir og jónir');
    const e5 = saveEdit(5, META, TITLE(5), 'Varmafræði (endurskoðuð)');
    const e5Before = editRow(e5);

    const r2 = submit(2, META);

    // Positive control: ch02's own edit is claimed by ch02's review.
    expect(editRow(e2).review_id).toBe(r2.id);
    expect(reviewRow(r2.id)).toMatchObject({ chapter: 2, module_id: META, status: 'pending' });
    // The defect: ch05's pending edit was claimed too, and counted.
    expect(r2.editedSegments).toBe(1);
    expect(reviewRow(r2.id).edited_segments).toBe(1);
    expect(editRow(e5)).toEqual(e5Before);
    expect(editRow(e5).review_id).toBeNull();
  });

  it('a pending ch02 review does not block a ch05 review, and still blocks a second ch02 review', () => {
    const e2 = saveEdit(2, META, TITLE(2), 'Atóm, sameindir og jónir');
    const e5 = saveEdit(5, META, TITLE(5), 'Varmafræði (endurskoðuð)');
    const r2 = submit(2, META);
    const e2Before = editRow(e2);
    const r2Before = reviewRow(r2.id);

    // Pre-fix: 'Module already has a pending review' — ch02's review held the module id.
    const r5 = submit(5, META);

    expect(r5.id).not.toBe(r2.id);
    expect(reviewRow(r5.id)).toMatchObject({ chapter: 5, module_id: META, status: 'pending' });
    expect(r5.editedSegments).toBe(1);
    expect(editRow(e5).review_id).toBe(r5.id);
    // ch02's review and its edit are untouched by ch05's submit.
    expect(editRow(e2)).toEqual(e2Before);
    expect(reviewRow(r2.id)).toEqual(r2Before);

    // Control: within one chapter the guard still holds.
    expect(() => submit(2, META)).toThrow('Module already has a pending review');
    expect(() => submit(5, META)).toThrow('Module already has a pending review');
  });

  it("getModuleReviewWithEdits returns the review's chapter's edits only", () => {
    const e2 = saveEdit(2, META, TITLE(2), 'Atóm, sameindir og jónir');
    const e5 = saveEdit(5, META, TITLE(5), 'Varmafræði (endurskoðuð)');
    const r2 = submit(2, META);

    const { review, edits } = service.getModuleReviewWithEdits(r2.id);

    expect(review.id).toBe(r2.id);
    expect(edits.map((e) => e.id)).toEqual([e2]);
    expect(edits[0]).toEqual(editRow(e2));

    // Positive control: ch05's review, submitted from ch05, shows ch05's edit.
    const r5 = submit(5, META);
    expect(service.getModuleReviewWithEdits(r5.id).edits.map((e) => e.id)).toEqual([e5]);
  });

  it("completing ch02's review weighs ch02's edits only, so it can complete as approved", () => {
    const e2 = saveEdit(2, META, TITLE(2), 'Atóm, sameindir og jónir');
    const e5 = saveEdit(5, META, TITLE(5), 'Varmafræði (endurskoðuð)');
    const r2 = submit(2, META);
    service.approveEdit(e2, 'reviewer-1', 'reviewer1');
    const e5Before = editRow(e5);

    // The queue row reads the edits stamped to the review.
    const queued = service.getReviewQueue(BOOK).find((q) => q.id === r2.id);
    expect(queued).toMatchObject({ chapter: 2, pending_edits: 0, approved_edits: 1 });

    const result = service.completeModuleReview(r2.id, 'reviewer-1', 'reviewer1');

    // Pre-fix ch05's pending edit was stamped into ch02's review, so the review
    // could only be 'changes_requested' — and never auto-apply ch02's title.
    expect(result.status).toBe('approved');
    expect(result.counts).toMatchObject({ total: 1, approved: 1, pending: 0, discuss: 0 });
    expect(reviewRow(r2.id)).toMatchObject({ status: 'approved', approved_segments: 1 });
    expect(editRow(e5)).toEqual(e5Before);
  });

  it("the editor's stats (the submit button's gate) count the loaded chapter only", async () => {
    saveEdit(2, META, TITLE(2), 'Atóm, sameindir og jónir'); // pending
    saveAndApprove(5, META, TITLE(5), 'Varmafræði (samþykkt)'); // approved
    // An active MT acceptance in ch05 — the editor's "staðfest" chip. A direct
    // insert: acceptSegment would refuse it beside an approved edit.
    db.prepare(
      `INSERT INTO segment_acceptances
         (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
       VALUES (?, 5, ?, ?, ?, 'u1', 'editor1')`
    ).run(BOOK, META, TITLE(5), MT_TITLE[5]);

    // What the module load hands the client as moduleData.stats.
    const loaded = await invoke(routes.load, req(2, META));
    expect(loaded.status).toBe(200);
    expect(loaded.body.segments.map((s) => s.segmentId)).toEqual([TITLE(2)]);
    expect(loaded.body.stats).toMatchObject({
      total_edits: 1,
      pending: 1,
      approved: 0,
      segments_edited: 1,
      accepted: 0,
    });
    const stats2 = await invoke(routes.stats, req(2, META));
    expect(stats2.body).toMatchObject({ total_edits: 1, pending: 1, approved: 0, accepted: 0 });

    // Positive control: ch05's work is reported where it lives.
    const stats5 = await invoke(routes.stats, req(5, META));
    expect(stats5.body).toMatchObject({ total_edits: 1, pending: 0, approved: 1, accepted: 1 });

    // No chapter given (no route does this): the module-wide count, as before.
    expect(service.getModuleStats(BOOK, META)).toMatchObject({
      total_edits: 2,
      pending: 1,
      approved: 1,
      segments_edited: 2,
      accepted: 1,
    });
  });
});

describe('§C209 (a) control: an ordinary module reviews exactly as before', () => {
  it('submit claims every live edit of the module, blocks a second submit, and the review lists them all', async () => {
    const a = saveEdit(2, ORD, ORD_SEG(1), 'Yfirfarin efnisgrein.');
    const b = saveEdit(2, ORD, ORD_SEG(2), 'Önnur yfirfarin.');

    const r = submit(2, ORD);

    expect(r.editedSegments).toBe(2);
    expect([editRow(a).review_id, editRow(b).review_id]).toEqual([r.id, r.id]);
    expect(
      service
        .getModuleReviewWithEdits(r.id)
        .edits.map((e) => e.id)
        .sort()
    ).toEqual([a, b].sort());
    expect(() => submit(2, ORD)).toThrow('Module already has a pending review');
    expect((await invoke(routes.stats, req(2, ORD))).body).toMatchObject({
      total_edits: 2,
      pending: 2,
    });
    expect(service.getModuleStats(BOOK, ORD)).toMatchObject({ total_edits: 2, pending: 2 });
  });
});

// =====================================================================
// (b) Version history — "Útgáfusaga"
// =====================================================================

describe('§C209 (b) chapter-metadata: version history is per chapter', () => {
  it("version numbers count within the chapter, and ch02's history lists ch02's snapshots only", async () => {
    saveAndApprove(5, META, TITLE(5), 'Varmafræði (birt)');
    service.applyApprovedEdits(BOOK, 5, META); // ch05 snapshots its MT text
    const ch05Before = versionRows(5);
    saveAndApprove(2, META, TITLE(2), 'Útgáfa eitt');
    service.applyApprovedEdits(BOOK, 2, META); // ch02 snapshots its MT text
    saveAndApprove(2, META, TITLE(2), 'Útgáfa tvö');
    service.applyApprovedEdits(BOOK, 2, META); // ch02 snapshots 'Útgáfa eitt'

    // Pre-fix ch02's snapshots were numbered 2 and 3, after ch05's 1.
    expect(versionRows(2)).toEqual([
      { chapter: 2, segment_id: TITLE(2), content: MT_TITLE[2], version: 1, track: 'faithful' },
      { chapter: 2, segment_id: TITLE(2), content: 'Útgáfa eitt', version: 2, track: 'faithful' },
    ]);
    expect(versionRows(5)).toEqual(ch05Before);
    expect(ch05Before).toEqual([
      { chapter: 5, segment_id: TITLE(5), content: MT_TITLE[5], version: 1, track: 'faithful' },
    ]);

    // Pre-fix ch02's Útgáfusaga also listed ch05's snapshot as its own.
    expect(await listed(routes.versions, 2, META)).toEqual([
      { version: 2, segments: 1 },
      { version: 1, segments: 1 },
    ]);
    expect(await listed(routes.versions, 5, META)).toEqual([{ version: 1, segments: 1 }]);
    expect(await versionContent(routes.version, 2, META, 1)).toEqual([
      { segment_id: TITLE(2), content: MT_TITLE[2] },
    ]);
    expect(await versionContent(routes.version, 5, META, 1)).toEqual([
      { segment_id: TITLE(5), content: MT_TITLE[5] },
    ]);

    // Segment history is keyed by a segment id, and a chapter-metadata segment id
    // names its chapter, so it was already per chapter.
    expect(
      contentVersionService.getSegmentHistory(BOOK, META, TITLE(2)).map((h) => h.content)
    ).toEqual(['Útgáfa eitt', MT_TITLE[2]]);
  });

  it('rows numbered across the module id (from before the fix) are read per chapter under their stored numbers, and new numbers continue each chapter', async () => {
    plantVersion(5, META, TITLE(5), 'Varmafræði (v1)', 1);
    plantVersion(2, META, TITLE(2), 'Frumeindir (v2)', 2);
    plantVersion(2, META, TITLE(2), 'Frumeindir (v3)', 3);
    plantVersion(5, META, TITLE(5), 'Varmafræði (v4)', 4);

    expect(await listed(routes.versions, 2, META)).toEqual([
      { version: 3, segments: 1 },
      { version: 2, segments: 1 },
    ]);
    expect(await listed(routes.versions, 5, META)).toEqual([
      { version: 4, segments: 1 },
      { version: 1, segments: 1 },
    ]);
    // A number this chapter does not hold reads as empty, not as another chapter's row.
    expect(await versionContent(routes.version, 2, META, 1)).toEqual([]);
    expect(await versionContent(routes.version, 2, META, 2)).toEqual([
      { segment_id: TITLE(2), content: 'Frumeindir (v2)' },
    ]);

    // Next number = this chapter's highest + 1. ch05's 5 then sits beside ch02's 4:
    // UNIQUE(book, track, module_id, segment_id, version) holds because a
    // chapter-metadata segment id names its chapter.
    const s2 = contentVersionService.snapshotModule(BOOK, 2, META, [
      { segmentId: TITLE(2), content: 'Frumeindir (ný)' },
    ]);
    const s5 = contentVersionService.snapshotModule(BOOK, 5, META, [
      { segmentId: TITLE(5), content: 'Varmafræði (ný)' },
    ]);
    expect([s2.version, s5.version]).toEqual([4, 5]);
    expect(versionRows(2).map((r) => [r.version, r.content])).toEqual([
      [2, 'Frumeindir (v2)'],
      [3, 'Frumeindir (v3)'],
      [4, 'Frumeindir (ný)'],
    ]);
    expect(versionRows(5).map((r) => [r.version, r.content])).toEqual([
      [1, 'Varmafræði (v1)'],
      [4, 'Varmafræði (v4)'],
      [5, 'Varmafræði (ný)'],
    ]);
  });

  it("restoring ch02 reads ch02's snapshots only: another chapter's number is not found and writes nothing", () => {
    plantVersion(5, META, TITLE(5), 'Varmafræði (v1)', 1);
    plantVersion(2, META, TITLE(2), 'Frumeindir (v2)', 2);
    const tableBefore = versionTable();

    // Pre-fix: ch05's v1 was "restored" into ch02 — nothing matched, the file was
    // rewritten unchanged, and a pointless snapshot was recorded.
    expect(() =>
      contentVersionService.restoreVersion(BOOK, 2, META, 1, { username: 'he1' })
    ).toThrow(/Version 1 not found/);
    expect(versionTable()).toEqual(tableBefore);
    expect(existsSync(faithfulPath(2, META))).toBe(false);

    // Positive control: ch02's own number restores, and the pre-restore snapshot
    // takes ch02's next number.
    const result = contentVersionService.restoreVersion(BOOK, 2, META, 2, { username: 'he1' });
    expect(result).toMatchObject({ restoredVersion: 2, snapshotVersion: 3, segmentsRestored: 1 });
    expect(faithfulSegment(2, META, TITLE(2))).toBe('Frumeindir (v2)');
    expect(versionRows(5)).toEqual([
      {
        chapter: 5,
        segment_id: TITLE(5),
        content: 'Varmafræði (v1)',
        version: 1,
        track: 'faithful',
      },
    ]);
    expect(existsSync(faithfulPath(5, META))).toBe(false);
  });

  it('the Pass 2 (localized) track: numbering, listing and reading are per chapter too', async () => {
    // The localized loader needs each chapter's faithful file.
    saveAndApprove(5, META, TITLE(5), 'Varmafræði (birt)');
    service.applyApprovedEdits(BOOK, 5, META);
    saveAndApprove(2, META, TITLE(2), 'Frumeindir (birt)');
    service.applyApprovedEdits(BOOK, 2, META);
    const faithfulVersions = versionTable().filter((r) => r.track === 'faithful');

    const save = (ch, text) =>
      contentVersionService.saveLocalizedWithSnapshot(
        BOOK,
        ch,
        META,
        [{ segmentId: TITLE(ch), content: text }],
        'ed1'
      );
    save(5, 'Varmafræði (staðfærð 1)'); // localized ch05 v1 = faithful text
    save(5, 'Varmafræði (staðfærð 2)'); // localized ch05 v2 = 'staðfærð 1'
    save(2, 'Frumeindir (staðfærðar)'); // localized ch02 v1 = faithful text

    // Pre-fix ch02's first localized snapshot was numbered 3 and its list held ch05's.
    expect(await listed(routes.locVersions, 2, META)).toEqual([{ version: 1, segments: 1 }]);
    expect(await listed(routes.locVersions, 5, META)).toEqual([
      { version: 2, segments: 1 },
      { version: 1, segments: 1 },
    ]);
    expect(await versionContent(routes.locVersion, 2, META, 1)).toEqual([
      { segment_id: TITLE(2), content: 'Frumeindir (birt)' },
    ]);
    expect(await versionContent(routes.locVersion, 2, META, 2)).toEqual([]);

    // A localized restore of ch02 reads ch02's localized snapshot, numbers its own
    // pre-restore snapshot within ch02, and leaves every faithful row as it was.
    const result = contentVersionService.restoreVersion(
      BOOK,
      2,
      META,
      1,
      { username: 'he1' },
      'localized'
    );
    expect(result).toMatchObject({ restoredVersion: 1, snapshotVersion: 2, segmentsRestored: 1 });
    expect(readFileSync(segmentParser.getModulePaths(BOOK, 2, META).localized, 'utf-8')).toContain(
      'Frumeindir (birt)'
    );
    expect(versionTable().filter((r) => r.track === 'faithful')).toEqual(faithfulVersions);
    expect(await listed(routes.locVersions, 5, META)).toEqual([
      { version: 2, segments: 1 },
      { version: 1, segments: 1 },
    ]);
  });
});

describe('§C209 (b) controls: an ordinary module versions exactly as before', () => {
  it('two applies number 1 and 2, list newest first, and restore', async () => {
    saveAndApprove(2, ORD, ORD_SEG(1), 'Útgáfa eitt.');
    service.applyApprovedEdits(BOOK, 2, ORD);
    saveAndApprove(2, ORD, ORD_SEG(1), 'Útgáfa tvö.');
    service.applyApprovedEdits(BOOK, 2, ORD);

    expect(await listed(routes.versions, 2, ORD)).toEqual([
      { version: 2, segments: 2 },
      { version: 1, segments: 2 },
    ]);
    expect(await versionContent(routes.version, 2, ORD, 2)).toEqual([
      { segment_id: ORD_SEG(1), content: 'Útgáfa eitt.' },
      { segment_id: ORD_SEG(2), content: 'Önnur efnisgrein.' },
    ]);

    const result = contentVersionService.restoreVersion(BOOK, 2, ORD, 1, { username: 'he1' });
    expect(result).toMatchObject({ restoredVersion: 1, snapshotVersion: 3, segmentsRestored: 2 });
    expect(faithfulSegment(2, ORD, ORD_SEG(1))).toBe('Fyrsta efnisgrein.');
  });

  it('a snapshot numbers past a row of the same segment under another chapter label, so the insert cannot collide', () => {
    // No current writer produces this, but a module whose chapter changed would:
    // UNIQUE(book, track, module_id, segment_id, version) has no chapter in it.
    plantVersion(2, ORD, ORD_SEG(1), 'ch02 v1', 1);
    plantVersion(3, ORD, ORD_SEG(1), 'stray label v2', 2);

    const snap = contentVersionService.snapshotModule(BOOK, 2, ORD, [
      { segmentId: ORD_SEG(1), content: 'now' },
      { segmentId: ORD_SEG(2), content: 'now 2' },
    ]);

    // As before the fix: one past the highest number this segment holds anywhere.
    expect(snap).toEqual({ version: 3, segmentsSnapshotted: 2 });
  });
});

describe('§C209 (b) the version readers require the chapter', () => {
  it('a call in the old (book, moduleId, …) order fails loud instead of reading every chapter', () => {
    plantVersion(2, META, TITLE(2), 'Frumeindir (v1)', 1);

    expect(() => contentVersionService.getModuleVersions(BOOK, META)).toThrow(
      'getModuleVersions: chapter must be an integer (appendices = -1), got chapter-metadata'
    );
    expect(() => contentVersionService.getVersionContent(BOOK, META, 1)).toThrow(
      'getVersionContent: chapter must be an integer (appendices = -1), got chapter-metadata'
    );
    expect(() => contentVersionService.getModuleVersions(BOOK, undefined, META)).toThrow(
      'getModuleVersions: chapter must be an integer (appendices = -1), got undefined'
    );

    // Positive control: the new order reads.
    expect(contentVersionService.getModuleVersions(BOOK, 2, META).map((v) => v.version)).toEqual([
      1,
    ]);
    expect(contentVersionService.getVersionContent(BOOK, 2, META, 1)).toEqual([
      { segment_id: TITLE(2), content: 'Frumeindir (v1)' },
    ]);
  });
});
