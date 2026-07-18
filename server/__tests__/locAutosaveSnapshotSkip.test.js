/**
 * I15-R5 mechanism (c) — autosave-skip flag (lead-decided 2026-07-18).
 * Explicit saves and approvals snapshot; machine autosaves (60s timer) pass
 * `autosave: true` and skip the snapshot — nothing deleted, no schema change.
 * Pins both layers: the wrapper option and the /save-all route pass-through.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'loc-autosave-skip-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const BOOK = 'synthetic-autosave-book';
const MODULE = 'mASKIP1';
const SEG_A = `${MODULE}:para:a`;

let contentVersionService;
let segmentParser;
let realBooksDir;
let saveAllHandler;

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

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  segmentParser = require('../services/segmentParser');
  realBooksDir = segmentParser.BOOKS_DIR;
  const booksDir = path.join(work, 'books');
  const seg = (id, text) => `<!-- SEG:${MODULE}:para:${id} -->\n${text}\n`;
  mkdirSync(path.join(booksDir, BOOK, '02-for-mt/ch01'), { recursive: true });
  mkdirSync(path.join(booksDir, BOOK, '03-faithful-translation/ch01'), { recursive: true });
  mkdirSync(path.join(booksDir, BOOK, '04-localized-content/ch01'), { recursive: true });
  writeFileSync(
    path.join(booksDir, BOOK, '02-for-mt/ch01', `${MODULE}-segments.en.md`),
    seg('a', 'EN a')
  );
  writeFileSync(
    path.join(booksDir, BOOK, '03-faithful-translation/ch01', `${MODULE}-segments.is.md`),
    seg('a', 'trúr a')
  );
  writeFileSync(
    path.join(booksDir, BOOK, '04-localized-content/ch01', `${MODULE}-segments.is.md`),
    seg('a', 'staðfært v1')
  );
  segmentParser._setTestBooksDir(booksDir);

  contentVersionService = require('../services/contentVersionService');
  const router = require('../routes/localization-editor');
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/:book/:chapter/:moduleId/save-all' && l.route.methods.post
  );
  saveAllHandler = layer.route.stack.at(-1).handle;
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  rmSync(work, { recursive: true, force: true });
});

const versionCount = () =>
  contentVersionService.getModuleVersions(BOOK, MODULE, 'localized').length;

const locFile = () =>
  readFileSync(
    path.join(work, 'books', BOOK, '04-localized-content/ch01', `${MODULE}-segments.is.md`),
    'utf-8'
  );

describe('saveLocalizedWithSnapshot { snapshot: false }', () => {
  it('writes the file but records no version', () => {
    const before = versionCount();
    const { savedPath } = contentVersionService.saveLocalizedWithSnapshot(
      BOOK,
      1,
      MODULE,
      [{ segmentId: SEG_A, content: 'vél-vistun' }],
      'editor1',
      { snapshot: false }
    );
    expect(savedPath).toBeTruthy();
    expect(locFile()).toContain('vél-vistun');
    expect(versionCount()).toBe(before);
  });

  it('defaults to snapshotting when the option is omitted', () => {
    const before = versionCount();
    contentVersionService.saveLocalizedWithSnapshot(
      BOOK,
      1,
      MODULE,
      [{ segmentId: SEG_A, content: 'handvirk vistun' }],
      'editor1'
    );
    expect(versionCount()).toBe(before + 1);
  });
});

describe('POST /save-all autosave flag pass-through', () => {
  function saveAllReq(extraBody) {
    return {
      params: { book: BOOK, chapter: '1', moduleId: MODULE },
      chapterNum: 1,
      body: {
        segments: [{ segmentId: SEG_A, content: `efni ${Math.random()}` }],
        ...extraBody,
      },
      user: { id: 'ed1', username: 'editor1' },
    };
  }

  it('autosave: true skips the snapshot but still saves', async () => {
    const before = versionCount();
    const r = await invoke(saveAllHandler, saveAllReq({ autosave: true }));
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(versionCount()).toBe(before);
  });

  it('an explicit save-all (no flag) snapshots', async () => {
    const before = versionCount();
    const r = await invoke(saveAllHandler, saveAllReq({}));
    expect(r.status).toBe(200);
    expect(versionCount()).toBe(before + 1);
  });

  it('a non-boolean autosave value does not skip (strict === true)', async () => {
    const before = versionCount();
    const r = await invoke(saveAllHandler, saveAllReq({ autosave: 'yes' }));
    expect(r.status).toBe(200);
    expect(versionCount()).toBe(before + 1);
  });
});
