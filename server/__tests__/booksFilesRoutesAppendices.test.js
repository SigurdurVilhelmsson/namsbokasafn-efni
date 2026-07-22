/**
 * GET/POST/DELETE .../files + POST .../import — appendices (C1c task 2).
 *
 * These four routes previously validated chapter via bare `parseInt(chapter,
 * 10)` and passed the raw (possibly NaN) number into chapterFilesService,
 * whose getChapterDir built `ch${padStart}` -> 'ch-1' for appendices, and
 * silently proceeded on garbage input (parseInt('xyz',10) = NaN, never
 * guarded). Fixed to normalizeChapter() + a chapterDir()-aware
 * getChapterDir() together (a validator swap alone is a provable no-op per
 * the C1a validator∧handler lesson).
 *
 * Isolated DB: two of these routes (scan, DELETE) reach
 * chapterFilesService.registerFiles/clearChapterFiles, which write to
 * sessions.db. Running them against the real dev DB would pollute it with
 * fictitious scanned-file/generation-log rows for the real efnafraedi-2e
 * book. A temp-file DB via SESSIONS_DB_PATH (set BEFORE any server
 * require), with real migrations, keeps this test file's side effects
 * fully contained — same idiom as adminAppendixChapterDetail.test.js /
 * registerAppendixSections.test.js. books-routes.test.js is intentionally
 * left untouched (its existing describes don't exercise DB code paths, and
 * this file's env override must not leak into it).
 *
 * Isolated disk fixture for the scan route only: real efnafraedi-2e chapter
 * dirs (appendices, ch05, ...) all carry 10+ .en.md files, and
 * chapterFilesService.registerFiles' per-file supersede-then-insert loop
 * collides on the (book_slug, chapter_num, file_type, superseded_at) UNIQUE
 * constraint whenever 2+ files share a type in one scan batch — a
 * pre-existing, unrelated defect (reachable today via any numeric chapter
 * with 2+ same-typed modules; nothing to do with appendices numbering).
 * Logged out-of-scope in task-2-report.md, not fixed here. A minimal
 * one-file-per-dir fixture book sidesteps it so the scan tests exercise
 * ONLY the chapter-resolution fix under test.
 */
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Env BEFORE any server require: chapterFilesService captures resolveDbPath()
// at module load.
const work = mkdtempSync(path.join(tmpdir(), 'books-files-routes-appendices-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const SCAN_FIXTURE_SLUG = 'c1c-scan-fixture';
const scanFixtureRoot = path.join(__dirname, '..', '..', 'books', SCAN_FIXTURE_SLUG);

let router;

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  router = require('../routes/books');

  mkdirSync(path.join(scanFixtureRoot, '02-for-mt', 'appendices'), { recursive: true });
  mkdirSync(path.join(scanFixtureRoot, '02-for-mt', 'ch05'), { recursive: true });
  writeFileSync(
    path.join(scanFixtureRoot, '02-for-mt', 'appendices', 'm99001-segments.en.md'),
    '<!-- SEG:m99001-1 -->\nFixture segment.\n'
  );
  writeFileSync(
    path.join(scanFixtureRoot, '02-for-mt', 'ch05', 'm99002-segments.en.md'),
    '<!-- SEG:m99002-1 -->\nFixture segment.\n'
  );
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
  rmSync(scanFixtureRoot, { recursive: true, force: true });
});

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

function handlerFor(routePath, method) {
  return router.stack
    .find((l) => l.route && l.route.path === routePath && l.route.methods[method])
    .route.stack.at(-1).handle;
}

describe('GET /:bookId/chapters/:chapter/files — appendices (C1c task 2)', () => {
  it('resolves "appendices" (not 400)', async () => {
    const handler = handlerFor('/:bookId/chapters/:chapter/files', 'get');
    const r = await invoke(handler, {
      params: { bookId: 'efnafraedi-2e', chapter: 'appendices' },
    });
    expect(r.status).not.toBe(400);
    expect(r.body.chapter).toBe(-1);
  });

  it('leaves a numeric chapter byte-identical', async () => {
    const handler = handlerFor('/:bookId/chapters/:chapter/files', 'get');
    const r = await invoke(handler, {
      params: { bookId: 'efnafraedi-2e', chapter: '5' },
    });
    expect(r.status).not.toBe(400);
    expect(r.body.chapter).toBe(5);
  });

  it('still rejects garbage', async () => {
    const handler = handlerFor('/:bookId/chapters/:chapter/files', 'get');
    const r = await invoke(handler, {
      params: { bookId: 'efnafraedi-2e', chapter: 'xyz' },
    });
    expect(r.status).toBe(400);
  });
});

describe('POST /:bookId/chapters/:chapter/files/scan — appendices (C1c task 2)', () => {
  it('resolves "appendices" to the real appendices dir and registers it', async () => {
    const handler = handlerFor('/:bookId/chapters/:chapter/files/scan', 'post');
    const r = await invoke(handler, {
      params: { bookId: SCAN_FIXTURE_SLUG, chapter: 'appendices' },
      user: { username: 'test-user' },
    });
    expect(r.status).toBe(200);
    expect(r.body.chapter).toBe(-1);
    expect(r.body.found).toBe(1);
    expect(r.body.registered).toBe(1);
  });

  it('leaves a numeric chapter byte-identical', async () => {
    const handler = handlerFor('/:bookId/chapters/:chapter/files/scan', 'post');
    const r = await invoke(handler, {
      params: { bookId: SCAN_FIXTURE_SLUG, chapter: '5' },
      user: { username: 'test-user' },
    });
    expect(r.status).toBe(200);
    expect(r.body.chapter).toBe(5);
    expect(r.body.found).toBe(1);
    expect(r.body.registered).toBe(1);
  });

  it('still rejects garbage', async () => {
    const handler = handlerFor('/:bookId/chapters/:chapter/files/scan', 'post');
    const r = await invoke(handler, {
      params: { bookId: SCAN_FIXTURE_SLUG, chapter: 'xyz' },
      user: { username: 'test-user' },
    });
    expect(r.status).toBe(400);
  });
});

describe('DELETE /:bookId/chapters/:chapter/files — appendices (C1c task 2)', () => {
  it('resolves "appendices" (not 400)', async () => {
    const handler = handlerFor('/:bookId/chapters/:chapter/files', 'delete');
    const r = await invoke(handler, {
      params: { bookId: 'efnafraedi-2e', chapter: 'appendices' },
      query: {},
      user: { username: 'test-user' },
    });
    expect(r.status).not.toBe(400);
    expect(r.body.chapter).toBe(-1);
  });

  it('leaves a numeric chapter byte-identical', async () => {
    const handler = handlerFor('/:bookId/chapters/:chapter/files', 'delete');
    const r = await invoke(handler, {
      params: { bookId: 'efnafraedi-2e', chapter: '5' },
      query: {},
      user: { username: 'test-user' },
    });
    expect(r.status).not.toBe(400);
    expect(r.body.chapter).toBe(5);
  });

  it('still rejects garbage', async () => {
    const handler = handlerFor('/:bookId/chapters/:chapter/files', 'delete');
    const r = await invoke(handler, {
      params: { bookId: 'efnafraedi-2e', chapter: 'xyz' },
      query: {},
      user: { username: 'test-user' },
    });
    expect(r.status).toBe(400);
  });
});

describe('POST /:bookId/chapters/:chapter/import — appendices (C1c task 2)', () => {
  // No req.files supplied in any case here (multer isn't exercised), so
  // every case below reaches a 400 either way — what's under test is WHICH
  // guard fires first (proven by the distinct error message), i.e. that the
  // chapter guard runs "right after the assignment" (before the files
  // check) and rejects only genuine junk, not 'appendices' or numeric.
  it('rejects garbage chapter before the files check', async () => {
    const handler = handlerFor('/:bookId/chapters/:chapter/import', 'post');
    const r = await invoke(handler, {
      params: { bookId: 'efnafraedi-2e', chapter: 'xyz' },
      files: undefined,
      user: { username: 'test-user' },
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Invalid chapter');
  });

  it('passes "appendices" through the chapter guard (falls through to the files check)', async () => {
    const handler = handlerFor('/:bookId/chapters/:chapter/import', 'post');
    const r = await invoke(handler, {
      params: { bookId: 'efnafraedi-2e', chapter: 'appendices' },
      files: undefined,
      user: { username: 'test-user' },
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('No files uploaded');
  });

  it('passes a numeric chapter through the chapter guard unchanged', async () => {
    const handler = handlerFor('/:bookId/chapters/:chapter/import', 'post');
    const r = await invoke(handler, {
      params: { bookId: 'efnafraedi-2e', chapter: '5' },
      files: undefined,
      user: { username: 'test-user' },
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('No files uploaded');
  });
});
