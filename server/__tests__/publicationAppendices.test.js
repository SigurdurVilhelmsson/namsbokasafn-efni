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

import { describe, it, expect, vi, afterEach } from 'vitest';
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
