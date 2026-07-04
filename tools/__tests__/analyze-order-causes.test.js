import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { classifyMovedIds, analyzeModuleOrder, aggregateBook } from '../analyze-order-causes.js';

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

  // m68814 (equation+media) was cleaned by OC-A's elementIdPosition sweep;
  // m68789 (container tables) was cleaned by OC-B's tablesHandledInContainers
  // fix — neither is a valid residual fixture anymore. Anchor on m68739, a tail
  // module whose residual is non-table (equation/media/list) and survives both
  // OC-A and OC-B. Assert only the stable property (moved>0); do NOT pin the
  // tag multiset — this tail may be fixed by a later pass.
  it('classifies a still-residual tail module (m68739 — non-table needs-deeper-look tail)', () => {
    const src = readFileSync(join(SRCDIR, 'ch07', 'm68739.cnxml'), 'utf8');
    const { moved } = analyzeModuleOrder(src);
    expect(moved.length).toBeGreaterThan(0);
  });
});

describe('aggregateBook (resilience — one module fails to build)', () => {
  // Injected fake analyzer keyed off the source string, so the resilience is
  // unit-testable without a real fresh build.
  const fakeAnalyze = (source) => {
    if (source === 'THROW') throw new Error('boom');
    if (source === 'RESIDUAL') return { moved: ['e1'], counts: { equation: 1 }, unresolved: [] };
    return { moved: [], counts: {}, unresolved: [] }; // CLEAN
  };

  const entries = [
    { moduleId: 'mClean', source: 'CLEAN' },
    { moduleId: 'mThrow', source: 'THROW' },
    { moduleId: 'mResidual', source: 'RESIDUAL' },
  ];

  it('records the throwing module in buildFailures instead of aborting', () => {
    const { buildFailures } = aggregateBook(entries, fakeAnalyze);
    expect(buildFailures).toEqual([{ moduleId: 'mThrow', error: 'boom' }]);
  });

  it('continues the run and aggregates the survivors', () => {
    const { cleanModules, perModule, perCause } = aggregateBook(entries, fakeAnalyze);
    expect(cleanModules).toEqual(['mClean']);
    expect(perModule.map((m) => m.moduleId)).toEqual(['mResidual']);
    expect(perCause.equation.movedIds).toBe(1);
    expect([...perCause.equation.modules]).toEqual(['mResidual']);
  });
});
