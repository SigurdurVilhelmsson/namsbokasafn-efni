/**
 * Register §C209 (residue) and C59: the reviewed-segment count is per chapter.
 *
 * `chapter-metadata` is one module id shared by every chapter of a book.
 * `getReviewedSegmentsByModule` counted reviewed segments per module id across
 * the whole book, so that module got ONE number for all chapters. Both
 * consumers compared it with a single chapter's segment count:
 *
 *   - the per-module status in `GET /:book/editorial-progress` (routes/status.js);
 *   - the book-wide `modulesComplete` in `getEditorialProgress`.
 *
 * So once one chapter's metadata was reviewed, `chapter-metadata` read
 * "complete" in every chapter whose metadata has no more segments than that.
 *
 * The fixture is a three-chapter book. Each chapter has `chapter-metadata` with
 * one segment, and only chapter 1's is reviewed (an active acceptance). Chapter
 * 2 also has an ordinary module, fully reviewed, as the control: a count that
 * dropped everything would fail it.
 *
 * The same route kept two more lookups by module id alone: the per-module edit
 * counts and the pending reviews. So chapter 1's `chapter-metadata` also
 * carries a rejected edit, a pending edit and a pending review, and chapter 3's
 * carries nothing. Before the fix chapter 3's metadata showed chapter 1's edit
 * counts, read "in progress", and was listed as awaiting review. The last block
 * pins that it shows none of them, with chapter 1 as the control.
 *
 * Harness idiom: statusEditorialProgressAcceptance.test.js.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'reviewed-per-chapter-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const BOOK = 'synthetic-reviewed-per-chapter-book';
const META = 'chapter-metadata';
const ORDINARY = 'm99930';

let progressHandler;
let segmentParser;
let segmentEditorService;
let realBooksDir;

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

/** The route's chapter entry and one module's details. */
async function moduleStatus(chapter, moduleId) {
  const r = await invoke(progressHandler, { params: { book: BOOK }, query: {} });
  const ch = r.body.chapters.find((c) => String(c.chapter) === String(chapter));
  return { ch, mod: ch.moduleDetails.find((m) => m.moduleId === moduleId), body: r.body };
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  segmentParser = require('../services/segmentParser');
  realBooksDir = segmentParser.BOOKS_DIR;
  const booksDir = path.join(work, 'books');
  for (const n of ['01', '02', '03']) {
    const chDir = path.join(booksDir, BOOK, '02-for-mt', `ch${n}`);
    mkdirSync(chDir, { recursive: true });
    // The real form: a chapter-metadata segment id names its chapter.
    writeFileSync(
      path.join(chDir, `${META}-segments.en.md`),
      `<!-- SEG:chapter:title:ch${n} -->\nA chapter title\n`
    );
  }
  writeFileSync(
    path.join(booksDir, BOOK, '02-for-mt', 'ch02', `${ORDINARY}-segments.en.md`),
    `<!-- SEG:${ORDINARY}:para:fs-id001 -->\nOnly segment.\n`
  );
  segmentParser._setTestBooksDir(booksDir);

  const { VALID_BOOKS } = require('../config');
  VALID_BOOKS.push(BOOK);

  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);
  const accept = db.prepare(
    `INSERT INTO segment_acceptances
       (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
     VALUES (?, ?, ?, ?, 'Yfirfarið.', 'u1', 'editor1')`
  );
  accept.run(BOOK, 1, META, 'chapter:title:ch01'); // chapter 1's metadata: reviewed
  accept.run(BOOK, 2, ORDINARY, `${ORDINARY}:para:fs-id001`); // the control module
  // chapter 2's metadata: nothing

  // Chapter 1's metadata also has edits and a review; chapter 3's has neither.
  const edit = db.prepare(
    `INSERT INTO segment_edits
       (book, chapter, module_id, segment_id, original_content, edited_content,
        status, editor_id, editor_username)
     VALUES (?, 1, ?, 'chapter:title:ch01', 'Titill', ?, ?, 'u1', 'editor1')`
  );
  edit.run(BOOK, META, 'Hafnað', 'rejected');
  edit.run(BOOK, META, 'Í bið', 'pending');
  db.prepare(
    `INSERT INTO module_reviews (book, chapter, module_id, submitted_by, submitted_by_username)
     VALUES (?, 1, ?, 'u1', 'editor1')`
  ).run(BOOK, META);
  db.close();

  segmentEditorService = require('../services/segmentEditorService');
  const router = require('../routes/status');
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/:book/editorial-progress' && l.route.methods.get
  );
  progressHandler = layer.route.stack[layer.route.stack.length - 1].handle;
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  const { VALID_BOOKS } = require('../config');
  const idx = VALID_BOOKS.indexOf(BOOK);
  if (idx !== -1) VALID_BOOKS.splice(idx, 1);
  rmSync(work, { recursive: true, force: true });
});

describe('the count itself is keyed by chapter, then module', () => {
  it("gives chapter 1's metadata its one reviewed segment", () => {
    expect(segmentEditorService.getReviewedSegmentsByModule(BOOK)[1][META]).toBe(1);
  });

  it("gives chapter 2's metadata no count", () => {
    expect(segmentEditorService.getReviewedSegmentsByModule(BOOK)[2][META]).toBeUndefined();
  });

  it('still counts an ordinary module, under its chapter', () => {
    expect(segmentEditorService.getReviewedSegmentsByModule(BOOK)[2][ORDINARY]).toBe(1);
  });
});

describe('the per-module status in the editorial-progress route', () => {
  it('does not call an unreviewed chapter-metadata complete', async () => {
    const { mod } = await moduleStatus(2, META);
    expect(mod.status).toBe('not-started');
  });

  it("counts only chapter 2's own complete modules", async () => {
    const { ch } = await moduleStatus(2, META);
    expect(ch.modulesComplete).toBe(1);
  });

  it('control: the reviewed chapter-metadata is complete', async () => {
    const { mod } = await moduleStatus(1, META);
    expect(mod.status).toBe('complete');
  });

  it('control: the ordinary reviewed module is complete', async () => {
    const { mod } = await moduleStatus(2, ORDINARY);
    expect(mod.status).toBe('complete');
  });
});

describe('the book-wide count in getEditorialProgress', () => {
  it('counts two complete modules of four', () => {
    expect(segmentEditorService.getEditorialProgress(BOOK).summary.modulesComplete).toBe(2);
  });

  it('control: the book has four modules', () => {
    expect(segmentEditorService.getEditorialProgress(BOOK).summary.totalModules).toBe(4);
  });
});

describe("the route's edit counts and pending reviews are per chapter too", () => {
  it("does not show chapter 1's edit counts on chapter 3's metadata", async () => {
    const { mod } = await moduleStatus(3, META);
    expect([mod.segmentsEdited, mod.pending, mod.rejected]).toEqual([0, 0, 0]);
  });

  it("does not show chapter 1's review on chapter 3's metadata", async () => {
    const { mod } = await moduleStatus(3, META);
    expect(mod.reviewStatus).toBeNull();
  });

  it("leaves chapter 3's metadata not started", async () => {
    const { mod } = await moduleStatus(3, META);
    expect(mod.status).toBe('not-started');
  });

  it('lists nothing needing attention in chapter 3', async () => {
    const { ch } = await moduleStatus(3, META);
    expect(ch.needsAttention).toEqual([]);
  });

  it('counts no module in progress in the book', async () => {
    const { body } = await moduleStatus(3, META);
    expect(body.summary.modulesInProgress).toBe(0);
  });

  it("control: chapter 1's metadata shows its own edit counts", async () => {
    const { mod } = await moduleStatus(1, META);
    expect([mod.segmentsEdited, mod.pending, mod.rejected]).toEqual([1, 1, 1]);
  });

  it("control: chapter 1's metadata shows its own review", async () => {
    const { mod } = await moduleStatus(1, META);
    expect(mod.reviewStatus).toBe('pending');
  });

  it('control: chapter 1 lists its rejected edit and its review', async () => {
    const { ch } = await moduleStatus(1, META);
    expect(ch.needsAttention).toEqual([`${META}: 1 rejected`, `${META}: awaiting review`]);
  });
});
