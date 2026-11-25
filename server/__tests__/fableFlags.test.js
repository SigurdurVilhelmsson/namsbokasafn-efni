// server/__tests__/fableFlags.test.js
//
// Spec amendment 1 (Task 6b): a Fable "meaning" flag is shown only where no human text was in flight
// at the unit's opening. The pure rule (suppressFableFlags / isFableFlagVisible) first, then the module
// route on a temp DB: the opening is recorded on the first assigned serve and its snapshot never moves.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'fable-flags-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const userService = require('../services/userService');
const segmentParser = require('../services/segmentParser');
const moduleOpenings = require('../services/moduleOpenings');
const { suppressFableFlags, isFableFlagVisible } = require('../services/fableFlags');
const { writeModule, writeRaw, handlerFor, invoke } = require('./helpers/servedFixture');
const { plantAssignment } = require('./helpers/plantAssignment.cjs');

const flagged = (segmentId, occurrence) => ({
  segmentId,
  ...(occurrence === undefined ? {} : { occurrence }),
  fableMeaning: { before: 'áður' },
});
const flags = (segs) => segs.map((s) => s.fableMeaning);
const open = (...inflight) => ({ openedAtMs: 1, inflight });

describe('suppressFableFlags and isFableFlagVisible (pure rule)', () => {
  it('opening null clears every flag', () => {
    const segs = [flagged('a'), flagged('b')];
    suppressFableFlags(null, segs);
    expect(flags(segs)).toEqual([null, null]);
  });

  it('an inflight (id, 0) entry clears only that occurrence', () => {
    const segs = [flagged('a', 0), flagged('a', 1), flagged('b', 0)];
    suppressFableFlags(open({ segmentId: 'a', occurrence: 0 }), segs);
    expect(flags(segs).map((f) => f === null)).toEqual([true, false, false]);
  });

  it('an inflight (id, -1) entry clears every occurrence of the id', () => {
    const segs = [flagged('a', 0), flagged('a', 1), flagged('b', 0)];
    suppressFableFlags(open({ segmentId: 'a', occurrence: -1 }), segs);
    expect(flags(segs).map((f) => f === null)).toEqual([true, true, false]);
  });

  it('a segment not in the snapshot keeps its flag; a segment without an occurrence counts as 0', () => {
    const segs = [flagged('a'), flagged('b')];
    suppressFableFlags(open({ segmentId: 'a', occurrence: 0 }), segs);
    expect(flags(segs).map((f) => f === null)).toEqual([true, false]);
  });

  it('an edit made after the opening is not in the snapshot, so it does not clear the flag', () => {
    const segs = [flagged('late', 0)];
    suppressFableFlags(open({ segmentId: 'early', occurrence: 0 }), segs);
    expect(segs[0].fableMeaning).toEqual({ before: 'áður' });
  });

  it('an opening with nothing in flight keeps every flag', () => {
    const segs = [flagged('a', 0), flagged('b')];
    suppressFableFlags(open(), segs);
    expect(flags(segs)).toEqual([{ before: 'áður' }, { before: 'áður' }]);
    expect(isFableFlagVisible(open(), 'a', 0)).toBe(true);
  });

  it('isFableFlagVisible agrees with suppressFableFlags on every case', () => {
    const snaps = [
      null,
      open(),
      open({ segmentId: 'a', occurrence: 0 }),
      open({ segmentId: 'a', occurrence: -1 }),
      open({ segmentId: 'x', occurrence: 0 }),
    ];
    for (const opening of snaps) {
      for (const [id, occ] of [
        ['a', 0],
        ['a', 1],
        ['b', 0],
      ]) {
        const segs = [flagged(id, occ)];
        suppressFableFlags(opening, segs);
        expect(isFableFlagVisible(opening, id, occ)).toBe(segs[0].fableMeaning !== null);
      }
    }
  });
});

describe('module route', () => {
  const BOOK = 'efnafraedi-2e';
  const MOD = 'm95001';
  const SEG_A = `${MOD}:para:a`;
  const SEG_B = `${MOD}:para:b`;
  let db;
  let get;
  let realBooksDir;
  let ed;

  const tagFor = (id) =>
    JSON.stringify({
      key: id,
      segmentId: id,
      occurrence: 0,
      tags: ['meaning'],
      before: `before ${id}`,
    });
  const serve = () =>
    invoke(get, {
      params: { book: BOOK, chapter: '1', moduleId: MOD },
      chapterNum: 1,
      user: { id: ed.provider_id, username: ed.provider_username, role: 'editor', books: [] },
    });
  const seg = (body, id) => body.segments.find((s) => s.segmentId === id);
  const addEdit = (seg_, status) =>
    db
      .prepare(
        `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content, status,
           editor_id, editor_username, created_at)
         VALUES (?, 1, ?, ?, 'IS', 'IS breytt', ?, 'ed-other', 'ed-other', '2026-06-16 10:00:00')`
      )
      .run(BOOK, MOD, seg_, status);

  beforeAll(() => {
    runAllMigrations();
    db = new Database(process.env.SESSIONS_DB_PATH);
    realBooksDir = segmentParser.BOOKS_DIR;
    const root = path.join(work, 'books');
    segmentParser._setTestBooksDir(root);
    const ids = [SEG_A, SEG_B];
    writeModule(root, {
      book: BOOK,
      chapterDir: 'ch01',
      moduleId: MOD,
      en: ids.map((id, i) => [id, `English ${i}.`]),
      mt: ids.map((id, i) => [id, `Íslenska ${i}.`]),
    });
    writeRaw(
      root,
      `${BOOK}/02-mt-fable/ch01/${MOD}-tags.jsonl`,
      `${tagFor(SEG_A)}\n${tagFor(SEG_B)}\n`
    );
    get = handlerFor(require('../routes/segment-editor'), 'get', '/:book/:chapter/:moduleId');
    ed = userService.createUser({
      providerId: 'p-ff',
      providerUsername: 'ff@skoli.example',
      email: 'ff@skoli.example',
      role: 'editor',
    });
    plantAssignment(db, { userId: ed.id, book: BOOK, chapter: 1 });
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(() => {
    db.close();
    segmentParser._setTestBooksDir(realBooksDir);
    rmSync(work, { recursive: true, force: true });
  });

  it('records the opening, hides the flag on the in-flight segment, and the snapshot never changes', async () => {
    addEdit(SEG_A, 'pending');
    const first = await serve();
    expect(first.status).toBe(200);
    expect(seg(first.body, SEG_A).fableMeaning).toBeNull();
    // control: the segment with no in-flight row keeps its flag
    expect(seg(first.body, SEG_B).fableMeaning).toEqual({ before: `before ${SEG_B}` });

    // a later edit on B, and A's row applied: neither moves the snapshot
    addEdit(SEG_B, 'pending');
    db.prepare(
      "UPDATE segment_edits SET status = 'approved', applied_at = '2026-06-16 11:00:00' WHERE segment_id = ?"
    ).run(SEG_A);
    const second = await serve();
    expect(seg(second.body, SEG_A).fableMeaning).toBeNull();
    expect(seg(second.body, SEG_B).fableMeaning).toEqual({ before: `before ${SEG_B}` });
  });

  it('fails closed: a readOpening that throws clears every flag', async () => {
    vi.spyOn(moduleOpenings, 'readOpening').mockImplementation(() => {
      throw new Error('boom');
    });
    const r = await serve();
    expect(r.status).toBe(200);
    expect(r.body.segments.every((s) => s.fableMeaning === null)).toBe(true);
  });
});
