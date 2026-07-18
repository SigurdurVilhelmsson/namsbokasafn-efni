/**
 * Localized version routes (item 15) — handler-level tests via router.stack
 * extraction (bypasses requireAuth/requireHeadEditor; authz composition is
 * pinned by asserting the middleware stack, not by invoking it).
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'loc-routes-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const BOOK = 'synthetic-loc-routes-book';
const MODULE = 'mLROUT1';

let router;
let versionsHandler;
let restoreHandler;
let restoreLayer;
let saveHandler;
let segmentParser;
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

  router = require('../routes/localization-editor');
  const find = (p, method) =>
    router.stack.find((l) => l.route && l.route.path === p && l.route.methods[method]);
  versionsHandler = find('/:book/:chapter/:moduleId/versions', 'get').route.stack.at(-1).handle;
  restoreLayer = find('/:book/:chapter/:moduleId/restore/:version', 'post');
  restoreHandler = restoreLayer.route.stack.at(-1).handle;
  saveHandler = find('/:book/:chapter/:moduleId/save', 'post').route.stack.at(-1).handle;
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  rmSync(work, { recursive: true, force: true });
});

describe('localized version routes', () => {
  it('restore route mounts requireHeadEditor in its middleware stack', () => {
    const names = restoreLayer.route.stack.map((l) => l.handle.name);
    // requireHeadEditor() returns a named middleware; assert it is present
    expect(names.join(',')).toMatch(/headEditor/i);
  });

  it('restore 400s without { confirm: true }', async () => {
    const r = await invoke(restoreHandler, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE, version: '1' },
      chapterNum: 1,
      body: {},
      user: { id: 'he1', username: 'headeditor' },
    });
    expect(r.status).toBe(400);
  });

  it('restore 404s an unknown version', async () => {
    const r = await invoke(restoreHandler, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE, version: '99' },
      chapterNum: 1,
      body: { confirm: true },
      user: { id: 'he1', username: 'headeditor' },
    });
    expect(r.status).toBe(404);
  });

  it('lists versions and restores, returning fresh lastModified', async () => {
    // seed: snapshot v1 via the wrapper by simulating a save of v2
    const contentVersionService = require('../services/contentVersionService');
    contentVersionService.saveLocalizedWithSnapshot(
      BOOK,
      1,
      MODULE,
      [{ segmentId: `${MODULE}:para:a`, content: 'staðfært v2' }],
      'editor1'
    );

    const list = await invoke(versionsHandler, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE },
      chapterNum: 1,
    });
    expect(list.status).toBe(200);
    expect(list.body.versions.length).toBe(1);

    const r = await invoke(restoreHandler, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE, version: '1' },
      chapterNum: 1,
      body: { confirm: true },
      user: { id: 'he1', username: 'headeditor' },
    });
    expect(r.status).toBe(200);
    expect(r.body.snapshotVersion).toBe(2);
    expect(typeof r.body.lastModified).toBe('number');

    expect(r.body.lastModified).toBe(segmentParser.getLocalizedMtime(BOOK, 1, MODULE));
  });

  it('a save carrying a pre-restore lastModified token 409s (conflict composition)', async () => {
    const staleToken = segmentParser.getLocalizedMtime(BOOK, 1, MODULE);
    // Restore bumps the file mtime (previous test restored to v1; restore again
    // to the newest snapshot so this test is order-independent within the file).
    const versions = require('../services/contentVersionService').getModuleVersions(
      BOOK,
      MODULE,
      'localized'
    );
    await invoke(restoreHandler, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE, version: String(versions[0].version) },
      chapterNum: 1,
      body: { confirm: true },
      user: { id: 'he1', username: 'headeditor' },
    });
    const r = await invoke(saveHandler, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE },
      chapterNum: 1,
      body: {
        segmentId: `${MODULE}:para:a`,
        content: 'árekstur',
        lastModified: staleToken,
      },
      user: { id: 'ed1', username: 'editor1' },
    });
    expect(r.status).toBe(409);
  });
});
