/**
 * Task 5 review, Important 2: the ONE production line this task exists to
 * change — `exportFn = createResolvedExportFn()`, the default parameter in
 * `runGlossaryExport` (server/scripts/export-terminology.js) — was covered
 * by NO test. 94/94 pre-existing `run({…})` call sites inject their own
 * `exportFn`, and so does the B3 regression pin
 * (glossaryExportBookSet.test.js) — so reverting that one line back to
 * `terminologyService.exportBookGlossary` left the entire 4,243-test suite
 * green. See "verify it discriminates" in the fix report for the measured
 * proof.
 *
 * This file calls `runGlossaryExport` WITHOUT an `exportFn`, so the default
 * parameter is what actually runs — the resolved builder
 * (server/lib/resolvedGlossary.js), not the retired one.
 *
 * It also exercises Important 1's fix in the same breath: SESSIONS_DB_PATH
 * points at a file that does not exist, so the resolved builder's lazy DB
 * open fails on its first call. The assertion is that the failure surfaces
 * as a per-book `error` outcome, with a status file still written — the
 * posture Important 1 restored — rather than an uncaught crash (pre-fix) or
 * a silent `refused-*`/`wrote` outcome (which would mean nothing threw, and
 * this test would not be discriminating anything).
 *
 * ⚠️ subjectFn is INJECTED, not left at its default
 * (terminologyService.getBookSubject). terminologyService resolves its own
 * DB_PATH at MODULE LOAD (`const DB_PATH = resolveDbPath()`,
 * server/services/terminologyService.js:25) — by the time this test file's
 * `require('../scripts/export-terminology')` below runs, terminologyService
 * has already been required (export-terminology.js requires it at its own
 * top level) and has already frozen DB_PATH against whatever
 * SESSIONS_DB_PATH held at THAT moment, which is not under this test's
 * control. Setting the env var inside a test body cannot retroactively
 * change an already-frozen module constant. Injecting subjectFn sidesteps
 * terminologyService entirely, so the only code path this test drives is
 * the one under review: the default exportFn.
 *
 * By contrast, `createResolvedExportFn`'s DB open is deferred to first call
 * (Important 1), so it reads SESSIONS_DB_PATH live, via
 * `resolveDbPath()` (server/lib/dbPath.js), at the moment this test's
 * `runGlossaryExport({...})` call reaches the loop — which is exactly why
 * setting the env var inside the test body works for THIS path.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runGlossaryExport } = require('../scripts/export-terminology');

describe('runGlossaryExport default exportFn wiring (Task 5, Important 2)', () => {
  let root;
  let hadOwnDbPath;
  let originalDbPath;

  // Captured BEFORE anything that could throw (mkdtempSync, mkdirSync), so
  // afterEach always restores correctly even if setup fails partway through
  // — a window that mattered here specifically because this file shares a
  // process with the rest of the suite (vitest.config.js: fileParallelism:
  // false), so a leaked/wrongly-cleared SESSIONS_DB_PATH would bleed into
  // later files, not just later tests in this one.
  beforeEach(() => {
    hadOwnDbPath = Object.prototype.hasOwnProperty.call(process.env, 'SESSIONS_DB_PATH');
    originalDbPath = process.env.SESSIONS_DB_PATH;
  });

  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = undefined;
    if (hadOwnDbPath) process.env.SESSIONS_DB_PATH = originalDbPath;
    else delete process.env.SESSIONS_DB_PATH;
  });

  it(
    'with no exportFn injected, a missing sessions.db surfaces as a per-book ' +
      'error from the RESOLVED builder — not a crash, and not a refusal',
    () => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'default-exportfn-'));
      const booksDir = path.join(root, 'books');
      fs.mkdirSync(path.join(booksDir, 'testbook', 'glossary'), { recursive: true });

      // `root` exists (mkdtempSync created it); `sessions.db` inside it does
      // not. That is the shape that reliably yields SQLITE_CANTOPEN rather
      // than a "directory does not exist" TypeError (measured empirically —
      // a missing PARENT directory throws a different, node-level error).
      const missingDbPath = path.join(root, 'sessions.db');
      process.env.SESSIONS_DB_PATH = missingDbPath;

      const errors = [];
      const code = runGlossaryExport({
        booksDir,
        projectRoot: root,
        // NO exportFn — the whole point: export-terminology.js's default
        // parameter (`exportFn = createResolvedExportFn()`) must run.
        subjectFn: () => 'chemistry',
        log: () => {},
        logError: (msg) => errors.push(msg),
      });

      expect(code).toBe(1);
      const joined = errors.join('\n');
      // The resolved builder's failure mode: an open against a non-existent
      // file. This is NOT what the old builder (terminologyService.getDb(),
      // read-write, creates the file) would have produced, and it is NOT a
      // `refused-*` outcome — either of those would mean this test failed to
      // discriminate the change it exists to guard.
      expect(joined).toMatch(/SQLITE_CANTOPEN|unable to open database file/i);
      expect(fs.existsSync(missingDbPath)).toBe(false);

      const status = JSON.parse(
        fs.readFileSync(path.join(root, 'pipeline-output', '.glossary-export-status.json'), 'utf8')
      );
      expect(status.errors).toBe(1);
      expect(status.books.testbook.outcome).toBe('error');
    }
  );
});
