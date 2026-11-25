/**
 * The Fable comparison on chemistry's largest real flagged segments (whole-branch review of PR 2, A I-1 / B C1).
 *
 * Reads the committed layer (books/efnafraedi-2e/02-mt-fable) through the real loader, read-only, and runs each
 * segment through comparisonHtml, the function the panel calls on its first opening. The appendix table summary
 * of m68865 is a diff of about 12,000 tokens a side; before the cell budget it took seconds and over a gigabyte.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { loadModuleForEditing } = require('../services/segmentParser');
const { wordDiff, comparisonHtml } = require('../public/js/word-diff.js');

const join = (ops, keep) =>
  ops
    .filter((o) => keep.includes(o.op))
    .map((o) => o.text)
    .join('');

const flagged = (chapter, moduleId, segmentId) => {
  const data = loadModuleForEditing('efnafraedi-2e', chapter, moduleId);
  expect(data.isSource).toBe('fable');
  const seg = data.segments.find((s) => s.segmentId === segmentId);
  expect(seg && seg.fableMeaning && typeof seg.fableMeaning.before).toBe('string');
  return seg;
};

const timed = (fn) => {
  const t0 = performance.now();
  const value = fn();
  return { value, ms: performance.now() - t0 };
};

describe('the comparison on the largest real segment (appendices/m68865 table summary)', () => {
  const seg = flagged(-1, 'm68865', 'm68865:table-summary:fs-idp78188768-summary');

  it('is past the cell budget, so it takes the whole-texts fallback (positive control on the size)', () => {
    const ops = wordDiff(seg.fableMeaning.before, seg.is);
    expect(ops).toEqual([
      { op: 'del', text: seg.fableMeaning.before },
      { op: 'ins', text: seg.is },
    ]);
  });

  it('builds the panel HTML in well under 100 ms', () => {
    const { value, ms } = timed(() => comparisonHtml(seg.fableMeaning.before, seg.is));
    expect(value.length).toBeGreaterThan(seg.is.length);
    expect(ms).toBeLessThan(100);
  });

  it('shows the two texts as two plain blocks, before then after, with no del or ins marks', () => {
    const html = comparisonHtml(seg.fableMeaning.before, seg.is);
    expect(html).not.toMatch(/<del|<ins/);
    const blocks = [
      ...html.matchAll(/<div class="fable-diff-whole fable-diff-(before|after)">/g),
    ].map((m) => m[1]);
    expect(blocks).toEqual(['before', 'after']);
  });

  it('keeps the join invariants: same+del is before, same+ins is the served text', () => {
    const ops = wordDiff(seg.fableMeaning.before, seg.is);
    expect(join(ops, ['same', 'del'])).toBe(seg.fableMeaning.before);
    expect(join(ops, ['same', 'ins'])).toBe(seg.is);
  });
});

describe('the comparison on the largest real segment under the budget (ch07/m68742 alt)', () => {
  const seg = flagged(7, 'm68742', 'm68742:alt:fs-idp63301888-alt');

  it('is marked word by word (it is under the budget) and keeps the join invariants', () => {
    const ops = wordDiff(seg.fableMeaning.before, seg.is);
    expect(ops.length).toBeGreaterThan(2);
    expect(join(ops, ['same', 'del'])).toBe(seg.fableMeaning.before);
    expect(join(ops, ['same', 'ins'])).toBe(seg.is);
  });

  it('builds the panel HTML within a bound that a laptop tab tolerates', () => {
    const { ms } = timed(() => comparisonHtml(seg.fableMeaning.before, seg.is));
    expect(ms).toBeLessThan(1000);
  });
});
