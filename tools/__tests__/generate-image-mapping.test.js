import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  indexSourceImageBasenames,
  deriveOriginalBasename,
  buildMappingEntries,
  mergeMapping,
  DEFAULT_SUFFIX,
} from '../generate-image-mapping.js';

const REPO_ROOT = path.join(fileURLToPath(new URL('../..', import.meta.url)));

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

// ─── default locale suffix ─────────────────────────────────────────
// Anchored on the COMMITTED corpus, not on a second copy of the literal.
// The default was '_is' while every one of chemistry's ~700 translated files is
// '_IS', and the match is case-SENSITIVE: a bare run matched 0 files and still
// printed a success line, so a newly translated figure was silently never mapped.
//
// ⚠️ THIS TEST DELIBERATELY ANCHORS ON CHEMISTRY ONLY. liffraedi-2e's 36 files use
// lowercase '_is' with the LEGACY docx mapping shape (docxImage + figureId) - they
// are hand-translated leftovers from a previous job, awaiting replacement, and are
// NOT a second convention to support. '_IS' is the right default for biology too
// precisely because it matches 0 of them and changes nothing, whereas '_is' would
// match all 36 and merge basename-keyed entries into a figureId-keyed mapping.
// Do not "fix" this by widening the default or lowercasing the comparison.

describe('DEFAULT_SUFFIX', () => {
  it('is the suffix the committed translated figures actually use', () => {
    const mapping = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'books/efnafraedi-2e/media/image-mapping.json'), 'utf-8')
    );
    expect(mapping.length).toBeGreaterThan(100); // non-vacuity: the corpus is there
    const suffixes = new Set(
      mapping.map((e) => {
        const stem = e.outputName.replace(/\.[^.]+$/, '');
        return stem.slice(stem.lastIndexOf('_'));
      })
    );
    expect([...suffixes]).toEqual([DEFAULT_SUFFIX]);
  });

  it('is what generateImageMapping falls back to when no suffix is passed', () => {
    expect(deriveOriginalBasename(`fig${DEFAULT_SUFFIX}.svg`, DEFAULT_SUFFIX)).toBe('fig');
    // and the lower-case form must NOT be accepted as equivalent
    expect(deriveOriginalBasename('fig_is.svg', DEFAULT_SUFFIX)).toBeNull();
  });
});
