/**
 * §C210: a localization edit's category reaches the edit history, and an invalid
 * category is refused before anything is written — on BOTH save routes.
 *
 * The localization editor never sent a category (the client had no way to set one),
 * so every history row carried none. The single-save route already checked a
 * category against PASS2_CATEGORIES; the bulk route (`/save-all`, which "Vista
 * allt" and the 60-second autosave use) did not. With an invalid value it wrote the
 * localized file and then lost the history row: `localization_edits.category` has a
 * CHECK constraint, and the audit insert runs in a try/catch after the response.
 * Now that the client sends categories, the bulk route validates them first, like
 * the single route.
 *
 * Fixture: a synthetic book (segmentParser._setTestBooksDir, the
 * localizationSaveBackstop idiom). Review enforcement is OFF for it (the default),
 * so these cases take the direct-save branch; the bulk validation runs before the
 * review-enforcement fork, so it covers both. History is read through
 * localizationEditService.getModuleHistory — what GET /history (and so the
 * editor's category badges) reads.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'loc-category-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const SYN_BOOK = 'synthetic-loc-category-book';
const SYN_MODULE = 'mLOCC01';
const SEG1 = `${SYN_MODULE}:para:seg1`;
const SEG2 = `${SYN_MODULE}:para:seg2`;

const EN_CONTENT =
  `<!-- SEG:${SEG1} -->\nThe temperature was 50 °F.\n\n` +
  `<!-- SEG:${SEG2} -->\nA trip of 10 miles.\n`;
const FAITHFUL_CONTENT =
  `<!-- SEG:${SEG1} -->\nHitinn var 50 °F.\n\n` + `<!-- SEG:${SEG2} -->\nFerð upp á 10 mílur.\n`;

let segmentParser;
let localizationEditService;
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
  return Promise.resolve(handler(req, res)).then(() => done);
}

function baseReq(overrides) {
  return {
    params: { book: SYN_BOOK, chapter: '1', moduleId: SYN_MODULE },
    chapterNum: 1,
    user: { id: 'u-cat', username: 'prufa', role: 'editor', books: [SYN_BOOK] },
    body: {},
    ...overrides,
  };
}

function localizedPath() {
  return segmentParser.getModulePaths(SYN_BOOK, 1, SYN_MODULE).localized;
}
function readLocalizedOrNull() {
  try {
    return readFileSync(localizedPath(), 'utf-8');
  } catch {
    return null;
  }
}
const history = () => localizationEditService.getModuleHistory(SYN_BOOK, SYN_MODULE, 50);

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  segmentParser = require('../services/segmentParser');
  localizationEditService = require('../services/localizationEditService');
  realBooksDir = segmentParser.BOOKS_DIR;

  synRoot = mkdtempSync(path.join(tmpdir(), 'loc-category-syn-'));
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

  const router = require('../routes/localization-editor');
  const layer = (p) =>
    router.stack.find((l) => l.route && l.route.path === p && l.route.methods.post);
  const saveLayer = layer('/:book/:chapter/:moduleId/save');
  saveHandler = saveLayer.route.stack[saveLayer.route.stack.length - 1].handle;
  const saveAllLayer = layer('/:book/:chapter/:moduleId/save-all');
  saveAllHandler = saveAllLayer.route.stack[saveAllLayer.route.stack.length - 1].handle;
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  rmSync(synRoot, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

beforeEach(() => {
  rmSync(localizedPath(), { force: true });
  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);
  db.prepare('DELETE FROM localization_edits WHERE book = ?').run(SYN_BOOK);
  db.close();
});

describe('§C210: a localization category is stored, and an invalid one is refused', () => {
  it('control: /save with a valid category stores it in the history row', async () => {
    const req = baseReq({
      body: { segmentId: SEG1, content: 'Hitinn var 10 °C.', category: 'unit-conversion' },
    });
    const { status } = await invoke(saveHandler, req);
    expect(status).toBe(200);
    const rows = history().filter((h) => h.segment_id === SEG1);
    expect(rows.map((h) => h.category)).toEqual(['unit-conversion']);
  });

  it('control: /save-all with a valid category per segment stores it', async () => {
    const req = baseReq({
      body: {
        segments: [{ segmentId: SEG2, content: 'Ferð upp á 16 km.', category: 'unit-conversion' }],
      },
    });
    const { status } = await invoke(saveAllHandler, req);
    expect(status).toBe(200);
    const rows = history().filter((h) => h.segment_id === SEG2);
    expect(rows.map((h) => h.category)).toEqual(['unit-conversion']);
  });

  it('control: /save with an invalid category is refused 400 (the existing check)', async () => {
    const req = baseReq({ body: { segmentId: SEG1, content: 'Eitthvað.', category: 'bogus' } });
    const { status } = await invoke(saveHandler, req);
    expect(status).toBe(400);
    expect(readLocalizedOrNull()).toBeNull();
  });

  it('/save-all with an invalid category is refused 400 before anything is written', async () => {
    const req = baseReq({
      body: { segments: [{ segmentId: SEG2, content: 'Ferð upp á 16 km.', category: 'bogus' }] },
    });
    const { status, body } = await invoke(saveAllHandler, req);
    expect(status).toBe(400);
    expect(body.error).toMatch(/category/i);
    expect(readLocalizedOrNull()).toBeNull(); // no localized file written
    expect(history()).toEqual([]); // and no history row
  });
});
