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

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

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
