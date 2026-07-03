import { describe, it, expect } from 'vitest';
import { classifyMovedIds } from '../analyze-order-causes.js';

const SRC = `<document>
<para id="p1">text</para>
<equation id="e1" class="unnumbered"><m:math/></equation>
<term id="t1">Term</term>
<media id="m1" alt="x"/>
<figure id="fig1"><media id="m2"/></figure>
</document>`;

describe('classifyMovedIds', () => {
  it('counts each moved id by its source element tag', () => {
    const { counts } = classifyMovedIds(SRC, ['e1', 't1', 'm1']);
    expect(counts).toEqual({ equation: 1, term: 1, media: 1 });
  });

  it('aggregates repeated tags', () => {
    const { counts } = classifyMovedIds(SRC, ['m1', 'm2']);
    expect(counts).toEqual({ media: 2 });
  });

  it('routes an id absent from source to unresolved, not into counts', () => {
    const { counts, unresolved } = classifyMovedIds(SRC, ['e1', 'ghost-id']);
    expect(counts).toEqual({ equation: 1 });
    expect(unresolved).toEqual(['ghost-id']);
  });

  it('is not fooled by an id substring of another id', () => {
    // 'p1' must not match 'p10'; require exact quoted id
    const src = `<para id="p10">a</para><note id="p1">b</note>`;
    const { counts } = classifyMovedIds(src, ['p1']);
    expect(counts).toEqual({ note: 1 });
  });
});
