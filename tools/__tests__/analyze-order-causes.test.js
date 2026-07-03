import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { classifyMovedIds, analyzeModuleOrder } from '../analyze-order-causes.js';

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

  it('attributes to the real element, not an earlier target-id reference to it', () => {
    // `id` must not match inside `target-id="..."` (the CNXML xref attribute).
    const src = `<link target-id="fig1">see</link><figure id="fig1"><media id="m1"/></figure>`;
    const { counts } = classifyMovedIds(src, ['fig1']);
    expect(counts).toEqual({ figure: 1 });
  });
});

const SRCDIR = join(import.meta.dirname, '..', '..', 'books', 'efnafraedi-2e', '01-source');

describe('analyzeModuleOrder (real modules, in-memory fresh build)', () => {
  it('reports a fully clean module as moved=[] (m68702, section-bug fixed by F1)', () => {
    const src = readFileSync(join(SRCDIR, 'ch03', 'm68702.cnxml'), 'utf8');
    const { moved } = analyzeModuleOrder(src);
    expect(moved).toEqual([]);
  });

  it("classifies a residual module's moved ids by element tag (m68814 → equation + media)", () => {
    const src = readFileSync(join(SRCDIR, 'ch15', 'm68814.cnxml'), 'utf8');
    const { moved, counts, unresolved } = analyzeModuleOrder(src);
    expect(moved.length).toBeGreaterThan(0);
    expect(unresolved).toEqual([]);
    // residual causes for this module are block-equation + inline-media positioning
    expect(Object.keys(counts).sort()).toEqual(['equation', 'media']);
  });
});
