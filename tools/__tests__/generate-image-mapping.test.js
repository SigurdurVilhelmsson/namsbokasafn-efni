import { describe, it, expect } from 'vitest';
import {
  indexSourceImageBasenames,
  deriveOriginalBasename,
  buildMappingEntries,
  mergeMapping,
} from '../generate-image-mapping.js';

// ─── indexSourceImageBasenames ─────────────────────────────────────

describe('indexSourceImageBasenames', () => {
  it('collects the basename (no extension) of a figure image', () => {
    const cnxml = `<figure id="F"><image src="../../media/CNX_Chem_11_03_gasdissolv.jpg"/></figure>`;
    expect(indexSourceImageBasenames(cnxml).has('CNX_Chem_11_03_gasdissolv')).toBe(true);
  });

  it('also collects images that are NOT inside a figure (example/exercise/media)', () => {
    const cnxml = `<example><media><image src="../../media/CNX_Chem_01_05_SigDigits1_img.jpg"/></media></example>`;
    expect(indexSourceImageBasenames(cnxml).has('CNX_Chem_01_05_SigDigits1_img')).toBe(true);
  });
});

// ─── deriveOriginalBasename ────────────────────────────────────────

describe('deriveOriginalBasename', () => {
  it('strips the locale suffix and extension', () => {
    expect(deriveOriginalBasename('CNX_Chem_11_03_gasdissolv_IS.svg', '_IS')).toBe(
      'CNX_Chem_11_03_gasdissolv'
    );
  });

  it('returns null when the file lacks the locale suffix', () => {
    expect(deriveOriginalBasename('CNX_Chem_11_03_gasdissolv.svg', '_IS')).toBeNull();
  });
});

// ─── buildMappingEntries ───────────────────────────────────────────

describe('buildMappingEntries', () => {
  it('produces a basename-keyed entry (no figureId) for a matched file', () => {
    const set = new Set(['CNX_Chem_01_05_SigDigits1_img']);
    const { entries } = buildMappingEntries(['CNX_Chem_01_05_SigDigits1_img_IS.svg'], set, '_IS');
    expect(entries).toEqual([
      {
        originalImage: 'CNX_Chem_01_05_SigDigits1_img',
        outputName: 'CNX_Chem_01_05_SigDigits1_img_IS.svg',
        extension: '.svg',
      },
    ]);
  });

  it('reports a translated file whose basename is absent from source', () => {
    const { entries, unmatched } = buildMappingEntries(['stray_IS.svg'], new Set(), '_IS');
    expect(entries).toHaveLength(0);
    expect(unmatched).toEqual(['stray_IS.svg']);
  });
});

// ─── mergeMapping ──────────────────────────────────────────────────

describe('mergeMapping', () => {
  it('adds new entries while preserving existing ones from other chapters', () => {
    const existing = [{ originalImage: 'A', outputName: 'A_IS.svg', extension: '.svg' }];
    const fresh = [{ originalImage: 'B', outputName: 'B_IS.svg', extension: '.svg' }];
    expect(mergeMapping(existing, fresh).map((e) => e.originalImage)).toEqual(['A', 'B']);
  });

  it('overwrites an existing entry for the same image', () => {
    const existing = [{ originalImage: 'A', outputName: 'A_old.svg', extension: '.svg' }];
    const fresh = [{ originalImage: 'A', outputName: 'A_IS.svg', extension: '.svg' }];
    expect(mergeMapping(existing, fresh)).toEqual([
      { originalImage: 'A', outputName: 'A_IS.svg', extension: '.svg' },
    ]);
  });
});
