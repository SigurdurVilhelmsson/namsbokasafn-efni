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

  // ⚠️ REGRESSION GUARD — review round 1, finding 1. The body regex
  // `[^\[\]|]*` refuses `[`, so a marker nested inside another marker does not
  // partially match at a shorter body: the OUTER marker fails to match at all
  // and is invisible to `examined`/`findings`, no matter what its true content
  // is. Measured on the real corpus: 319 of 5,993 `i`-opens alone (5.32%, in 25
  // of 149 modules); m68733 loses 40 of its own 330. `skippedNested` reports
  // the gap so `examined` is never mistaken for the true marker population —
  // same idiom as `checkAltCoverage`'s `unreachable` in extraction-coverage.js.
  // Deliberately NOT a fix to the matching algorithm (that would change what is
  // checked and move the pinned `examined`/`findings` numbers) — additive
  // reporting only.
  it('counts a nested marker as skipped, not examined — the outer marker cannot match at all', () => {
    // [[i:m[[sub:l]]]] <- <emphasis effect="italics">m<sub>l</sub></emphasis>,
    // common in chemistry for quantum-number notation (e.g. "2s" with a
    // subscripted level). Only the inner [[sub:l]] is ever attempted.
    const src = doc('<para id="p1"><emphasis effect="italics">m<sub>l</sub></emphasis></para>');
    const seg = '<!-- SEG:m1:para:p1 -->\n[[i:m[[sub:l]]]]\n';
    const r = checkBracketBodies(src, seg);
    expect(r.examined).toBe(1); // only the inner [[sub:l]] is ever matched
    expect(r.skippedNested).toBe(1); // the outer [[i:...]] opener: uncounted, unexaminable
    expect(r.findings).toEqual([]); // neither flagged nor cleared — simply invisible
  });

  // ⚠️ THE SAME BLIND SPOT, A DIFFERENT CAUSE — not disclosed by review round 1,
  // found while measuring its fix. An id-bearing `term` marker carries its id
  // as a trailing `|id` payload (`[[term:cation|t1]]`, cnxml-extract.js's own
  // documented B4/RC3 shape), and `em` markers ALWAYS carry a `|class` payload
  // (there is no class-less `em` — cnxml-extract.js falls back to `[[i:...]]`
  // when there is no class). `[^\[\]|]*` stops at the pipe and then requires
  // `]]` immediately — which never follows a `|id]]`/`|class]]` tail — so these
  // markers fail to match for the SAME structural reason as nesting, not merely
  // as an edge case: measured corpus-wide, term is 0 matched of 61 raw opens
  // (100%) and em is 0 of 1. `BODY_SOURCE_ELEMENTS.term`/`.em` currently never
  // fire in practice; `skippedNested` is the only signal that they exist at
  // all. Flagging for the controller — worth more than a passing mention.
  it('counts an id-bearing term marker as skipped too — its trailing |id payload is the SAME regex blind spot as nesting', () => {
    const src = doc('<para id="p1">a <term>cation</term> ion.</para>');
    const seg = '<!-- SEG:m1:para:p1 -->\na [[term:cation|t1]] ion.\n';
    const r = checkBracketBodies(src, seg);
    expect(r.examined).toBe(0);
    expect(r.skippedNested).toBe(1);
    expect(r.findings).toEqual([]);
  });
});
