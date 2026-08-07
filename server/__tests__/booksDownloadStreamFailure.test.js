/**
 * C20 — a mid-stream archive failure must not kill the process, and must not
 * hang. Both halves matter: §C20 measured 4/4 that adding `archive.on('error')`
 * ALONE converts the crash into a hang (finalize() still pending at 3s, res
 * never ended), so a harness asserting only "no crash" would call that green.
 *
 * Vitest test files are ESM even though `server/` itself is CommonJS — the
 * runtime code is reached via createRequire, as in books-routes.test.js. The
 * child harness (helpers/c20DownloadChild.cjs) is plain CommonJS because it is
 * run by node directly, not by Vitest.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// auth.js throws at load time if JWT_SECRET is unset.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..', '..');
const FIXTURE_BOOK = 'orverufraedi'; // VALID_BOOKS excludes __e2e-fixture__
const FIXTURE_CHAPTER = '99'; // MAX_CHAPTERS is 99
const FIXTURE_DIR = path.join(
  REPO,
  'books',
  FIXTURE_BOOK,
  '05-publication',
  'mt-preview',
  'chapters',
  FIXTURE_CHAPTER
);
const FIXTURE_FILE = path.join(FIXTURE_DIR, 'm99999.html');
const CHILD = path.join(__dirname, 'helpers', 'c20DownloadChild.cjs');

// Teardown belongs to the PARENT: on unfixed code the child DIES, so anything
// it registered never runs. The fixture is a directory this test creates, so
// the worst residue is an untracked scratch dir — never a tracked file at 000.
function makeUnreadableFixture() {
  // Remove any residue from an interrupted earlier run BEFORE creating the
  // fixture. The dir name (`99`) matches the whole-book download branch's
  // `/^\d{2}$/` entry filter, so a stale mode-000 file left here would be
  // enumerated by every later whole-book download of this book.
  removeFixture();
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.writeFileSync(FIXTURE_FILE, '<html>c20 fixture</html>\n');
  fs.chmodSync(FIXTURE_FILE, 0o000);

  // `chmod 000` is a NO-OP AS ROOT: the read succeeds, no error is raised, and
  // this test passes on broken code. Fail loudly rather than skipping — a
  // silent skip is the same failure with better manners.
  let readable = false;
  try {
    fs.readFileSync(FIXTURE_FILE);
    readable = true;
  } catch {
    /* expected: EACCES */
  }
  if (readable) {
    throw new Error(
      'C20 fixture: cannot revoke read permission (running as root?) — ' +
        'this test cannot detect the defect under this uid'
    );
  }
}

function removeFixture() {
  try {
    fs.chmodSync(FIXTURE_FILE, 0o644);
  } catch {
    /* already gone */
  }
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
}

beforeEach(makeUnreadableFixture);
afterEach(removeFixture);

describe('GET /:bookId/download — mid-stream archive failure (C20)', () => {
  it('does not kill the process, settles, and destroys the response', async () => {
    const result = await new Promise((resolve) => {
      execFile(
        process.execPath,
        [CHILD, FIXTURE_BOOK, FIXTURE_CHAPTER, 'pub-mt-preview'],
        {
          cwd: path.join(REPO, 'server'),
          env: { ...process.env, JWT_SECRET: 'test-secret' },
          timeout: 5000, // §C20: finalize() was still pending at 3s
          encoding: 'utf8',
        },
        (err, stdout) =>
          resolve({
            code: err ? (err.code ?? 1) : 0,
            killed: err?.killed === true,
            stdout,
          })
      );
    });

    // Pre-fix: exit 1 with an uncaught EACCES and NO report line at all.
    expect(result.code).toBe(0);
    // Backstop only. ⚠️ The hang does NOT present as a timeout here: measured
    // 4/4, the error-listener-only mutation exits 0 in ~400ms printing nothing,
    // because this harness has no listening socket holding the event loop open
    // (production does, which is why it hangs there). What actually catches the
    // hang is the REPORT line being absent, asserted below.
    expect(result.killed).toBe(false);

    const line = result.stdout.split('\n').find((l) => l.startsWith('REPORT:'));
    expect(
      line,
      `child printed no REPORT line; stdout=${JSON.stringify(result.stdout)}`
    ).toBeTruthy();

    // ⚠️ The child hardcodes `settled: true`, so asserting it would be a
    // tautology. The handler having settled is proven by the line EXISTING at
    // all — the child only prints it from the handler promise's then/catch.
    const report = JSON.parse(line.slice('REPORT:'.length));
    expect(report.destroyed).toBe(true); // fail visibly (spec D1)
    expect(report.finished).toBe(false); // did not end cleanly on a failure
  }, 15000);

  it('aborts the archive and settles when the client disconnects', async () => {
    const router = require('../routes/books');
    const handler = router.stack
      .find((l) => l.route && l.route.path === '/:bookId/download' && l.route.methods.get)
      .route.stack.at(-1).handle;

    const res = new PassThrough();
    res.statusCode = 200;
    res.status = function (c) {
      this.statusCode = c;
      return this;
    };
    res.headersSent = false;
    res.setHeader = () => {};
    res.json = () => {};
    res.on('data', () => {});
    res.on('error', () => {});

    // Chapter 1 is a real, readable publication dir — this test is about the
    // client vanishing, not about a read failure.
    const pending = handler(
      { params: { bookId: FIXTURE_BOOK }, query: { chapter: '1', type: 'pub-mt-preview' } },
      res
    );

    // The client goes away mid-download: `close` with writableFinished false.
    //
    // Emitted SYNCHRONOUSLY, not via setImmediate: the handler body runs
    // straight through from `new ZipArchive` to `addFilesFromDir` with no
    // await, so the listeners are already registered once handler() has
    // returned its promise. Deferring it would race finalize() and make the
    // outcome depend on how long compressing the chapter happens to take
    // (10 .html files; the dir also holds an `images/` subdir, which is skipped).
    res.emit('close');

    await expect(
      Promise.race([
        Promise.resolve(pending).then(() => 'settled'),
        new Promise((r) => setTimeout(() => r('hung'), 5000)),
      ])
    ).resolves.toBe('settled');

    // ⚠️ "settles" ALONE IS VACUOUS — the handler settles on the happy path
    // too, so an assertion that stops there passes with the close handler
    // deleted. `res.emit('close')` does not set `destroyed`; only the
    // handler's own `res.destroy()` in the disconnect branch does. This is
    // the assertion that discriminates, and mutation row 4 is what earns it.
    expect(res.destroyed).toBe(true);
  }, 15000);

  /**
   * The `writableFinished` guard, made observable.
   *
   * `close` fires on EVERY successful download (measured order: finish ->
   * close(writableFinished=true) -> handler returns), and it arrives while the
   * handler is still awaiting the race. With the guard removed, `outcome`
   * becomes {kind:'disconnect'} on a fully successful download — measured 3/3
   * — so archive.abort() and res.destroy() run against a completed response.
   *
   * ⚠️ That mutation turned NOTHING red across the whole 1852-test server
   * suite, because the spurious abort lands after the response has already
   * finished with complete, correct bytes: every existing observer has settled
   * on `end`/`finish` by then. So "no test went red" did NOT mean the guard was
   * merely defensive — it meant the suite was blind to it. This test is the
   * eye. It asserts the success path never takes the failure branch, via the
   * one side effect that branch has and the happy path does not: abort().
   */
  it('does not abort or destroy on a fully successful download', async () => {
    const router = require('../routes/books');
    const handler = router.stack
      .find((l) => l.route && l.route.path === '/:bookId/download' && l.route.methods.get)
      .route.stack.at(-1).handle;

    // `abort` lives on Archiver.prototype, one level above ZipArchive.prototype,
    // so patch it there. ⚠️ An earlier version of this comment added "spying on
    // ZipArchive.prototype would silently miss it" — that is FALSE: assigning
    // to ZipArchive.prototype.abort installs an own property that SHADOWS the
    // parent, and instance calls resolve to it first (verified). The prototype
    // fact is true; the consequence drawn from it was not. Same CommonJS module
    // instance the route uses (both resolve server/node_modules).
    const { ZipArchive } = require('archiver');
    const archiverProto = Object.getPrototypeOf(ZipArchive.prototype);
    const realAbort = archiverProto.abort;
    let abortCalls = 0;
    archiverProto.abort = function (...args) {
      abortCalls += 1;
      return realAbort.apply(this, args);
    };

    try {
      const res = new PassThrough();
      res.statusCode = 200;
      res.status = function (c) {
        this.statusCode = c;
        return this;
      };
      res.headersSent = false;
      res.setHeader = () => {};
      res.json = () => {};
      res.on('data', () => {});
      res.on('error', () => {});

      await handler(
        { params: { bookId: FIXTURE_BOOK }, query: { chapter: '1', type: 'pub-mt-preview' } },
        res
      );

      expect(abortCalls).toBe(0);
    } finally {
      archiverProto.abort = realAbort;
    }
  }, 15000);
});

/**
 * Real `http.Server` + real sockets, driving the same route handler.
 *
 * ⚠️ WHY THIS EXISTS AND THE PassThrough TESTS ABOVE ARE NOT ENOUGH. A real
 * `http.ServerResponse` has `destroyed === true` when `close` fires — on BOTH
 * the success and the abort path (measured):
 *
 *     /abort   CLOSE destroyed=true writableFinished=false writableEnded=false
 *     /success CLOSE destroyed=true writableFinished=true  writableEnded=true
 *
 * A PassThrough reports the opposite (`destroyed=false` when it emits `close`).
 * So `writableFinished` is the only flag that discriminates the two cases on a
 * real socket, and the one-word mutation `!res.writableFinished` →
 * `!res.destroyed` passes the ENTIRE server suite while making the disconnect
 * branch dead in production. Only a real socket can see that.
 *
 * These two tests also pin `archive.abort()` itself, which nothing above does:
 * `res.destroy()` runs on every failure kind, so asserting `res.destroyed`
 * cannot tell a working abort from a deleted one.
 */
describe('GET /:bookId/download — real sockets (C20)', () => {
  const RS_CHAPTER = '98';
  const RS_DIR = path.join(
    REPO,
    'books',
    FIXTURE_BOOK,
    '05-publication',
    'mt-preview',
    'chapters',
    RS_CHAPTER
  );

  function makeRealSocketFixture({ unreadable }) {
    fs.rmSync(RS_DIR, { recursive: true, force: true });
    fs.mkdirSync(RS_DIR, { recursive: true });
    // Big enough that the download is still streaming when the client vanishes,
    // and that an abort has real remaining work to cancel.
    for (let i = 0; i < 40; i += 1) {
      fs.writeFileSync(
        path.join(RS_DIR, `m${String(i).padStart(5, '0')}.html`),
        `<html>${'x'.repeat(300000)}</html>`
      );
    }
    if (unreadable) fs.chmodSync(path.join(RS_DIR, 'm00001.html'), 0o000);
  }

  function removeRealSocketFixture() {
    try {
      fs.chmodSync(path.join(RS_DIR, 'm00001.html'), 0o644);
    } catch {
      /* already gone */
    }
    fs.rmSync(RS_DIR, { recursive: true, force: true });
  }

  afterEach(removeRealSocketFixture);

  /**
   * Serves the real handler over a real socket and resolves once the handler
   * has settled. `driveClient` receives the client request so a test can
   * destroy it mid-stream.
   */
  async function withRealServer(driveClient) {
    const router = require('../routes/books');
    const handler = router.stack
      .find((l) => l.route && l.route.path === '/:bookId/download' && l.route.methods.get)
      .route.stack.at(-1).handle;

    const { ZipArchive } = require('archiver');
    const archiverProto = Object.getPrototypeOf(ZipArchive.prototype);
    const realAbort = archiverProto.abort;
    let abortCalls = 0;
    archiverProto.abort = function (...args) {
      abortCalls += 1;
      return realAbort.apply(this, args);
    };

    let settled = false;
    let closeSeen = null;
    const server = http.createServer((req, res) => {
      // A raw ServerResponse has no Express .status()/.json(); the failure path
      // does not use them, but shim them so an unexpected early return is a
      // clear failure rather than a TypeError.
      res.status = function (c) {
        this.statusCode = c;
        return this;
      };
      res.json = function (b) {
        this.end(JSON.stringify(b));
      };
      res.on('close', () => {
        closeSeen = { destroyed: res.destroyed, writableFinished: res.writableFinished };
      });
      Promise.resolve(
        handler(
          {
            params: { bookId: FIXTURE_BOOK },
            query: { chapter: RS_CHAPTER, type: 'pub-mt-preview' },
          },
          res
        )
      ).then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        }
      );
    });

    try {
      await new Promise((r) => server.listen(0, r));
      await driveClient(server.address().port);
      // Poll rather than sleep a fixed time: a hang must fail on the timeout,
      // not be papered over by a generous wait.
      const deadline = Date.now() + 6000;
      while (!settled && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 25));
      }
      return { settled, abortCalls, closeSeen };
    } finally {
      archiverProto.abort = realAbort;
      await new Promise((r) => server.close(r));
    }
  }

  it('aborts the archive when a real client disconnects mid-download', async () => {
    makeRealSocketFixture({ unreadable: false });

    const result = await withRealServer(
      (port) =>
        new Promise((resolve) => {
          const req = http.get({ port, path: '/download' }, (res) => {
            res.once('data', () => {
              req.destroy(); // the client goes away mid-stream
              resolve();
            });
            res.on('error', () => {});
          });
          req.on('error', () => {});
        })
    );

    expect(result.settled).toBe(true);
    // ⚠️ This is the assertion the PassThrough tests cannot make. `res.destroy()`
    // runs on every failure kind, so only abort() distinguishes a live
    // client-disconnect branch from a deleted one.
    expect(result.abortCalls).toBe(1);
    // Records the flag values that make `writableFinished` the right guard.
    expect(result.closeSeen).toEqual({ destroyed: true, writableFinished: false });
  }, 20000);

  it('aborts the archive when a real download hits an unreadable file', async () => {
    makeRealSocketFixture({ unreadable: true });
    if (fs.existsSync(path.join(RS_DIR, 'm00001.html'))) {
      let readable = false;
      try {
        fs.readFileSync(path.join(RS_DIR, 'm00001.html'));
        readable = true;
      } catch {
        /* expected: EACCES */
      }
      // Same root guard as above: chmod 000 is a no-op as root.
      if (readable)
        throw new Error('C20 fixture: cannot revoke read permission (running as root?)');
    }

    const result = await withRealServer(
      (port) =>
        new Promise((resolve) => {
          const req = http.get({ port, path: '/download' }, (res) => {
            res.on('data', () => {});
            res.on('end', resolve);
            res.on('error', resolve);
          });
          req.on('error', resolve);
        })
    );

    expect(result.settled).toBe(true);
    // archiver does NOT stop its queue on an entry error — without abort() it
    // read and deflated 38 further entries into a response already destroyed
    // (measured). abort() on every failure kind is what stops it.
    expect(result.abortCalls).toBe(1);
  }, 20000);
});
