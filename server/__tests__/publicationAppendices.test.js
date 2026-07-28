/**
 * Task 7 (C1a R2): publication read-path accepts appendices.
 *
 * Pre-fix, publicationService builds `ch${String(-1).padStart(2,'0')}` = `ch-1`
 * for the appendices chapter (-1) — a directory that never exists on disk.
 * Post-fix it must resolve the real `appendices/` directory instead.
 *
 * Pinned against the REAL committed efnafraedi-2e content:
 *   books/efnafraedi-2e/02-mt-output/appendices/ contains 13 modules with
 *   `mNNNNN-segments.is.md` files (verified via `ls` before writing this test).
 */

import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { createRequire } from 'module';
import { EventEmitter } from 'node:events';

const require = createRequire(import.meta.url);

// Spy on child_process.spawn BEFORE publicationService.js is first required
// (below and in the describe block that follows). publicationService.js
// destructures `const { spawn } = require('child_process');` at module-load
// time — CJS require has no live bindings, so whatever `.spawn` holds at
// THAT moment is what the module calls forever after. The spy must already
// be installed the first time this file (and thus publicationService.js)
// is loaded, or it will silently miss every call.
const childProcess = require('child_process');
const spawnSpy = vi.spyOn(childProcess, 'spawn');
const { validateBeforePublish } = require('../services/publicationService');

/**
 * Build a fake child_process child that resolves validateBeforePublish's
 * Promise with the given (already-JSON-stringified) validate-chapter.js
 * `--json` stdout payload.
 */
function makeFakeChild(jsonStdout) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  queueMicrotask(() => {
    child.stdout.emit('data', Buffer.from(jsonStdout));
    child.emit('close', 0);
  });
  return child;
}

describe('validateBeforePublish sends the CLI-safe chapter arg (C1d task 3)', () => {
  afterEach(() => {
    spawnSpy.mockReset();
  });

  it('spawns validate-chapter.js with "appendices" (not "-1") in the chapter-arg slot for the appendices chapter', async () => {
    spawnSpy.mockImplementation(() => makeFakeChild('{"valid":true,"checks":{},"summary":{}}'));

    await validateBeforePublish('efnafraedi-2e', -1, 'mt-preview');

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const [command, args] = spawnSpy.mock.calls[0];
    expect(command).toBe('node');
    // args: [validate-chapter.js path, bookSlug, chapterArg, '--track', track, '--json']
    // Assert the chapter arg's POSITION (index 2, right after the book slug),
    // not just membership — a bare `.toContain('appendices')` would pass even
    // if the value landed in the wrong slot.
    expect(args[1]).toBe('efnafraedi-2e');
    expect(args[2]).toBe('appendices');
  });

  it('spawns validate-chapter.js with "5" in the chapter-arg slot for a numeric chapter (no behaviour change)', async () => {
    spawnSpy.mockImplementation(() => makeFakeChild('{"valid":true,"checks":{},"summary":{}}'));

    await validateBeforePublish('efnafraedi-2e', 5, 'mt-preview');

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const [, args] = spawnSpy.mock.calls[0];
    expect(args[1]).toBe('efnafraedi-2e');
    expect(args[2]).toBe('5');
  });
});

describe('publicationService resolves the appendices dir (not ch-1)', () => {
  const {
    checkMtPreviewReadiness,
    getPublicationStatus,
  } = require('../services/publicationService');

  it('mt-preview readiness for appendices reflects the real appendices/ content', () => {
    const result = checkMtPreviewReadiness('efnafraedi-2e', -1);

    // Pre-fix: ready=false, reason mentions the nonexistent `ch-1` dir, no moduleCount.
    // Post-fix: ready=true, moduleCount=13 (real file count), sourceDir points at
    // the real `appendices/` directory.
    expect(result.ready).toBe(true);
    expect(result.moduleCount).toBe(13);
    expect(result.sourceDir).toBe('02-mt-output/appendices');
    expect(result.modules).toContain('m68859');
  });

  it('getPublicationStatus for appendices reads the real 05-publication/mt-preview/chapters/appendices/ dir (not chapters/-1)', () => {
    // Real committed data: books/efnafraedi-2e/05-publication/mt-preview/chapters/appendices/
    // has 13 rendered .html files (verified via `ls` before writing this test).
    // Pre-fix this site built `chapters/-1` (String(-1).padStart(2,'0') === '-1'),
    // a nonexistent dir → published:false, fileCount:0.
    const status = getPublicationStatus('efnafraedi-2e', -1);

    expect(status.mtPreview.published).toBe(true);
    expect(status.mtPreview.fileCount).toBe(13);
    expect(status.mtPreview.path).toBe('05-publication/mt-preview/chapters/appendices');
  });

  it('getPublicationStatus for a numeric chapter is unaffected (no accidental ch-prefix regression)', () => {
    // Guards against a future "DRY" refactor of the bare-dir site to chapterDir()
    // (which would wrongly produce `chapters/ch01` instead of `chapters/01`).
    const status = getPublicationStatus('efnafraedi-2e', 1);

    expect(status.mtPreview.path).toBe('05-publication/mt-preview/chapters/01');
  });
});

/**
 * Task 4 (C1d B4): end-to-end verification that Tasks 1-3 compose across the
 * REAL publish path — publicationService.validateBeforePublish spawning the
 * REAL tools/validate-chapter.js child process against the REAL committed
 * books/efnafraedi-2e/02-mt-output/appendices content (13 modules), exactly
 * as production does it. This is deliberately NOT mocked: task 3's own test
 * above (line ~51) already pins the spawn ARGUMENT; this suite pins that the
 * spawned process actually runs to completion and produces the right result.
 *
 * Per the brief's 2026-07-28 amendment, every assertion here is POSITIVE
 * (checks fire and pass / resolve with real data), never merely "no longer a
 * 500" — a new failure mode could satisfy a purely negative assertion.
 *
 * Do NOT assert `results.valid === true` globally here: the content-quality
 * validators now run against the real 2247-file 02-structure/appendices tree
 * for the first time, and a genuine data finding (there is one — see below)
 * is not a tool bug to be pinned away.
 */
describe('C1d Task 4: end-to-end publish-path assertions (mt-preview reaches publish; faithful stays gated)', () => {
  // The two describe blocks above installed a custom spawn mockImplementation
  // per-test and reset it in their own afterEach. vi.spyOn's mockReset()
  // restores call-through to the REAL child_process.spawn (it does not zero
  // the implementation out — verified against @vitest/spy's source), so by
  // the time this block runs the spy already calls through. mockRestore()
  // here is belt-and-suspenders: it un-patches the spy entirely so this
  // suite's real-process assertions can never depend on sibling test order.
  beforeAll(() => {
    spawnSpy.mockRestore();
  });

  const { checkTrackReadiness } = require('../services/publicationService');

  it('assertion 1: validateBeforePublish resolves with parseable results for the real appendices mt-preview content (pre-C1d: rejected on empty stdout)', async () => {
    const result = await validateBeforePublish('efnafraedi-2e', -1, 'mt-preview');

    expect(typeof result.valid).toBe('boolean');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(result.summary).toBeTruthy();
    expect(typeof result.summary.passed).toBe('number');
  }, 15000);

  it('assertion 2: the dir-resolving checks PASS for the appendix chapter, proving context.chapterDir resolved the real appendices/ tree', async () => {
    // Goes one level below validateBeforePublish (which only surfaces
    // errors/warnings, not the full per-check `passed` map) to the tool's own
    // validateChapter(), an ES module — dynamic import from this CJS test.
    const { validateChapter } = await import('../../tools/validate-chapter.js');

    const results = await validateChapter({
      book: 'efnafraedi-2e',
      chapter: -1,
      track: 'mt-preview',
    });

    expect(results.chapterDir).toBe('appendices');
    // files-exist reads 02-mt-output/<chapterDir>: only passes if the real
    // 13-module appendices/ dir was found (pre-fix: nonexistent ch-1 → fails).
    expect(results.checks['files-exist'].passed).toBe(true);
    expect(results.checks['files-exist'].issues).toHaveLength(0);
    // manifest-consistency (the "structure" check) reads 02-structure/<chapterDir>
    // — the real appendices/ manifests, 13 of them.
    expect(results.checks['manifest-consistency'].passed).toBe(true);
  });

  it('assertion 3: no wrong-convention path leaks anywhere in the returned errors/warnings', async () => {
    // mt-preview has no wrong-dir errors to inspect (everything resolves and
    // passes — see assertion 2), so `errors`/`warnings` would be `[]` and this
    // would pass vacuously against an empty string. Use the faithful track
    // instead: there is genuinely no books/efnafraedi-2e/03-faithful-translation/
    // appendices/ on disk (assertion 4), so files-exist fires a real ERROR
    // whose `file` field IS the resolved source dir path — a non-empty,
    // path-bearing payload for the wrong-convention scan to actually scan.
    const result = await validateBeforePublish('efnafraedi-2e', -1, 'faithful');
    const serialized = JSON.stringify(result.errors);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(serialized).toContain('03-faithful-translation/appendices');
    expect(serialized).not.toMatch(/ch-1\b/);
    expect(serialized).not.toMatch(/chappendices/);
    expect(serialized).not.toMatch(/chapters[/\\]-1\b/);
  }, 15000);

  it('assertion 4: fail-closed preserved — faithful readiness is still false for appendices (no 03-faithful-translation/appendices on disk)', () => {
    // This is the constraint the whole task exists to protect: publish-path
    // support for mt-preview must not accidentally open a write path for a
    // track that has no real content. publishChapter() calls
    // checkTrackReadiness() BEFORE validateBeforePublish() and throws on
    // ready:false, so this stays a hard gate regardless of Tasks 1-3.
    const result = checkTrackReadiness('efnafraedi-2e', -1, 'faithful');

    expect(result.ready).toBe(false);
    // This assertion is true both before and after C1d (there never was a
    // faithful/appendices dir), so ready:false alone doesn't prove chapterDir
    // resolved correctly here — it could pass because the tool is still
    // looking at a nonexistent `ch-1`. Pinning the reason's path proves it
    // reached (and correctly missed) the REAL appendices/ dir, not a
    // coincidentally-also-missing wrong one.
    expect(result.reason).toContain('03-faithful-translation/appendices');
  });

  it('known real data finding (logged, not silenced): appendices status.json reports every stage incomplete while 13 modules are rendered — status-match fires INFO, not an error', async () => {
    const { validateChapter } = await import('../../tools/validate-chapter.js');
    const results = await validateChapter({
      book: 'efnafraedi-2e',
      chapter: -1,
      track: 'mt-preview',
    });

    const statusCheck = results.checks['status-match'];
    expect(statusCheck.severity).toBe('info');
    expect(statusCheck.passed).toBe(false);
    expect(statusCheck.issues[0].message).toContain("doesn't indicate completion");

    // This does NOT assert results.valid globally (that would pin real data —
    // a future genuine ERROR elsewhere in the tree should be free to flip
    // this book's validity without breaking this test). It asserts the
    // MECHANISM instead: severity routing is code, not data, and INFO-severity
    // issues are provably excluded from validateBeforePublish's errors/warnings
    // (see the source: it only pushes on `check.severity === 'error'` or
    // `'warning'`), so this specific finding can never block a publish.
    const published = await validateBeforePublish('efnafraedi-2e', -1, 'mt-preview');
    const infoLeaked = [...published.errors, ...published.warnings].some((issue) =>
      issue.message.includes("doesn't indicate completion")
    );
    expect(infoLeaked).toBe(false);
  });
});
