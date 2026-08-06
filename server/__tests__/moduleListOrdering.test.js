/**
 * Module list ordering.
 *
 * `segmentParser.listChapterModules` returns modules in `fs.readdirSync` order,
 * which is arbitrary — a 2026-08-06 UX audit found chapter 1 of efnafraedi-2e
 * presented to editors as 1.4, 1.6, 1.5. Editors choose what to work on from
 * this list, so `enrichModules` sorts it into document order.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { enrichModules, moduleSortKey, compareKeys } = require('../services/bookDataLoader');

const sortKeys = (mods) =>
  [...mods].sort((a, b) => compareKeys(moduleSortKey(a), moduleSortKey(b)));

describe('moduleSortKey / compareKeys', () => {
  it('orders sections numerically, not as strings', () => {
    const mods = [
      { moduleId: 'e', section: '1.10' },
      { moduleId: 'a', section: '1.2' },
      { moduleId: 'b', section: '1.1' },
      { moduleId: 'c', section: '1.9' },
    ];
    expect(sortKeys(mods).map((m) => m.section)).toEqual(['1.1', '1.2', '1.9', '1.10']);
  });

  it('reproduces the audit case: 1.4, 1.6, 1.5 becomes 1.4, 1.5, 1.6', () => {
    const mods = [
      { moduleId: 'm68676', section: '1.4' },
      { moduleId: 'm68682', section: '1.6' },
      { moduleId: 'm68679', section: '1.5' },
    ];
    expect(sortKeys(mods).map((m) => m.section)).toEqual(['1.4', '1.5', '1.6']);
  });

  it('puts chapter metadata first and intro before numbered sections', () => {
    const mods = [
      { moduleId: 'm1', section: '1.1' },
      { moduleId: 'm0', section: 'intro' },
      { moduleId: 'chapter-metadata' },
    ];
    expect(sortKeys(mods).map((m) => m.moduleId)).toEqual(['chapter-metadata', 'm0', 'm1']);
  });

  it('sorts modules with no parseable section last rather than dropping them', () => {
    const mods = [
      { moduleId: 'weird', section: 'appendix-b' },
      { moduleId: 'm1', section: '2.1' },
      { moduleId: 'nosection', section: null },
    ];
    const out = sortKeys(mods).map((m) => m.moduleId);
    expect(out[0]).toBe('m1');
    expect(out).toHaveLength(3);
    expect(out).toEqual(expect.arrayContaining(['weird', 'nosection']));
  });

  it('orders a bare appendix number before its subsections', () => {
    const mods = [
      { moduleId: 'a2', section: '1.1' },
      { moduleId: 'a1', section: '1' },
    ];
    expect(sortKeys(mods).map((m) => m.section)).toEqual(['1', '1.1']);
  });
});

describe('enrichModules', () => {
  it('sorts in place even when the book has no data file', () => {
    const mods = [
      { moduleId: 'm2', section: '1.2' },
      { moduleId: 'm1', section: '1.1' },
    ];
    enrichModules('__no-such-book__', mods);
    expect(mods.map((m) => m.moduleId)).toEqual(['m1', 'm2']);
  });
});
