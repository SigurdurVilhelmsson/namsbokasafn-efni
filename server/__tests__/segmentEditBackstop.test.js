/**
 * Server-side structural-marker backstop on POST /edit (SR-OOS-2, design D4/D5).
 *
 * The client's hard-block gate is bypassable (direct API call); this pins
 * that the ROUTE now rejects structural violations with 400 + violation
 * codes, using SERVER-loaded baselines (never the client's originalContent),
 * skips validation on identity edits (withdraw parity, design §5), and 404s
 * unknown segment ids.
 *
 * Fixture note (STOP-RULE finding, reported per design D-doc convention):
 * the committed `books/__e2e-fixture__` (both m68663 and m68664, chapter 1)
 * carries ZERO blockable markers — verified by loading both modules through
 * the real `segmentParser.loadModuleForEditing` and scanning every
 * validateStructure rule family ([[MATH:]], [[MEDIA:]], [[BR]], legacy
 * [#xref]/[doc#id] refs, markdown links, [[SPACE]]), not just the three
 * `pickMarkerCase` checks. Cases 1/2 need a marker-bearing baseline to prove
 * the 400 path, so they run against an ISOLATED SYNTHETIC module built in
 * the real `<!-- SEG:module:type:id -->` fixture format (via
 * `segmentParser._setTestBooksDir`) carrying a genuine `[[MATH:1]]` marker —
 * this still exercises the real loader + real validateStructure + real route
 * guard, so it strengthens rather than weakens the pin.
 *
 * Case 3 (identity skip) also had to move onto the synthetic fixture: on a
 * real m68664 segment, `validateStructure(en, is, is)` returns `blocked:
 * null` regardless of whether the skip runs at all (no blockable marker
 * exists there to re-fail on), so a same-file, same-content identity case
 * against m68664 would pass even with the skip deleted — it wouldn't
 * discriminate the behavior it's meant to pin. Case 3 instead targets a
 * second synthetic segment with a DEGRADED baseline (EN carries [[MATH:2]],
 * the saved IS baseline lacks it) — without the skip, re-validating that
 * baseline against EN fires `math-missing`; with the skip, the identity
 * edit passes straight through. Verified empirically (see task report):
 * removing the guard's `if (editedContent !== baseline.is)` condition turns
 * case 3 red while leaving cases 1/2/4/5 green.
 *
 * Cases 4/5 (valid save, unknown-id 404) use the real committed
 * `__e2e-fixture__` / m68664, following mtLockOnFirstEdit's lock-cleanup
 * idiom.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'backstop-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');

const REAL_BOOK = '__e2e-fixture__';
const REAL_CHAPTER = 1;
const REAL_MODULE = 'm68664';

let handler;
let db;
let segmentParser;
let segmentEditor;

function invoke(req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body });
      },
    };
    handler(req, res);
  });
}

function countRows(book, moduleId, segmentId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS n FROM segment_edits WHERE book = ? AND module_id = ? AND segment_id = ?`
    )
    .get(book, moduleId, segmentId).n;
}

function deleteRows(book, moduleId, segmentId) {
  db.prepare(`DELETE FROM segment_edits WHERE book = ? AND module_id = ? AND segment_id = ?`).run(
    book,
    moduleId,
    segmentId
  );
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  db = new Database(process.env.SESSIONS_DB_PATH);

  segmentParser = require('../services/segmentParser');
  segmentEditor = require('../services/segmentEditorService');

  const router = require('../routes/segment-editor');
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/:book/:chapter/:moduleId/edit' && l.route.methods.post
  );
  handler = layer.route.stack[layer.route.stack.length - 1].handle;
});

// ─── Cases 1/2: marker-bearing SYNTHETIC module (real fixture has none) ──
describe('POST /edit — blocked structural violations (synthetic marker fixture)', () => {
  const SYN_BOOK = 'synthetic-backstop-book';
  const SYN_MODULE = 'mSYN01';
  const SYN_SEGMENT_ID = `${SYN_MODULE}:para:fs-id1`;
  const EN = 'Some content with a formula [[MATH:1]] inside.';
  const ORIG_IS = 'Eitthvað efni með formúlu [[MATH:1]] innan.';
  const STRIPPED_IS = ORIG_IS.split('[[MATH:1]]').join('');

  // Second segment: a DEGRADED baseline — EN carries a marker the saved IS
  // baseline lacks (e.g. an edit made before the marker existed in
  // extraction, or MT drift). This is the only way to build a case that
  // actually discriminates the identity-skip branch: __e2e-fixture__'s real
  // modules carry zero blockable markers anywhere, so `validateStructure`
  // returns `blocked: null` for an identity edit on them regardless of
  // whether the skip runs — that test would pass even with the skip deleted.
  // Here, without the skip, `math-missing` fires on re-validating the
  // (marker-less) baseline against EN; with the skip, the save proceeds as
  // a withdraw. Verified by temporarily removing the guard's identity
  // condition and confirming this specific case goes red (see task report).
  const SYN_SEGMENT_ID_2 = `${SYN_MODULE}:para:fs-id2`;
  const EN_2 = 'Formula [[MATH:2]] here.';
  const DEGRADED_IS = 'Formúla hér.';

  let realBooksDir;
  let synRoot;

  beforeAll(() => {
    realBooksDir = segmentParser.BOOKS_DIR;
    synRoot = mkdtempSync(path.join(tmpdir(), 'backstop-syn-'));
    const bookDir = path.join(synRoot, SYN_BOOK);
    mkdirSync(path.join(bookDir, '02-for-mt', 'ch01'), { recursive: true });
    mkdirSync(path.join(bookDir, '02-mt-output', 'ch01'), { recursive: true });
    writeFileSync(
      path.join(bookDir, '02-for-mt', 'ch01', `${SYN_MODULE}-segments.en.md`),
      `<!-- SEG:${SYN_SEGMENT_ID} -->\n${EN}\n\n<!-- SEG:${SYN_SEGMENT_ID_2} -->\n${EN_2}\n`
    );
    writeFileSync(
      path.join(bookDir, '02-mt-output', 'ch01', `${SYN_MODULE}-segments.is.md`),
      `<!-- SEG:${SYN_SEGMENT_ID} -->\n${ORIG_IS}\n\n<!-- SEG:${SYN_SEGMENT_ID_2} -->\n${DEGRADED_IS}\n`
    );
    segmentParser._setTestBooksDir(synRoot);

    // Pre-check: the real loader must still surface the markers unmangled
    // (unescapeMtMarkers/normalizeTermMarkers must not touch [[MATH:]]),
    // and the degraded segment's IS baseline must genuinely lack the marker.
    const data = segmentParser.loadModuleForEditing(SYN_BOOK, 1, SYN_MODULE);
    const seg = data.segments.find((s) => s.segmentId === SYN_SEGMENT_ID);
    const seg2 = data.segments.find((s) => s.segmentId === SYN_SEGMENT_ID_2);
    if (!seg || !seg.en.includes('[[MATH:1]]') || !seg.is.includes('[[MATH:1]]')) {
      throw new Error(
        'Synthetic backstop fixture did not survive segmentParser.loadModuleForEditing — aborting test setup.'
      );
    }
    if (!seg2 || !seg2.en.includes('[[MATH:2]]') || seg2.is.includes('[[MATH:2]]')) {
      throw new Error(
        'Synthetic degraded-baseline fixture did not survive segmentParser.loadModuleForEditing as expected — aborting test setup.'
      );
    }
  });

  afterAll(() => {
    segmentParser._setTestBooksDir(realBooksDir);
    rmSync(synRoot, { recursive: true, force: true });
    deleteRows(SYN_BOOK, SYN_MODULE, SYN_SEGMENT_ID);
    deleteRows(SYN_BOOK, SYN_MODULE, SYN_SEGMENT_ID_2);
  });

  it('case 1: a real structural violation is rejected with 400 + code, no row saved', async () => {
    const req = {
      params: { book: SYN_BOOK, chapter: '1', moduleId: SYN_MODULE },
      chapterNum: 1,
      user: { id: 'u-test', username: 'prufa', role: 'editor', books: [SYN_BOOK] },
      body: {
        segmentId: SYN_SEGMENT_ID,
        originalContent: ORIG_IS,
        editedContent: STRIPPED_IS,
        category: 'accuracy',
      },
    };
    const { status, body } = await invoke(req);
    expect(status).toBe(400);
    expect(body.error).toBe('Vistun hafnað: byggingarmerki vantar eða hafa breyst.');
    expect(body.violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'math-missing' })])
    );
    expect(countRows(SYN_BOOK, SYN_MODULE, SYN_SEGMENT_ID)).toBe(0);
  });

  it('case 2: a client-supplied originalContent cannot fake identity past the SERVER baseline', async () => {
    // Bypass attempt: originalContent is set equal to editedContent (both the
    // stripped/violating text) so a naive originalContent-based identity
    // check would wrongly treat this as a no-op. The guard must key off the
    // SERVER-loaded baseline.is, not the client-posted originalContent.
    const req = {
      params: { book: SYN_BOOK, chapter: '1', moduleId: SYN_MODULE },
      chapterNum: 1,
      user: { id: 'u-test', username: 'prufa', role: 'editor', books: [SYN_BOOK] },
      body: {
        segmentId: SYN_SEGMENT_ID,
        originalContent: STRIPPED_IS,
        editedContent: STRIPPED_IS,
        category: 'accuracy',
      },
    };
    const { status, body } = await invoke(req);
    expect(status).toBe(400);
    expect(body.violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'math-missing' })])
    );
    expect(countRows(SYN_BOOK, SYN_MODULE, SYN_SEGMENT_ID)).toBe(0);
  });

  it('case 3: an identity edit (editedContent === baseline.is) skips validation even on a degraded baseline', async () => {
    // seg-id2's SAVED baseline.is lacks the [[MATH:2]] that EN carries. A
    // fresh re-validation of that baseline against EN would fail
    // math-missing — the skip must fire on editedContent === baseline.is
    // BEFORE any such re-validation happens, so this discriminates the skip
    // (see the fixture-gap note above): remove the skip and this case must
    // go red.
    const req = {
      params: { book: SYN_BOOK, chapter: '1', moduleId: SYN_MODULE },
      chapterNum: 1,
      user: { id: 'u-test', username: 'prufa', role: 'editor', books: [SYN_BOOK] },
      body: {
        segmentId: SYN_SEGMENT_ID_2,
        originalContent: DEGRADED_IS,
        editedContent: DEGRADED_IS,
        category: 'accuracy',
      },
    };
    const { status } = await invoke(req);
    // SR-OOS-2 FIX6a: tightened from `not.toBe(400)` — the identity edit is a
    // genuine withdraw-with-no-existing-edit, so the route must succeed
    // (200), not merely avoid the specific 400 this test targets.
    expect(status).toBe(200);
    expect(countRows(SYN_BOOK, SYN_MODULE, SYN_SEGMENT_ID_2)).toBe(0);
  });

  it('case 6: the conflict check runs BEFORE the structural guard — a stale baseEditId 409s, not 400 (SR-OOS-2 FIX3)', async () => {
    // Seed a newer conflicting edit by a DIFFERENT editor on SYN_SEGMENT_ID
    // (the same marker-bearing segment case 1/2 use). A stale pane posting
    // violating content with an out-of-date baseEditId must see the familiar
    // SEGMENT_CONFLICT 409 (batch 2's alert+reload flow) — not a 400 that
    // masks the real reason with a structural-marker message.
    const seeded = segmentEditor.saveSegmentEdit({
      book: SYN_BOOK,
      chapter: 1,
      moduleId: SYN_MODULE,
      segmentId: SYN_SEGMENT_ID,
      originalContent: ORIG_IS,
      editedContent: ORIG_IS + ' breytt af öðrum ritstjóra',
      category: 'accuracy',
      editorId: 'other-editor',
      editorUsername: 'annar',
    });
    expect(seeded.id).toBeGreaterThan(0);

    const req = {
      params: { book: SYN_BOOK, chapter: '1', moduleId: SYN_MODULE },
      chapterNum: 1,
      user: { id: 'u-test', username: 'prufa', role: 'editor', books: [SYN_BOOK] },
      body: {
        segmentId: SYN_SEGMENT_ID,
        originalContent: ORIG_IS,
        editedContent: STRIPPED_IS, // structurally violating (math-missing)
        category: 'accuracy',
        baseEditId: 0, // stale — the seeded row's id is > 0
      },
    };
    const { status, body } = await invoke(req);
    expect(status).toBe(409);
    expect(body.error).toBe('conflict');
    // Only the seeded row exists — the conflict was caught before any save attempt.
    expect(countRows(SYN_BOOK, SYN_MODULE, SYN_SEGMENT_ID)).toBe(1);
  });
});

// ─── Cases 4/5: real committed fixture (valid save / 404) ──
describe('POST /edit — non-blocked paths (real __e2e-fixture__)', () => {
  const { mtLockPathFor } = require('../../tools/lib/mt-lock.cjs');

  let segmentId;
  let baselineIs;
  let lockPath;
  const unknownSegmentId = `${REAL_MODULE}:para:does-not-exist`;

  beforeAll(() => {
    const { mtOutput } = segmentParser.getModulePaths(REAL_BOOK, REAL_CHAPTER, REAL_MODULE);
    lockPath = mtLockPathFor(mtOutput);
    rmSync(lockPath, { force: true });

    const data = segmentParser.loadModuleForEditing(REAL_BOOK, REAL_CHAPTER, REAL_MODULE);
    const seg = data.segments.find((s) => s.en && s.is);
    if (!seg) {
      throw new Error(
        `No translated segment found in ${REAL_BOOK}/ch${REAL_CHAPTER}/${REAL_MODULE} — cannot run non-blocked-path cases.`
      );
    }
    segmentId = seg.segmentId;
    baselineIs = seg.is;
  });

  afterAll(() => {
    deleteRows(REAL_BOOK, REAL_MODULE, segmentId);
    deleteRows(REAL_BOOK, REAL_MODULE, unknownSegmentId);
    rmSync(lockPath, { force: true });
  });

  it('case 4: a genuinely valid edit passes and is saved', async () => {
    const edited = `${baselineIs} breytt`;
    const req = {
      params: { book: REAL_BOOK, chapter: String(REAL_CHAPTER), moduleId: REAL_MODULE },
      chapterNum: REAL_CHAPTER,
      user: { id: 'u-test', username: 'prufa', role: 'editor', books: [REAL_BOOK] },
      body: {
        segmentId,
        originalContent: baselineIs,
        editedContent: edited,
        category: 'accuracy',
      },
    };
    const { status, body } = await invoke(req);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(countRows(REAL_BOOK, REAL_MODULE, segmentId)).toBeGreaterThan(0);
  });

  it('case 5: an unknown segmentId 404s instead of saving a floating row', async () => {
    const req = {
      params: { book: REAL_BOOK, chapter: String(REAL_CHAPTER), moduleId: REAL_MODULE },
      chapterNum: REAL_CHAPTER,
      user: { id: 'u-test', username: 'prufa', role: 'editor', books: [REAL_BOOK] },
      body: {
        segmentId: unknownSegmentId,
        originalContent: '',
        editedContent: 'anything',
        category: 'accuracy',
      },
    };
    const { status, body } = await invoke(req);
    expect(status).toBe(404);
    expect(body.error).toBe('segment not found');
    expect(countRows(REAL_BOOK, REAL_MODULE, unknownSegmentId)).toBe(0);
  });
});
