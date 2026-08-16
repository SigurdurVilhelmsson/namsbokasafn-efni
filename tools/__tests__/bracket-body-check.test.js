import { describe, it, expect } from 'vitest';
import { checkBracketBodies, BODY_SOURCE_ELEMENTS } from '../lib/bracket-body-check.js';

const doc = (inner) => `<document><content>${inner}</content></document>`;

describe('checkBracketBodies — anchored to source, not to a byte pattern', () => {
  it('accepts a body that matches its source element', () => {
    const src = doc(
      '<para id="p1">The <emphasis effect="italics">atom</emphasis> is small.</para>'
    );
    const seg = '<!-- SEG:m1:para:p1 -->\nThe [[i:atom]] is small.\n';
    expect(checkBracketBodies(src, seg)).toMatchObject({ examined: 1, ok: true });
  });

  it('accepts a source-legitimate LEADING SPACE the byte pattern flags (8 of 9 live hits)', () => {
    const src = doc('<para id="p1">Heat of<emphasis effect="italics"> fusion</emphasis>.</para>');
    const seg = '<!-- SEG:m1:para:p1 -->\nHeat of[[i: fusion]].\n';
    const r = checkBracketBodies(src, seg);
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
  });

  it('catches a swallow with NO leading space, which the byte pattern cannot see', () => {
    // The m68710 shape: the body ran past </emphasis> and took following prose.
    const src = doc(
      '<para id="p1"><emphasis effect="italics">is</emphasis> the reductant, HCl(g)</para>'
    );
    const seg = '<!-- SEG:m1:para:p1 -->\n[[i:is the reductant, HCl(g]]\n';
    const r = checkBracketBodies(src, seg);
    expect(r.ok).toBe(false);
    expect(r.findings[0]).toMatchObject({
      segId: 'm1:para:p1',
      type: 'i',
      body: 'is the reductant, HCl(g',
    });
  });

  it('catches a self-closing-element swallow (the m68733 [[i: 3d;]] shape)', () => {
    const src = doc('<para id="p1">Config <emphasis effect="italics"/> 3d;</para>');
    const seg = '<!-- SEG:m1:para:p1 -->\nConfig [[i: 3d;]]\n';
    expect(checkBracketBodies(src, seg).ok).toBe(false);
  });

  it('maps sub, sup and term to their own source elements', () => {
    const src = doc('<para id="p1">H<sub>2</sub>O<sup>+</sup> is a <term>cation</term>.</para>');
    const seg = '<!-- SEG:m1:para:p1 -->\nH[[sub:2]]O[[sup:+]] is a [[term:cation|t1]].\n';
    expect(checkBracketBodies(src, seg).ok).toBe(true);
  });

  it('ignores opaque markers that have no source text (MATH, TABLE, MEDIA, xref, link)', () => {
    const src = doc('<para id="p1">See <link document="m1">it</link>.</para>');
    const seg =
      '<!-- SEG:m1:para:p1 -->\n[[MATH:1]] [[TABLE:2]] [[MEDIA:3]] [[xref:x|1]] See [[link:it|m1]].\n';
    expect(checkBracketBodies(src, seg)).toMatchObject({ ok: true });
  });

  it('reports the examined count even when clean, so a pass is not vacuous', () => {
    expect(checkBracketBodies(doc('<para id="p1">plain</para>'), '')).toMatchObject({
      examined: 0,
      ok: true,
    });
  });

  it('finds source text in <glossary>, which lives OUTSIDE <content>', () => {
    // ⚠️ REGRESSION GUARD for the plan's own first draft, which scoped the source
    // scan to <content>. Measured: that made 763 glossary-def + 763 glossary-term
    // segments' markers unmatchable and drove the corpus firing rate from 1.3% to
    // 10.1%. This fixture is m68768's real shape, reduced.
    const src =
      '<document><content><para id="p1">body</para></content>' +
      '<glossary><definition id="d1"><term>freezing point</term>' +
      '<meaning id="m1">see also <emphasis effect="italics">melting point</emphasis></meaning>' +
      '</definition></glossary></document>';
    const seg = '<!-- SEG:m1:glossary-def:d1 -->\nsee also [[i:melting point]]\n';
    expect(checkBracketBodies(src, seg)).toMatchObject({ examined: 1, ok: true });
  });

  it('examines EVERY occurrence of a duplicated seg-id, not just the first', () => {
    // ⚠️ REGRESSION GUARD. An earlier draft iterated `parseSegmentsMap`, which
    // defaults to duplicates:'first'. Measured on the real corpus, that missed a
    // genuine swallow: m68710 carries the SAME bad body in two occurrences and the
    // deduped form reported only one. This is the same defect class that had to be
    // fixed in checkAltCoverage (Task 5) and bracketMarkerDeltaBySegment (Task 6) —
    // three checks in one plan, all from the same helper's default.
    const src = doc('<para id="p1"><emphasis effect="italics">atom</emphasis> is small.</para>');
    const seg =
      '<!-- SEG:m1:para:p1 -->\n[[i:atom]] is small.\n\n' +
      '<!-- SEG:m1:para:p1 -->\n[[i:atom is small]]\n';
    const r = checkBracketBodies(src, seg);
    expect(r.examined).toBe(2); // one marker per occurrence, not one total
    expect(r.findings).toEqual([
      expect.objectContaining({ segId: 'm1:para:p1', body: 'atom is small' }),
    ]);
  });

  it('exports the type -> source element map so drift is visible', () => {
    expect(BODY_SOURCE_ELEMENTS.i).toContain('emphasis');
    expect(BODY_SOURCE_ELEMENTS.sub).toContain('sub');
  });
});
