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
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// auth.js throws at load time if JWT_SECRET is unset.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

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
});
