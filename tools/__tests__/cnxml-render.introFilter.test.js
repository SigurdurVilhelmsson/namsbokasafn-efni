import { describe, it, expect } from 'vitest';
import { filterOutlineEntries } from '../cnxml-render.js';

describe('filterOutlineEntries', () => {
  it('skips _-prefixed metadata keys with null info without throwing', () => {
    const sections = {
      _chapterTitle: null,
      1: { section: '1', slug: 'a' },
      0: { section: '0', slug: 'intro' },
    };
    expect(() => filterOutlineEntries(sections)).not.toThrow();
    expect(filterOutlineEntries(sections).map(([k]) => k)).toEqual(['1']);
  });
});
