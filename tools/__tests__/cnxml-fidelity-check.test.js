import { describe, it, expect } from 'vitest';
import { compareTagCounts } from '../cnxml-fidelity-check.js';

describe('compareTagCounts', () => {
  it('returns empty array for identical tag structure', () => {
    const source = '<document><title>Hello</title><para id="p1">text</para></document>';
    const translated = '<document><title>Hæ</title><para id="p1">texti</para></document>';
    expect(compareTagCounts(source, translated)).toEqual([]);
  });

  it('detects missing elements', () => {
    const source = '<para><emphasis>bold</emphasis><emphasis>italic</emphasis></para>';
    const translated = '<para><emphasis>feitletrað</emphasis></para>';
    const diffs = compareTagCounts(source, translated);
    expect(diffs).toEqual([{ tag: 'emphasis', source: 2, translated: 1, diff: -1 }]);
  });

  it('detects extra elements', () => {
    const source = '<para><term>acid</term></para>';
    const translated = '<para><term>sýra</term><term>efni</term><term>vatn</term></para>';
    const diffs = compareTagCounts(source, translated);
    expect(diffs).toEqual([{ tag: 'term', source: 1, translated: 3, diff: 2 }]);
  });

  it('handles multiple differences', () => {
    const source = '<para><emphasis>a</emphasis><emphasis>b</emphasis><term>c</term></para>';
    const translated = '<para><term>d</term><term>e</term><term>f</term></para>';
    const diffs = compareTagCounts(source, translated);
    expect(diffs).toContainEqual({ tag: 'emphasis', source: 2, translated: 0, diff: -2 });
    expect(diffs).toContainEqual({ tag: 'term', source: 1, translated: 3, diff: 2 });
  });

  it('returns diffs sorted by tag name', () => {
    const source = '<para><term>a</term><emphasis>b</emphasis></para>';
    const translated = '<para></para>';
    const diffs = compareTagCounts(source, translated);
    expect(diffs[0].tag).toBe('emphasis');
    expect(diffs[1].tag).toBe('term');
  });
});
