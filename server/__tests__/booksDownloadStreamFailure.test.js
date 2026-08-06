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
    expect(result.killed).toBe(false); // the hang: timeout would kill it
    expect(result.code).toBe(0);

    const line = result.stdout.split('\n').find((l) => l.startsWith('REPORT:'));
    expect(
      line,
      `child printed no REPORT line; stdout=${JSON.stringify(result.stdout)}`
    ).toBeTruthy();

    const report = JSON.parse(line.slice('REPORT:'.length));
    expect(report.settled).toBe(true);
    expect(report.destroyed).toBe(true); // fail visibly (spec D1)
    expect(report.finished).toBe(false); // never ended cleanly with a truncated zip
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
    // outcome depend on how long compressing 11 files happens to take.
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
});
