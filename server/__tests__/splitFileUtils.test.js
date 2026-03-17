/**
 * Split File Utilities Tests
 *
 * Tests pure functions for handling split file naming conventions.
 * No DB or filesystem dependencies.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  extractBaseSectionId,
  isSplitPart,
  extractPartLetter,
  groupFilesBySection,
  isSectionComplete,
  countUniqueSections,
  getUniqueSections,
} = require('../services/splitFileUtils');

describe('extractBaseSectionId', () => {
  it('strips .is.md extension', () => {
    expect(extractBaseSectionId('1-2.is.md')).toBe('1-2');
  });

  it('strips .en.md extension', () => {
    expect(extractBaseSectionId('1-2.en.md')).toBe('1-2');
  });

  it('strips split indicator (a) from .is.md', () => {
    expect(extractBaseSectionId('1-2(a).is.md')).toBe('1-2');
  });

  it('strips split indicator (b) from .en.md', () => {
    expect(extractBaseSectionId('1-2(b).en.md')).toBe('1-2');
  });

  it('handles intro section', () => {
    expect(extractBaseSectionId('intro.is.md')).toBe('intro');
  });

  it('handles hyphenated section with extra suffix', () => {
    expect(extractBaseSectionId('1-2-strings.is.md')).toBe('1-2-strings');
  });
});

describe('isSplitPart', () => {
  it('returns true for split file with (a)', () => {
    expect(isSplitPart('1-2(a).is.md')).toBe(true);
  });

  it('returns true for split file with (b) and .en.md', () => {
    expect(isSplitPart('1-2(b).en.md')).toBe(true);
  });

  it('returns false for non-split file', () => {
    expect(isSplitPart('1-2.is.md')).toBe(false);
  });

  it('returns false for filename without proper extension', () => {
    expect(isSplitPart('1-2(a).txt')).toBe(false);
  });
});

describe('extractPartLetter', () => {
  it('returns "a" for (a) split', () => {
    expect(extractPartLetter('1-2(a).is.md')).toBe('a');
  });

  it('returns "b" for (b) split', () => {
    expect(extractPartLetter('3-1(b).en.md')).toBe('b');
  });

  it('returns null for non-split file', () => {
    expect(extractPartLetter('1-2.is.md')).toBeNull();
  });
});

describe('groupFilesBySection', () => {
  it('groups split files under same base section', () => {
    const files = ['1-2(a).is.md', '1-2(b).is.md', '1-3.is.md'];
    const result = groupFilesBySection(files);

    expect(result).toEqual({
      '1-2': ['1-2(a).is.md', '1-2(b).is.md'],
      '1-3': ['1-3.is.md'],
    });
  });

  it('handles empty array', () => {
    expect(groupFilesBySection([])).toEqual({});
  });

  it('handles all non-split files', () => {
    const files = ['1-1.is.md', '1-2.is.md'];
    const result = groupFilesBySection(files);
    expect(result).toEqual({
      '1-1': ['1-1.is.md'],
      '1-2': ['1-2.is.md'],
    });
  });
});

describe('isSectionComplete', () => {
  it('returns true for non-split section with one file', () => {
    expect(isSectionComplete(['1-3.is.md'], 1)).toBe(true);
  });

  it('returns true for split section with all 3 parts', () => {
    const parts = ['1-2(a).is.md', '1-2(b).is.md', '1-2(c).is.md'];
    expect(isSectionComplete(parts, 3)).toBe(true);
  });

  it('returns false for split section missing a part', () => {
    const parts = ['1-2(a).is.md', '1-2(b).is.md'];
    expect(isSectionComplete(parts, 3)).toBe(false);
  });

  it('returns false for empty parts array', () => {
    expect(isSectionComplete([], 1)).toBe(false);
  });

  it('returns false for null/undefined parts', () => {
    expect(isSectionComplete(null, 1)).toBe(false);
    expect(isSectionComplete(undefined, 1)).toBe(false);
  });
});

describe('countUniqueSections', () => {
  it('collapses split files into unique count', () => {
    const files = ['1-2(a).is.md', '1-2(b).is.md', '1-3.is.md'];
    expect(countUniqueSections(files)).toBe(2);
  });

  it('returns 0 for empty array', () => {
    expect(countUniqueSections([])).toBe(0);
  });
});

describe('getUniqueSections', () => {
  it('returns deduplicated base section IDs', () => {
    const files = ['1-2(a).is.md', '1-2(b).is.md', '1-3.is.md'];
    const result = getUniqueSections(files);
    expect(result).toEqual(['1-2', '1-3']);
  });

  it('returns empty array for empty input', () => {
    expect(getUniqueSections([])).toEqual([]);
  });
});
