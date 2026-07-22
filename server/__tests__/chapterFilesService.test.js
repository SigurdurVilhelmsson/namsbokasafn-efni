/**
 * chapterFilesService.getChapterDir — appendices resolution (C1c task 2).
 *
 * getChapterDir is the shared downstream dir-builder consumed by the four
 * books.js file/import routes (GET/scan/DELETE .../files, POST .../import).
 * Pre-fix it built `ch${String(chapterNum).padStart(2, '0')}` unconditionally,
 * which mis-resolves the appendices chapter (-1) to 'ch-1' instead of the
 * real on-disk 'appendices' directory. Fixed to delegate to the canonical
 * chapterLabel.chapterDir(), which numeric chapters must match byte-for-byte.
 *
 * getChapterDir does no I/O of its own (pure path.join), so this test needs
 * no DB/disk isolation.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { getChapterDir } = require('../services/chapterFilesService');

describe('chapterFilesService.getChapterDir — appendices (C1c task 2)', () => {
  it('resolves the appendices chapter (-1) to the appendices dir, not ch-1', () => {
    const dir = getChapterDir('efnafraedi-2e', -1);
    expect(dir).toMatch(/02-for-mt[/\\]appendices$/);
    expect(dir).not.toContain('ch-1');
  });

  it('leaves a numeric chapter byte-identical to the old ch${padStart} form', () => {
    expect(getChapterDir('efnafraedi-2e', 5)).toMatch(/02-for-mt[/\\]ch05$/);
  });

  it('leaves chapter 0 (front matter) byte-identical', () => {
    expect(getChapterDir('efnafraedi-2e', 0)).toMatch(/02-for-mt[/\\]ch00$/);
  });

  it('leaves a two-digit chapter byte-identical (no extra padding)', () => {
    expect(getChapterDir('efnafraedi-2e', 21)).toMatch(/02-for-mt[/\\]ch21$/);
  });
});
