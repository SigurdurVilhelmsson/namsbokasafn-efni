/**
 * Books Router — Retired Routes
 *
 * Regression guard: asserts that Matecat-era routes that were deliberately
 * removed do not re-appear in the books router's registered stack.
 *
 * Uses Express router introspection (layer.route.path) instead of supertest
 * so the test runs without a live server or DB connection.
 */

import { writeFileSync, existsSync, unlinkSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PassThrough } from 'stream';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// auth.js throws at load time if JWT_SECRET is unset.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('books router — retired routes', () => {
  it('POST /:bookId/chapters/:chapter/import-mt is retired (not registered)', () => {
    const router = require('../routes/books');

    // Collect every explicitly-registered route path from the router stack.
    const registeredPaths = router.stack
      .filter((layer) => layer.route)
      .map((layer) => layer.route.path);

    expect(registeredPaths).not.toContain('/:bookId/chapters/:chapter/import-mt');
  });
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

describe('faithful-count appendices acceptance', () => {
  const router = require('../routes/books');
  const faithfulCountHandler = router.stack
    .find(
      (l) =>
        l.route && l.route.path === '/:book/chapters/:chapter/faithful-count' && l.route.methods.get
    )
    .route.stack.at(-1).handle;

  it('accepts "appendices" (not 400)', async () => {
    const r = await invoke(faithfulCountHandler, {
      params: { book: 'efnafraedi-2e', chapter: 'appendices' },
    });
    expect(r.status).not.toBe(400); // 200 with a count, or 404 if dir absent — both are past the validator
  });

  it('still rejects 0', async () => {
    const r = await invoke(faithfulCountHandler, {
      params: { book: 'efnafraedi-2e', chapter: '0' },
    });
    expect(r.status).toBe(400);
  });

  it('still rejects garbage', async () => {
    const r = await invoke(faithfulCountHandler, {
      params: { book: 'efnafraedi-2e', chapter: 'xyz' },
    });
    expect(r.status).toBe(400);
  });
});

/**
 * GET /:bookId/chapters/:chapter (disk-sourced via loadBookData, C1b task 3b).
 *
 * This route has no browser caller (the books.html UI hits the DB-sourced
 * admin.js route instead — see adminAppendixChapterDetail.test.js), but it
 * must still resolve 'appendices' instead of 404ing via the pre-fix
 * `parseInt('appendices', 10)` -> NaN. A distinctively-named fixture file is
 * written to server/data/ (and removed in afterAll) so this test is
 * independent of which real books happen to carry an `appendices` array —
 * ⚠️ a real-book-data.json inconsistency was found in the process: only
 * chemistry-2e.json/biology-2e.json carry `appendices`; the rest don't (see
 * task-3-report.md finding — not fixed here, out of scope per the plan).
 */
describe('GET /:bookId/chapters/:chapter — appendices (disk-sourced)', () => {
  const FIXTURE_SLUG = 'c1b-books-chapter-route-fixture';
  const fixturePath = path.join(__dirname, '..', 'data', `${FIXTURE_SLUG}.json`);

  beforeAll(() => {
    writeFileSync(
      fixturePath,
      JSON.stringify({
        book: FIXTURE_SLUG,
        slug: FIXTURE_SLUG,
        title: 'C1b Fixture Book',
        titleIs: 'C1b Prófbók',
        chapters: [{ chapter: 1, title: 'Chapter One', modules: [{ id: 'm10001' }] }],
        appendices: [
          { id: 'm90001', title: 'Periodic Table' },
          { id: 'm90002', title: 'Units' },
        ],
      }),
      'utf8'
    );
  });

  afterAll(() => {
    if (existsSync(fixturePath)) unlinkSync(fixturePath);
  });

  const router = require('../routes/books');
  const chapterDetailHandler = router.stack
    .find((l) => l.route && l.route.path === '/:bookId/chapters/:chapter' && l.route.methods.get)
    .route.stack.at(-1).handle;

  it('resolves "appendices" (not 404) with modules from book.appendices', async () => {
    const r = await invoke(chapterDetailHandler, {
      params: { bookId: FIXTURE_SLUG, chapter: 'appendices' },
    });
    expect(r.status).toBe(200);
    expect(r.body.chapter).toBe(-1);
    expect(r.body.modules).toEqual([
      { id: 'm90001', title: 'Periodic Table' },
      { id: 'm90002', title: 'Units' },
    ]);
  });

  it('still 404s on chapter "0"', async () => {
    const r = await invoke(chapterDetailHandler, {
      params: { bookId: FIXTURE_SLUG, chapter: '0' },
    });
    expect(r.status).toBe(404);
  });

  it('still 404s on garbage', async () => {
    const r = await invoke(chapterDetailHandler, {
      params: { bookId: FIXTURE_SLUG, chapter: 'xyz' },
    });
    expect(r.status).toBe(404);
  });

  it('leaves a numeric chapter unchanged', async () => {
    const r = await invoke(chapterDetailHandler, {
      params: { bookId: FIXTURE_SLUG, chapter: '1' },
    });
    expect(r.status).toBe(200);
    expect(r.body.chapter).toBe(1);
    expect(r.body.title).toBe('Chapter One');
  });
});

/**
 * GET /:bookId/download — appendices (C1c task 1).
 *
 * This route streams a ZIP (never calls res.json() on success), so the
 * json-only `invoke()` harness above can't observe a 200. `invokeDownload`
 * mocks res as a real Writable (PassThrough) so `archive.pipe(res)` works,
 * and settles the test as soon as the load-bearing `Content-Disposition`
 * header is set — that header is only reached once every early-return guard
 * (invalid type/book/chapter, missing source dir, missing chapter dir, the
 * en-md unprotected-segment check) has been passed, so observing it proves
 * the chapter resolved to a real on-disk directory. We don't wait for the
 * archive to finish zipping; a `data` listener drains bytes so archiver
 * never backpressure-hangs on a large real file.
 *
 * Uses the real `efnafraedi-2e` book fixture (books/efnafraedi-2e/...),
 * which already has content under both `02-for-mt/appendices/` and
 * `05-publication/mt-preview/chapters/{appendices,01}` — no fixture
 * directories needed. `pub-mt-preview` is used for the success-path
 * assertions specifically to sidestep the (unrelated) en-md
 * unprotected-segment 409 gate that appendices' real en-md content would
 * otherwise trip.
 */
describe('GET /:bookId/download — appendices (C1c task 1)', () => {
  const router = require('../routes/books');
  const downloadHandler = router.stack
    .find((l) => l.route && l.route.path === '/:bookId/download' && l.route.methods.get)
    .route.stack.at(-1).handle;

  function invokeDownload(req) {
    const res = new PassThrough();
    res.statusCode = 200;
    res.status = function (c) {
      this.statusCode = c;
      return this;
    };
    res.headersSent = false;
    res.on('data', () => {}); // drain piped zip bytes; avoid backpressure hangs
    res.on('error', () => {}); // ignore late stream errors after we've settled

    const headers = {};

    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      res.setHeader = function (name, value) {
        headers[name] = value;
        if (name === 'Content-Disposition') {
          // Reached only after every early-return guard has passed.
          settle({ status: res.statusCode, headers });
        }
      };
      res.json = function (body) {
        res.headersSent = true;
        settle({ status: res.statusCode, headers, body });
      };

      Promise.resolve(downloadHandler(req, res)).catch((err) => {
        if (!settled) reject(err);
      });
    });
  }

  it('resolves "appendices" to the appendices dir + zip name (not 400/404, not ch-1/chappendices)', async () => {
    const r = await invokeDownload({
      params: { bookId: 'efnafraedi-2e' },
      query: { chapter: 'appendices', type: 'pub-mt-preview' },
    });
    expect(r.status).not.toBe(400);
    expect(r.status).not.toBe(404);
    expect(r.headers['Content-Disposition']).toContain(
      'efnafraedi-2e-appendices-pub-mt-preview.zip'
    );
  });

  it('leaves a numeric chapter byte-identical (dir + zip name)', async () => {
    const r = await invokeDownload({
      params: { bookId: 'efnafraedi-2e' },
      query: { chapter: '1', type: 'pub-mt-preview' },
    });
    expect(r.status).not.toBe(400);
    expect(r.status).not.toBe(404);
    expect(r.headers['Content-Disposition']).toContain('efnafraedi-2e-K1-pub-mt-preview.zip');
  });

  it('still rejects chapter "0"', async () => {
    const r = await invokeDownload({
      params: { bookId: 'efnafraedi-2e' },
      query: { chapter: '0', type: 'pub-mt-preview' },
    });
    expect(r.status).toBe(400);
  });

  it('still rejects garbage', async () => {
    const r = await invokeDownload({
      params: { bookId: 'efnafraedi-2e' },
      query: { chapter: 'xyz', type: 'pub-mt-preview' },
    });
    expect(r.status).toBe(400);
  });

  it('still rejects a path-traversal chapter value', async () => {
    const r = await invokeDownload({
      params: { bookId: 'efnafraedi-2e' },
      query: { chapter: '../../../etc/passwd', type: 'pub-mt-preview' },
    });
    expect(r.status).toBe(400);
  });
});

/**
 * GET /:bookId/download — the archive is actually produced (C19).
 *
 * The `invokeDownload` harness above settles on `Content-Disposition`, which
 * `books.js` sets *two lines before* it constructs the archiver. That is
 * correct for what those tests assert (zip **naming**), but it means they stay
 * green while the route throws immediately afterwards — which is exactly how
 * `archiver` 8's ESM-only, class-exporting API broke this route unnoticed:
 * `require('archiver')` yields an object, so calling it threw
 * `TypeError: archiver is not a function` on every request and the editor got
 * a 500. See the campaign register §C19.
 *
 * So this block deliberately runs the handler to **completion**: it settles on
 * the response stream ending (success) or on `res.json` (the route's own
 * error path), then parses the returned bytes as a real ZIP. Asserting on the
 * central directory rather than on byte length matters — an empty archive is
 * still a structurally valid ZIP with `PK` magic bytes, so length alone would
 * pass for the wrong reason a second time.
 *
 * Fixture: `orverufraedi` `pub-mt-preview` chapter 1 — the smallest publication
 * chapter directory the route will actually serve (~120 KB across 10 committed
 * files), so the test finishes fast. `efnafraedi-2e`'s ch `00` is smaller but
 * the route rejects chapter 0. The expected entry list is derived from that
 * directory at run time, so ordinary content churn cannot make this flaky.
 */
describe('GET /:bookId/download — produces a real ZIP (C19)', () => {
  const router = require('../routes/books');
  const downloadHandler = router.stack
    .find((l) => l.route && l.route.path === '/:bookId/download' && l.route.methods.get)
    .route.stack.at(-1).handle;

  const FIXTURE_BOOK = 'orverufraedi';
  const FIXTURE_CHAPTER_DIR = '01';
  const chapterPath = path.join(
    __dirname,
    '..',
    '..',
    'books',
    FIXTURE_BOOK,
    '05-publication',
    'mt-preview',
    'chapters',
    FIXTURE_CHAPTER_DIR
  );

  /**
   * Entry names from a ZIP's central directory, without a zip dependency.
   *
   * Walks the End Of Central Directory record back to the central directory
   * and reads each record's file name. Throws if the buffer is not a ZIP,
   * which is the failure we want to see when the archive was never produced.
   *
   * @param {Buffer} buf raw ZIP bytes
   * @returns {string[]} archive-relative entry names
   */
  function zipEntryNames(buf) {
    const EOCD_SIG = 0x06054b50;
    const CD_SIG = 0x02014b50;
    if (!buf || buf.length < 22) throw new Error(`not a ZIP: ${buf ? buf.length : 0} bytes`);

    let eocd = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
      if (buf.readUInt32LE(i) === EOCD_SIG) {
        eocd = i;
        break;
      }
    }
    if (eocd === -1) throw new Error('not a ZIP: no End Of Central Directory record');

    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const names = [];
    for (let n = 0; n < count; n++) {
      if (buf.readUInt32LE(p) !== CD_SIG) throw new Error(`corrupt central directory at ${p}`);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      names.push(buf.subarray(p + 46, p + 46 + nameLen).toString('utf-8'));
      p += 46 + nameLen + extraLen + commentLen;
    }
    return names;
  }

  /**
   * Invoke the download handler and wait for the response to be fully written.
   *
   * Unlike `invokeDownload`, this settles on the *end* of the piped stream, so
   * anything the handler throws after setting its headers is observable.
   *
   * @param {object} req express-like request
   * @returns {Promise<{status:number, headers:object, body:object|null, zip:Buffer|null}>}
   */
  function invokeDownloadToCompletion(req) {
    const res = new PassThrough();
    const chunks = [];
    const headers = {};

    res.statusCode = 200;
    res.status = function (c) {
      this.statusCode = c;
      return this;
    };
    res.headersSent = false;
    res.setHeader = function (name, value) {
      headers[name] = value;
    };
    res.on('data', (c) => chunks.push(c));

    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      // Success: archiver piped the archive into res and ended it.
      res.on('end', () =>
        settle({ status: res.statusCode, headers, body: null, zip: Buffer.concat(chunks) })
      );
      // Failure: the route's own catch block reported the error as JSON.
      res.json = function (body) {
        res.headersSent = true;
        settle({ status: res.statusCode, headers, body, zip: null });
      };
      res.on('error', (err) => {
        if (!settled) reject(err);
      });

      Promise.resolve(downloadHandler(req, res)).catch((err) => {
        if (!settled) reject(err);
      });
    });
  }

  it('streams a ZIP instead of failing with a 500', async () => {
    const r = await invokeDownloadToCompletion({
      params: { bookId: FIXTURE_BOOK },
      query: { chapter: '1', type: 'pub-mt-preview' },
    });

    expect({ status: r.status, error: r.body?.message }).toEqual({
      status: 200,
      error: undefined,
    });
  });

  it('writes one archive entry per .html file in the chapter directory', async () => {
    const expected = readdirSync(chapterPath)
      .filter((f) => f.endsWith('.html'))
      .map((f) => path.join(FIXTURE_CHAPTER_DIR, f))
      .sort();
    expect(expected.length).toBeGreaterThan(0); // fixture sanity

    const r = await invokeDownloadToCompletion({
      params: { bookId: FIXTURE_BOOK },
      query: { chapter: '1', type: 'pub-mt-preview' },
    });

    expect(zipEntryNames(r.zip).sort()).toEqual(expected);
  });
});
