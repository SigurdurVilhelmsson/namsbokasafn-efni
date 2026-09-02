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
    const r = checkBracketBodies(src, seg);
    expect(r.ok).toBe(true);
    // Review round 2: this used to pass VACUOUSLY — [[term:cation|t1]]'s `|t1`
    // payload made it unmatchable (round 1's `skippedNested`), so `ok:true` held
    // for the wrong reason (never examined, never compared). Now genuinely
    // examined and genuinely matched: sub + sup + term = 3, not 2.
    expect(r.examined).toBe(3);
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

  // ⚠️ REGRESSION GUARD — review round 1, finding 1; field renamed round 2,
  // finding ②. The body regex `[^\[\]|]*` refuses `[`, so a marker nested
  // inside another marker does not partially match at a shorter body: the
  // OUTER marker fails to match at all and is invisible to `examined`/
  // `findings`, no matter what its true content is. Measured on the real
  // corpus: 319 of 5,993 `i`-opens alone (5.32%, in 25 of 149 modules);
  // m68733 loses 40 of its own 330. `skippedUnmatchable` reports the gap so
  // `examined` is never mistaken for the true marker population — same idiom
  // as `checkAltCoverage`'s `unreachable` in extraction-coverage.js. This
  // nesting case is UNCHANGED by round 2's payload fix below — nesting and
  // trailing-payload are two different mechanisms hitting the same wall, and
  // only the payload one was fixed.
  it('counts a nested marker as skipped, not examined — the outer marker cannot match at all', () => {
    // [[i:m[[sub:l]]]] <- <emphasis effect="italics">m<sub>l</sub></emphasis>,
    // common in chemistry for quantum-number notation (e.g. "2s" with a
    // subscripted level). Only the inner [[sub:l]] is ever attempted.
    const src = doc('<para id="p1"><emphasis effect="italics">m<sub>l</sub></emphasis></para>');
    const seg = '<!-- SEG:m1:para:p1 -->\n[[i:m[[sub:l]]]]\n';
    const r = checkBracketBodies(src, seg);
    expect(r.examined).toBe(1); // only the inner [[sub:l]] is ever matched
    expect(r.skippedUnmatchable).toBe(1); // the outer [[i:...]] opener: uncounted, unexaminable
    expect(r.findings).toEqual([]); // neither flagged nor cleared — simply invisible
  });

  // ⚠️ CORRECTED — review round 2, finding ①. Round 1 found `term`/`em` were
  // 100% unreachable (every id-bearing term carries a trailing `|id` payload,
  // every em a `|class` payload — cnxml-extract.js never emits a class-less
  // em) and reported it via `skippedUnmatchable`, deliberately NOT fixing the
  // matching algorithm. This round widens the body regex to
  // `[^\[\]|]*(?:\|[^\[\]]*)?\]\]` — an optional, uncaptured payload group —
  // so `term`/`em` bodies are now genuinely compared against source instead of
  // silently invisible. Measured corpus-wide: this makes `term`/`em` fully
  // reachable (59/61 — CORRECTED 2026-08-16 from "61/61"; 1/1 for em) while `examined`+60, `skippedUnmatchable`-60,
  // findings UNCHANGED at 3, firing set UNCHANGED at {m68710, m68733}.
  it('now EXAMINES an id-bearing term marker instead of skipping it, and matches it against source', () => {
    const src = doc('<para id="p1">a <term>cation</term> ion.</para>');
    const seg = '<!-- SEG:m1:para:p1 -->\na [[term:cation|t1]] ion.\n';
    const r = checkBracketBodies(src, seg);
    expect(r.examined).toBe(1);
    expect(r.skippedUnmatchable).toBe(0);
    expect(r.findings).toEqual([]); // 'cation' matches <term>cation</term> — a true clean pass, not a vacuous one
  });

  it('now EXAMINES an em marker instead of skipping it (em always carries a |class payload)', () => {
    const src = doc(
      '<para id="p1">a <emphasis class="chem-highlight">salt</emphasis> forms.</para>'
    );
    const seg = '<!-- SEG:m1:para:p1 -->\na [[em:salt|chem-highlight]] forms.\n';
    const r = checkBracketBodies(src, seg);
    expect(r.examined).toBe(1);
    expect(r.skippedUnmatchable).toBe(0);
    expect(r.findings).toEqual([]);
  });

  it('still catches a genuine swallow in a payload-bearing term marker — the fix compares, it does not whitelist', () => {
    // If the pre-pipe body doesn't match any <term> text, it must still flag —
    // widening the regex to REACH term bodies must not also widen tolerance.
    const src = doc('<para id="p1">a <term>cation</term> ion.</para>');
    const seg = '<!-- SEG:m1:para:p1 -->\na [[term:cation extra swallowed text|t1]] ion.\n';
    const r = checkBracketBodies(src, seg);
    expect(r.examined).toBe(1);
    expect(r.skippedUnmatchable).toBe(0);
    expect(r.findings).toEqual([
      expect.objectContaining({ type: 'term', body: 'cation extra swallowed text' }),
    ]);
  });

  // ── §C118 ⑭ — `span` joins BODY_SOURCE_ELEMENTS ───────────────────────────
  // The MECHANISM is pinned here, deliberately, and NOT as a corpus total in
  // bracket-body-corpus.test.js: organic's committed 02-for-mt is mixed vintage
  // (only ch03 post-dates the span fix — 31 markers, against 1,071 after a full
  // re-extract), so any all-organic number pinned today dies on that re-extract.
  // The three shapes below are stable under it.

  it('span: accepts a plain-text body that matches its source <span>', () => {
    // The §C118 reader-visible shape: organic's reaction colouring.
    const src = doc('<para id="p1">(<span class="magenta-text">X</span>=F, Cl, Br, I)</para>');
    const seg = '<!-- SEG:m1:para:p1 -->\n([[span:X|magenta-text]]=F, Cl, Br, I)\n';
    const r = checkBracketBodies(src, seg);
    expect(r.examined).toBe(1);
    expect(r.skippedUnmatchable).toBe(0);
    expect(r.findings).toEqual([]);
  });

  it('span: CATCHES a swallow — the fix compares bodies, it does not whitelist the type', () => {
    // 🔴 THE POSITIVE CONTROL FOR THE WHOLE TYPE. Corpus findings are 0 of 1,071
    // (a saturated rate — a category, not a result), so without this the type's
    // clean corpus pass is self-evidencing and proves nothing. Same source as the
    // test above; only the body is widened past </span> to take following prose.
    const src = doc('<para id="p1">(<span class="magenta-text">X</span>=F, Cl, Br, I)</para>');
    const seg = '<!-- SEG:m1:para:p1 -->\n([[span:X=F|magenta-text]], Cl, Br, I)\n';
    const r = checkBracketBodies(src, seg);
    expect(r.ok).toBe(false);
    expect(r.findings).toEqual([
      expect.objectContaining({ segId: 'm1:para:p1', type: 'span', body: 'X=F' }),
    ]);
  });

  it('span: a markup-wrapping span is SKIPPED, not reported as a swallow', () => {
    // 101 of the 1,071 class-bearing spans in organic wrap other markup, so their
    // body reads `1[[i:s]]` — the body class `[^\[\]|]*` refuses `[`, so the span
    // opener cannot match at all. That must land in skippedUnmatchable (an honest
    // blind spot, same as nesting) and NOT in findings, or E2 halts a paid run on
    // 101 false positives. The inner [[i:s]] is still examined normally.
    const src = doc(
      '<para id="p1">a <span class="magenta-text">1<emphasis effect="italics">s</emphasis></span> orbital.</para>'
    );
    const seg = '<!-- SEG:m1:para:p1 -->\na [[span:1[[i:s]]|magenta-text]] orbital.\n';
    const r = checkBracketBodies(src, seg);
    expect(r.examined).toBe(1); // the inner [[i:s]]
    expect(r.skippedUnmatchable).toBe(1); // the [[span: opener
    expect(r.findings).toEqual([]);
  });

  it('span: a span nested INSIDE an emphasis is examined (the dominant corpus shape)', () => {
    // 559 of the 1,071 have an <emphasis> parent — the single commonest shape, and
    // it inverts the case above: the OUTER [[i: is the unmatchable one and the span
    // is what gets compared.
    //
    // ⚠️ WHAT THIS TEST DOES NOT COVER, STATED BECAUSE AN EARLIER DRAFT CLAIMED IT DID.
    // This comment used to read "extraction order makes this so (spans convert last),
    // so this test also fails if that order is ever swapped". BOTH HALVES ARE FALSE.
    // The fixture below is a hand-written string pair fed straight to
    // checkBracketBodies; this file never imports the extractor, so no change to
    // cnxml-extract.js can move it by one byte — a guard that is never called is not
    // a guard. And the premise is wrong anyway: measured on all three span fixtures in
    // this file, running the emphasis and span replaces in EITHER order yields
    // byte-identical output, because neither pass creates or destroys the other's
    // anchors. What this test actually pins is the CHECK's behaviour on the nested
    // shape — span examined, outer marker counted as unmatchable — and that is all.
    const src = doc(
      '<para id="p1"><emphasis effect="italics"><span class="red-text">Nu</span></emphasis></para>'
    );
    const seg = '<!-- SEG:m1:para:p1 -->\n[[i:[[span:Nu|red-text]]]]\n';
    const r = checkBracketBodies(src, seg);
    expect(r.examined).toBe(1); // the [[span:
    expect(r.skippedUnmatchable).toBe(1); // the outer [[i:
    expect(r.findings).toEqual([]);
  });

  it('span is in the type table, and the table still refuses opaque types', () => {
    // Guards the edit itself: `span` present, and the opaque/id-reference types
    // still absent, so a future "add every type" sweep cannot pass silently.
    expect(BODY_SOURCE_ELEMENTS.span).toEqual(['span']);
    for (const opaque of ['MATH', 'MEDIA', 'TABLE', 'xref', 'docref', 'link', 'fn']) {
      expect(BODY_SOURCE_ELEMENTS[opaque], `${opaque} must stay out of the table`).toBeUndefined();
    }
  });
});
