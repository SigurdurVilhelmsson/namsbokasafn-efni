/**
 * R3: checkBookDownstreamWork must admit the appendices structure dir, not
 * drop it via `.filter(d => d.startsWith('ch'))` + `parseInt(chDir.replace('ch',''),10)`.
 *
 * Real return shape of checkBookDownstreamWork(book) (verified against the
 * committed source, server/services/pipelineService.js:645):
 *   {
 *     totalExtracted, totalFaithful, totalLocalized,   // aggregate counts
 *     chaptersWithWork: [{ chapter, extractedModules, faithfulModules,
 *                          localizedModules, moduleIds, faithfulModuleIds,
 *                          localizedModuleIds, hasDownstreamWork: true }, ...],
 *     hasDownstreamWork,                                // book-level bool
 *   }
 * `chaptersWithWork` only includes a chapter when its `checkExtractionImpact`
 * reports `hasDownstreamWork` (faithful||localized modules > 0). efnafraedi-2e
 * has NO `03-faithful-translation/appendices` or `04-localized-content/appendices`
 * dir yet (verified: only ch01/ch03 have faithful content), so the appendices
 * chapter (-1) can never legitimately appear in `chaptersWithWork` on the
 * currently committed data — asserting `toContain(-1)` there would be
 * inventing behavior the data can't produce. That is NOT the bug under test.
 *
 * The real, verifiable bug: `checkExtractionImpact` builds its structure-dir
 * name as `ch${String(chapter).padStart(2,'0')}`, which for chapter=-1 (the
 * canonical appendices number, per chapterLabel.js) yields the nonexistent
 * 'ch-1' instead of 'appendices' — so its own `extractedModules` count for
 * the appendices chapter was always 0, and the aggregate `totalExtracted`
 * from checkBookDownstreamWork silently excluded the appendices manifests
 * (13 real manifest files under books/efnafraedi-2e/02-structure/appendices/)
 * both before AND after a loop-only fix (checkExtractionImpact(book, -1) is
 * a no-op either way until it also learns the appendices dir name).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('checkBookDownstreamWork admits appendices (C1a R3)', () => {
  it('checkExtractionImpact resolves the appendices dir (not ch-1) for chapter -1', () => {
    const { checkExtractionImpact } = require('../services/pipelineService');

    const impact = checkExtractionImpact('efnafraedi-2e', -1);

    // Real committed count: books/efnafraedi-2e/02-structure/appendices/ has
    // 13 *-manifest.json files (backups carry a longer suffix and don't match).
    expect(impact.extractedModules).toBe(13);
    expect(impact.moduleIds).toHaveLength(13);
  });

  it('rolls the appendices manifests into totalExtracted and never emits NaN', () => {
    const { checkBookDownstreamWork } = require('../services/pipelineService');

    const result = checkBookDownstreamWork('efnafraedi-2e');

    // Book-level scan previously summed only ch00..ch21 (136 modules, verified
    // against the unfixed source); with appendices admitted it must be at
    // least that plus the 13 appendices manifests.
    expect(result.totalExtracted).toBeGreaterThanOrEqual(136 + 13);

    const chapters = result.chaptersWithWork.map((c) => c.chapter);
    expect(chapters).not.toContain(NaN);
    // No faithful/localized appendices content exists yet, so -1 legitimately
    // does not appear here (see file header) — this only guards against a
    // NaN chapterNum ever being pushed, which the old parseInt idiom risked
    // for any non-'chNN' dir under 02-structure/.
  });
});
