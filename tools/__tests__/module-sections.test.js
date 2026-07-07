import { describe, it, expect, vi } from 'vitest';
import {
  authoritativeOrder,
  sortByAuthoritativeOrder,
  legacyStructComparator,
} from '../lib/module-sections.js';

const CO = {
  chapters: [
    {
      chapter: 6,
      title: 'Electronic Structure',
      modules: ['m68728', 'm68729', 'm68732', 'm68733', 'm68734', 'm68735'],
    },
  ],
  preface: 'm68662',
  appendixModules: ['m68859', 'm68860', 'm68861'],
};

describe('authoritativeOrder', () => {
  it('returns the chapter modules array for a numeric chapter', () => {
    expect(authoritativeOrder(CO, 6)).toEqual([
      'm68728',
      'm68729',
      'm68732',
      'm68733',
      'm68734',
      'm68735',
    ]);
  });
  it('accepts a numeric-string chapter', () => {
    expect(authoritativeOrder(CO, '6')).toEqual(CO.chapters[0].modules);
  });
  it('returns appendixModules for the appendices', () => {
    expect(authoritativeOrder(CO, 'appendices')).toEqual(['m68859', 'm68860', 'm68861']);
  });
  it('returns null for chapter 0 / preface (not in chapters)', () => {
    expect(authoritativeOrder(CO, 0)).toBeNull();
  });
  it('returns null for an unknown chapter number', () => {
    expect(authoritativeOrder(CO, 99)).toBeNull();
  });
  it('returns null when the collection-order object is null', () => {
    expect(authoritativeOrder(null, 6)).toBeNull();
  });
});

describe('sortByAuthoritativeOrder', () => {
  const entry = (moduleId, sectionOrder = null) => ({
    filename: `${moduleId}-structure.json`,
    data: { moduleId, sectionOrder },
  });

  it('orders entries by their index in the authoritative id list, regardless of input order', () => {
    const entries = [
      entry('m68734'),
      entry('m68728'),
      entry('m68733'),
      entry('m68729'),
      entry('m68732'),
      entry('m68735'),
    ];
    const sorted = sortByAuthoritativeOrder(entries, CO.chapters[0].modules, {
      book: 'efnafraedi-2e',
      chapter: 6,
    });
    expect(sorted.map((e) => e.data.moduleId)).toEqual([
      'm68728',
      'm68729',
      'm68732',
      'm68733',
      'm68734',
      'm68735',
    ]);
  });

  it('appends stragglers (not in the authoritative list) after listed ones and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const entries = [entry('m68733'), entry('mZZZZZ'), entry('m68728')];
    const sorted = sortByAuthoritativeOrder(entries, CO.chapters[0].modules, {
      book: 'efnafraedi-2e',
      chapter: 6,
    });
    expect(sorted.map((e) => e.data.moduleId)).toEqual(['m68728', 'm68733', 'mZZZZZ']);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('mZZZZZ');
    warn.mockRestore();
  });

  it('does not warn when every entry is listed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sortByAuthoritativeOrder([entry('m68728'), entry('m68729')], CO.chapters[0].modules, {
      book: 'efnafraedi-2e',
      chapter: 6,
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('legacyStructComparator', () => {
  const e = (filename, sectionOrder) => ({ filename, data: { sectionOrder } });
  it('sorts by sectionOrder when both present', () => {
    expect([e('b', 2), e('a', 1)].sort(legacyStructComparator).map((x) => x.filename)).toEqual([
      'a',
      'b',
    ]);
  });
  it('places a null sectionOrder after a non-null one (the legacy behaviour, preserved for the fallback path)', () => {
    expect([e('a', null), e('b', 5)].sort(legacyStructComparator).map((x) => x.filename)).toEqual([
      'b',
      'a',
    ]);
  });
  it('falls back to filename when both null', () => {
    expect(
      [e('b', null), e('a', null)].sort(legacyStructComparator).map((x) => x.filename)
    ).toEqual(['a', 'b']);
  });
});
