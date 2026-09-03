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

  it.each([...Array(21)].map((_, i) => i + 1).concat(['appendices']))(
    'chapter %s: authoritative order equals the legacy sectionOrder sort',
    (chapter) => {
      const chapterDir =
        chapter === 'appendices' ? 'appendices' : `ch${String(chapter).padStart(2, '0')}`;
      const structDir = path.join(REPO_ROOT, 'books', 'efnafraedi-2e', '02-structure', chapterDir);
      const entries = fs
        .readdirSync(structDir)
        .filter((f) => f.endsWith('-structure.json'))
        .map((f) => ({
          filename: f,
          data: JSON.parse(fs.readFileSync(path.join(structDir, f), 'utf-8')),
        }));

      // Old behaviour: sort by legacyStructComparator, drop the intro.
      const legacyOrder = [...entries]
        .sort(legacyStructComparator)
        .filter((e) => e.data.documentClass !== 'introduction')
        .map((e) => e.data.moduleId);

      // New behaviour: read the assigned section numbers, drop the intro ('0'), order by them.
      const sections = buildModuleSections('efnafraedi-2e', chapter);
      const newOrder = entries
        .map((e) => e.data.moduleId)
        .filter((id) => sections[id] && sections[id].section !== '0')
        .sort((a, b) => Number(sections[a].section) - Number(sections[b].section));

      // 🔴 NON-VACUITY GUARD, and it is the reason this assertion still means
      // something. The two orders agreeing is only evidence if there is something
      // to agree about; an empty chapter would satisfy `toEqual` trivially.
      expect(newOrder.length).toBeGreaterThan(0);
      expect(newOrder).toEqual(legacyOrder);
    }
  );

  /**
   * 🔴 THE MECHANISM'S POSITIVE CONTROL — do not delete this when the equality
   * above is quiet, because it is the ONLY remaining real-data evidence that
   * collection-order authority changes anything.
   *
   * WHAT CHANGED. ch04 and ch06 used to be special-cased here: m68710 and m68733
   * each carried `sectionOrder: null`, so the legacy comparator sorted them to the
   * chapter end while collection-order authority kept them in their true slots —
   * a real divergence, asserted on real data. §C82 action ③'s whole-chapter
   * `--chapter` pass then assigned both a positional `sectionOrder`
   * (`cnxml-extract.js` builds `moduleOrderMap` ONLY under `--chapter`; every
   * other path writes null), so the divergence is legitimately gone: 0 of 149
   * chemistry and 0 of 342 organic modules in authority-covered numbered chapters
   * can still trip it.
   *
   * ▶ SO RE-BASELINING THE BRANCHES TO EQUALITY IS CORRECT AND NOT SUFFICIENT.
   * Deleting them alone would retire the only check that ever demonstrated the
   * authority doing its job, and leave a test that passes because its population
   * is empty — which is precisely the vacuous shape this project's doctrine says
   * causes the next bug. This control re-creates the condition IN MEMORY instead
   * of waiting for the corpus to produce it again.
   *
   * ⚠️ The condition is not hypothetical: a single-module `cnxml-extract --input`
   * run writes `sectionOrder = null` again, which is exactly how m68710 acquired
   * its null in the first place.
   */
  it('🔴 CONTROL — a null sectionOrder still diverges, so the authority is demonstrably doing work', () => {
    const structDir = path.join(REPO_ROOT, 'books', 'efnafraedi-2e', '02-structure', 'ch04');
    const entries = fs
      .readdirSync(structDir)
      .filter((f) => f.endsWith('-structure.json'))
      .map((f) => ({
        filename: f,
        data: JSON.parse(fs.readFileSync(path.join(structDir, f), 'utf-8')),
      }));

    // The corpus is healthy today — that is the premise this control depends on,
    // so assert it rather than assume it.
    expect(entries.length).toBeGreaterThan(2);
    expect(entries.every((e) => e.data.sectionOrder !== null)).toBe(true);

    const nonIntro = (list) =>
      list.filter((e) => e.data.documentClass !== 'introduction').map((e) => e.data.moduleId);
    const healthy = nonIntro([...entries].sort(legacyStructComparator));

    // Re-create the condition the deleted branches used to observe: one module
    // loses its positional order, as a single-module `--input` extraction does.
    const victim = healthy[1];
    const mutated = entries.map((e) =>
      e.data.moduleId === victim ? { ...e, data: { ...e.data, sectionOrder: null } } : e
    );
    const withNull = nonIntro([...mutated].sort(legacyStructComparator));

    // The legacy comparator sorts the null to the end — the divergence collection
    // -order authority exists to correct.
    expect(withNull).not.toEqual(healthy);
    expect(withNull[withNull.length - 1]).toBe(victim);

    // …and THE AUTHORITY IS FED THE SAME MUTATED ENTRIES, which is the only way
    // this half discriminates. Asserting the authority against UNMUTATED data
    // would hold even if it had silently degraded to reading `sectionOrder`,
    // because the real corpus has no nulls left — a control that cannot fail.
    const co = readCO('efnafraedi-2e');
    const ids = authoritativeOrder(co, 4);
    expect(ids).toBeTruthy();
    const authoritative = nonIntro(
      sortByAuthoritativeOrder(mutated, ids, {
        book: 'efnafraedi-2e',
        chapter: 4,
      })
    );
    expect(authoritative).toEqual(healthy); // the null did not move it
    expect(authoritative).not.toEqual(withNull); // …unlike the legacy comparator
  });
});
