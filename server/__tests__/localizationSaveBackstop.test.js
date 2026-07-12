/**
 * Server-side structural-marker backstop on POST /save and POST /save-all
 * for the localization editor (SR-OOS-2, design D3/D4/D5).
 *
 * Localization baseline parity: the client's own hard-block gate validates
 * against EN + FAITHFUL (localization-editor.js:978) — NOT the current
 * localized text — because faithful is the semantic source of truth for
 * Pass 2. This backstop mirrors that: both routes re-validate the proposed
 * content against SERVER-loaded `seg.en` + `seg.faithful`, using SERVER
 * baselines only (never anything client-supplied). Separately, the
 * "did this segment actually change" identity check (which decides whether
 * to validate AT ALL) compares against the pane's *displayed* current value
 * — `seg.hasLocalized ? seg.localized : seg.faithful` — matching the
 * route's own existing `previousContent`/`auditEdits` computation.
 *
 * Fixture: a synthetic book/module (via `segmentParser._setTestBooksDir`,
 * same idiom as `segmentEditBackstop.test.js`) with three segments:
 *   - seg1, seg2: EN carries [[MATH:1]] / [[MATH:2]], faithful matches, no
 *     localized entry yet (hasLocalized: false, baseline = faithful).
 *   - seg3: EN carries [[MATH:3]], faithful matches, but a PRE-EXISTING
 *     localized entry is DEGRADED (the marker was already dropped) —
 *     this is the only way to build a case that discriminates the
 *     changed-only skip: re-validating seg3's saved baseline against EN
 *     would itself fire `math-missing`, so a request that resubmits seg3
 *     unchanged only stays green if the route skips validation on it.
 *
 * The localized fixture file is reset before every test (own `beforeEach`
 * per describe block) so cases don't depend on run order or on each
 * other's writes.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'loc-backstop-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const SYN_BOOK = 'synthetic-loc-backstop-book';
const SYN_MODULE = 'mLOCB01';
const SEG1 = `${SYN_MODULE}:para:seg1`;
const SEG2 = `${SYN_MODULE}:para:seg2`;
const SEG3 = `${SYN_MODULE}:para:seg3`;

const EN_SEG1 = 'Content with formula [[MATH:1]] here.';
const EN_SEG2 = 'Second paragraph with formula [[MATH:2]] included.';
const EN_SEG3 = 'Third paragraph with formula [[MATH:3]] present.';

const FAITHFUL_SEG1 = 'Efni með formúlu [[MATH:1]] hér.';
const FAITHFUL_SEG2 = 'Önnur efnisgrein með formúlu [[MATH:2]] hér.';
const FAITHFUL_SEG3 = 'Þriðja efnisgrein með formúlu [[MATH:3]] hér.';

// seg3's PRE-EXISTING localized entry: degraded — the marker EN still
// carries is already missing from this saved baseline.
const DEGRADED_SEG3 = 'Staðfærð þriðja efnisgrein án formúlu.';

const EDITED_SEG1_VALID = 'Efni með formúlu [[MATH:1]] hér, aðeins breytt.';
const STRIPPED_SEG1 = FAITHFUL_SEG1.split('[[MATH:1]]').join('');
const EDITED_SEG2_VALID = 'Önnur efnisgrein með formúlu [[MATH:2]] hér, staðfærð.';
const STRIPPED_SEG2 = FAITHFUL_SEG2.split('[[MATH:2]]').join('');

const EN_CONTENT =
  `<!-- SEG:${SEG1} -->\n${EN_SEG1}\n\n` +
  `<!-- SEG:${SEG2} -->\n${EN_SEG2}\n\n` +
  `<!-- SEG:${SEG3} -->\n${EN_SEG3}\n`;

const FAITHFUL_CONTENT =
  `<!-- SEG:${SEG1} -->\n${FAITHFUL_SEG1}\n\n` +
  `<!-- SEG:${SEG2} -->\n${FAITHFUL_SEG2}\n\n` +
  `<!-- SEG:${SEG3} -->\n${FAITHFUL_SEG3}\n`;

const LOCALIZED_INITIAL = `<!-- SEG:${SEG3} -->\n${DEGRADED_SEG3}\n`;

let segmentParser;
let saveHandler;
let saveAllHandler;
let realBooksDir;
let synRoot;

function invoke(handler, req) {
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
  // Await the handler's own returned promise (it's async) so any
  // post-response work inside it (activityLog.log, release()) completes
  // before we assert, not just the res.json() call.
  return Promise.resolve(handler(req, res)).then(() => done);
}

function baseReq(overrides) {
  return {
    params: { book: SYN_BOOK, chapter: '1', moduleId: SYN_MODULE },
    chapterNum: 1,
    user: { id: 'u-test', username: 'prufa', role: 'editor', books: [SYN_BOOK] },
    body: {},
    ...overrides,
  };
}

function readLocalizedRaw() {
  const { localized } = segmentParser.getModulePaths(SYN_BOOK, 1, SYN_MODULE);
  return readFileSync(localized, 'utf-8');
}

function resetLocalizedFixture() {
  const { localized } = segmentParser.getModulePaths(SYN_BOOK, 1, SYN_MODULE);
  mkdirSync(path.dirname(localized), { recursive: true });
  writeFileSync(localized, LOCALIZED_INITIAL, 'utf-8');
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  segmentParser = require('../services/segmentParser');
  realBooksDir = segmentParser.BOOKS_DIR;

  synRoot = mkdtempSync(path.join(tmpdir(), 'loc-backstop-syn-'));
  const bookDir = path.join(synRoot, SYN_BOOK);
  mkdirSync(path.join(bookDir, '02-for-mt', 'ch01'), { recursive: true });
  mkdirSync(path.join(bookDir, '03-faithful-translation', 'ch01'), { recursive: true });
  mkdirSync(path.join(bookDir, '04-localized-content', 'ch01'), { recursive: true });

  writeFileSync(
    path.join(bookDir, '02-for-mt', 'ch01', `${SYN_MODULE}-segments.en.md`),
    EN_CONTENT
  );
  writeFileSync(
    path.join(bookDir, '03-faithful-translation', 'ch01', `${SYN_MODULE}-segments.is.md`),
    FAITHFUL_CONTENT
  );

  segmentParser._setTestBooksDir(synRoot);

  // Pre-check: the real loader must surface exactly the shape this fixture
  // is designed around before any case relies on it.
  const data = segmentParser.loadModuleForLocalization(SYN_BOOK, 1, SYN_MODULE);
  const s1 = data.segments.find((s) => s.segmentId === SEG1);
  const s2 = data.segments.find((s) => s.segmentId === SEG2);
  const s3 = data.segments.find((s) => s.segmentId === SEG3);
  if (
    !s1 ||
    !s1.en.includes('[[MATH:1]]') ||
    !s1.faithful.includes('[[MATH:1]]') ||
    s1.hasLocalized
  ) {
    throw new Error(
      'Synthetic loc-backstop fixture (seg1) did not survive loadModuleForLocalization.'
    );
  }
  if (!s2 || !s2.en.includes('[[MATH:2]]') || !s2.faithful.includes('[[MATH:2]]')) {
    throw new Error(
      'Synthetic loc-backstop fixture (seg2) did not survive loadModuleForLocalization.'
    );
  }
  if (!s3 || !s3.en.includes('[[MATH:3]]')) {
    throw new Error(
      'Synthetic loc-backstop fixture (seg3 EN) did not survive loadModuleForLocalization.'
    );
  }

  const router = require('../routes/localization-editor');
  const saveLayer = router.stack.find(
    (l) => l.route && l.route.path === '/:book/:chapter/:moduleId/save' && l.route.methods.post
  );
  saveHandler = saveLayer.route.stack[saveLayer.route.stack.length - 1].handle;
  const saveAllLayer = router.stack.find(
    (l) => l.route && l.route.path === '/:book/:chapter/:moduleId/save-all' && l.route.methods.post
  );
  saveAllHandler = saveAllLayer.route.stack[saveAllLayer.route.stack.length - 1].handle;
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  rmSync(synRoot, { recursive: true, force: true });
});

// ─── Cases 1/2: single save ──────────────────────────────────────────────
describe('POST /save — structural backstop (baseline = faithful)', () => {
  beforeEach(() => {
    resetLocalizedFixture();
  });

  it('case 1: stripping a required marker is rejected 400 + math-missing, localized file untouched', async () => {
    const before = readLocalizedRaw();
    const req = baseReq({ body: { segmentId: SEG1, content: STRIPPED_SEG1 } });
    const { status, body } = await invoke(saveHandler, req);

    expect(status).toBe(400);
    expect(body.error).toBe('Vistun hafnað: byggingarmerki vantar eða hafa breyst.');
    expect(body.violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'math-missing' })])
    );
    expect(readLocalizedRaw()).toBe(before);
  });

  it('case 2: a genuinely valid edit is saved (200/success, file written)', async () => {
    const req = baseReq({ body: { segmentId: SEG2, content: EDITED_SEG2_VALID } });
    const { status, body } = await invoke(saveHandler, req);

    expect(status).toBe(200);
    expect(body.success).toBe(true);

    const data = segmentParser.loadModuleForLocalization(SYN_BOOK, 1, SYN_MODULE);
    const seg2 = data.segments.find((s) => s.segmentId === SEG2);
    expect(seg2.hasLocalized).toBe(true);
    expect(seg2.localized).toBe(EDITED_SEG2_VALID);
  });
});

// ─── Cases 3/4/5: save-all (whole-batch reject) ──────────────────────────
describe('POST /save-all — structural backstop (whole-batch reject)', () => {
  beforeEach(() => {
    resetLocalizedFixture();
  });

  it('case 3: one violating segment in the batch rejects the WHOLE batch, neither segment written', async () => {
    const before = readLocalizedRaw();
    const req = baseReq({
      body: {
        segments: [
          { segmentId: SEG1, content: EDITED_SEG1_VALID },
          { segmentId: SEG2, content: STRIPPED_SEG2 },
        ],
      },
    });
    const { status, body } = await invoke(saveAllHandler, req);

    expect(status).toBe(400);
    expect(body.error).toBe('Vistun hafnað: byggingarmerki vantar eða hafa breyst.');
    expect(body.violations[0]).toEqual(
      expect.objectContaining({
        code: 'math-missing',
        params: expect.objectContaining({ segmentId: SEG2 }),
      })
    );
    // Whole-batch reject: seg1's otherwise-valid edit must NOT have landed either.
    expect(readLocalizedRaw()).toBe(before);
  });

  it('case 4: an all-valid batch saves every segment', async () => {
    const req = baseReq({
      body: {
        segments: [
          { segmentId: SEG1, content: EDITED_SEG1_VALID },
          { segmentId: SEG2, content: EDITED_SEG2_VALID },
        ],
      },
    });
    const { status, body } = await invoke(saveAllHandler, req);

    expect(status).toBe(200);
    expect(body.success).toBe(true);

    const data = segmentParser.loadModuleForLocalization(SYN_BOOK, 1, SYN_MODULE);
    const seg1 = data.segments.find((s) => s.segmentId === SEG1);
    const seg2 = data.segments.find((s) => s.segmentId === SEG2);
    expect(seg1.localized).toBe(EDITED_SEG1_VALID);
    expect(seg2.localized).toBe(EDITED_SEG2_VALID);
  });

  it('case 5: resubmitting an UNCHANGED segment with a degraded baseline is not validated', async () => {
    // seg3's saved localized baseline (DEGRADED_SEG3) is itself missing the
    // [[MATH:3]] marker EN carries. If the route validated every segment in
    // the request regardless of whether it changed, resubmitting seg3
    // unchanged would fire math-missing and 400 the whole batch. It must
    // not: only auditEdits (changed segments) get validated.
    const req = baseReq({
      body: {
        segments: [
          { segmentId: SEG1, content: EDITED_SEG1_VALID },
          { segmentId: SEG3, content: DEGRADED_SEG3 }, // unchanged
        ],
      },
    });
    const { status, body } = await invoke(saveAllHandler, req);

    expect(status).toBe(200);
    expect(body.success).toBe(true);

    const data = segmentParser.loadModuleForLocalization(SYN_BOOK, 1, SYN_MODULE);
    const seg1 = data.segments.find((s) => s.segmentId === SEG1);
    const seg3 = data.segments.find((s) => s.segmentId === SEG3);
    expect(seg1.localized).toBe(EDITED_SEG1_VALID);
    expect(seg3.localized).toBe(DEGRADED_SEG3);
  });
});
