import { describe, it, expect } from 'vitest';
import {
  compareTagCounts,
  extractIdSequence,
  compareElementOrder,
} from '../cnxml-fidelity-check.js';

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

describe('extractIdSequence', () => {
  it('returns ids in document order, first occurrence only', () => {
    const cnxml = '<a id="p1"/><b id="p2"><c id="p3"/></b><d id="p2"/>';
    expect(extractIdSequence(cnxml)).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('extractIdSequence skips target-id references (OC-C)', () => {
  it('does not emit a phantom id for a target-id reference', () => {
    const src = `<para id="p1">see <link target-id="figZ"/></para><figure id="figZ"/>`;
    // figZ must appear exactly once (its definition), not twice (ref + def)
    expect(extractIdSequence(src)).toEqual(['p1', 'figZ']);
  });

  it('drops a cross-document target-id that has no local definition', () => {
    const src = `<para id="p1">see <link target-id="ghost" document="m999"/></para>`;
    expect(extractIdSequence(src)).toEqual(['p1']);
  });
});

describe('compareElementOrder', () => {
  it('ok:true when common ids are in the same relative order', () => {
    const src = '<x id="a"/><x id="b"/><x id="c"/>';
    const trans = '<x id="a"/><x id="b"/><x id="c"/>';
    expect(compareElementOrder(src, trans)).toEqual({ ok: true, moved: [] });
  });

  it('ok:false and reports moved ids when order differs', () => {
    const src = '<x id="a"/><x id="b"/><x id="c"/>';
    const trans = '<x id="b"/><x id="a"/><x id="c"/>'; // a and b swapped
    const r = compareElementOrder(src, trans);
    expect(r.ok).toBe(false);
    expect(r.moved).toContain('a');
    expect(r.moved).toContain('b');
  });

  it('ignores ids present in only one side (add/drop is the tag-count check job)', () => {
    const src = '<x id="a"/><x id="b"/>';
    const trans = '<x id="a"/><x id="z"/><x id="b"/>'; // z extra, a/b order preserved
    expect(compareElementOrder(src, trans)).toEqual({ ok: true, moved: [] });
  });
});
