import { describe, it, expect, vi } from 'vitest';
import {
  authoritativeOrder,
  sortByAuthoritativeOrder,
  legacyStructComparator,
} from '../lib/module-sections.js';
import { buildModuleSections, loadCollectionOrder } from '../lib/module-sections.js';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const readCO = (book) =>
  JSON.parse(
    fs.readFileSync(
      path.join(REPO_ROOT, 'books', book, '01-source', 'collection-order.json'),
      'utf-8'
    )
  );

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

describe('loadCollectionOrder', () => {
  it('loads the object for a real book', () => {
    const co = loadCollectionOrder('efnafraedi-2e');
    expect(co).toBeTruthy();
    expect(Array.isArray(co.chapters)).toBe(true);
  });
  it('returns null for a book with no collection-order.json (no throw)', () => {
    expect(loadCollectionOrder('nonexistent-book-xyz')).toBeNull();
  });
});

describe('buildModuleSections — collection-order authority (efnafraedi-2e)', () => {
  it('places m68733 at section 3 (the ch06 null-sectionOrder bug fix)', () => {
    const sections = buildModuleSections('efnafraedi-2e', 6);
    expect(sections['m68733'].section).toBe('3');
    // siblings keep their positions; intro is 0
    expect(sections['m68729'].section).toBe('1');
    expect(sections['m68732'].section).toBe('2');
    expect(sections['m68734'].section).toBe('4');
    expect(sections['m68735'].section).toBe('5');
    expect(sections['m68728'].section).toBe('0'); // intro
  });

  it('orders the appendices by appendixModules', () => {
    const sections = buildModuleSections('efnafraedi-2e', 'appendices');
    const co = readCO('efnafraedi-2e');
    // non-appended sanity: every appendixModules id has a section, in ascending order
    const ordered = co.appendixModules
      .filter((id) => sections[id])
      .sort((a, b) => Number(sections[a].section) - Number(sections[b].section));
    expect(ordered).toEqual(co.appendixModules.filter((id) => sections[id]));
  });

  it('is inert everywhere else: non-intro section order matches collection-order for all 21 chapters', () => {
    const co = readCO('efnafraedi-2e');
    for (const ch of co.chapters) {
      const sections = buildModuleSections('efnafraedi-2e', ch.chapter);
      // reconstruct rendered order from assigned section numbers, excluding intro ('0')
      const rendered = ch.modules
        .filter((id) => sections[id] && sections[id].section !== '0')
        .sort((a, b) => Number(sections[a].section) - Number(sections[b].section));
      const expected = ch.modules.filter((id) => sections[id] && sections[id].section !== '0');
      expect(rendered).toEqual(expected); // collection-order == assigned order
    }
  });
});
