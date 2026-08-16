import { describe, it, expect } from 'vitest';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

/**
 * §C89 — a TRANSLATED alt must reach the injected output.
 *
 * ⚠️ WHY A COUNT-BASED CHECK CANNOT REPLACE THIS, and it is the whole point of the
 * file. When the injector drops a translation it leaves the ENGLISH alt in place,
 * so the attribute is still there and every count still reconciles. §C82 Plan A's
 * round-trip check, `cnxml-extract-alt-corpus` and E5's coverage check were all
 * green across the corpus while 627 of 951 chemistry alt translations (65.9%) were
 * being discarded. **Counting attributes cannot see this; only comparing VALUES can.**
 *
 * The method is a sentinel: put a value in the segment map that could not have come
 * from the source, then look for it in the output. `toBe` on the real string would
 * pass by accident if the injector happened to copy the English through and the
 * English matched — a sentinel removes that possibility by construction.
 */
const doc = (inner) =>
  `<document xmlns="http://cnx.rice.edu/cnxml" id="m1"><title>T</title><content>${inner}</content></document>`;

/** Extract, replace every alt segment's text with `sentinel`, inject, return the CNXML. */
function injectWithAltSentinel(source, sentinel) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(source);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  let altSegments = 0;
  for (const [key] of parsed) {
    if (String(key).split(':')[1] !== 'alt') continue;
    parsed.set(key, sentinel);
    altSegments++;
  }
  const { cnxml } = buildCnxml(structure, parsed, equations, source, {}, inlineAttrs);
  return { cnxml, altSegments };
}

describe('§C89 — a translated alt survives injection', () => {
  const SENTINEL = 'ÞÝDD-MYNDALÝSING';

  it('an id-bearing figure carries the translated alt, not the English one', () => {
    const source = doc(
      '<figure id="f1"><media id="md1" alt="a diagram of an atom">' +
        '<image src="a.png" mime-type="image/png"/></media></figure>'
    );
    const { cnxml, altSegments } = injectWithAltSentinel(source, SENTINEL);

    // Guard: if extraction stopped emitting an alt segment, the assertions below
    // would pass or fail for an unrelated reason. An absence is not an answer.
    expect(altSegments, 'extraction must emit exactly one alt segment for this shape').toBe(1);

    expect(cnxml).toContain(SENTINEL);
    expect(cnxml).not.toContain('a diagram of an atom');
  });

  it('an ID-LESS media inside a figure carries it — organic is mostly this shape', () => {
    // Measured 2026-08-16: 243 of organic's 1,918 alt translations (12.7%, 110
    // modules) are on media with NO id. §C89's first cut keyed its lookup on the
    // media id and so skipped every one of them. Chemistry hid this — its media
    // are id-bearing almost everywhere — which is why the second book is not
    // decoration: it is the only place this shape appears at scale.
    const source = doc(
      '<figure id="f5"><media alt="an id-less diagram">' +
        '<image src="g.png" mime-type="image/png"/></media></figure>'
    );
    const { cnxml, altSegments } = injectWithAltSentinel(source, SENTINEL);

    expect(altSegments).toBe(1);
    expect(cnxml).toContain(SENTINEL);
    expect(cnxml).not.toContain('an id-less diagram');
  });

  it('a figure inside a <note> carries it — notes are rebuilt by a different builder', () => {
    // buildFigure returns null for these (ctx.figuresHandledInNotes), so the figure
    // is emitted by buildNoteDom from preserved CNXML instead. Measured 2026-08-16:
    // this position accounts for 83 of the 117 translations still dropped after the
    // buildFigure fix — the single largest remainder.
    const source = doc(
      '<note id="n1" type="note"><para id="np1">Athugið.</para>' +
        '<figure id="f3"><media id="md3" alt="a note diagram">' +
        '<image src="c.png" mime-type="image/png"/></media></figure></note>'
    );
    const { cnxml, altSegments } = injectWithAltSentinel(source, SENTINEL);

    expect(altSegments).toBe(1);
    expect(cnxml).toContain(SENTINEL);
    expect(cnxml).not.toContain('a note diagram');
  });

  it('a figure inside an <example> carries it', () => {
    // Same class as the note case, via buildExampleDom: 32 of the 117.
    const source = doc(
      '<example id="e1"><para id="ep1">Dæmi.</para>' +
        '<figure id="f4"><media id="md4" alt="an example diagram">' +
        '<image src="d.png" mime-type="image/png"/></media></figure></example>'
    );
    const { cnxml, altSegments } = injectWithAltSentinel(source, SENTINEL);

    expect(altSegments).toBe(1);
    expect(cnxml).toContain(SENTINEL);
    expect(cnxml).not.toContain('an example diagram');
  });

  it('a bare media inside a container list item — SECOND POSITIVE CONTROL, does not discriminate', () => {
    // ⚠️⚠️ THIS PASSED BEFORE §C89's FIX AND AFTER IT. It was written to reproduce
    // the corpus's last holdout (m68801: `media < item < list < example`) and it
    // DOES NOT — measured. Both this fixture and the real module put the alt in
    // `structure.inlineMedia`, but this one is rebuilt through the inline-media
    // placeholder path, which already wrote translated alt; the real module's
    // example is preserved verbatim instead, so the placeholder never expands.
    //
    // Kept, clearly labelled, rather than deleted — it is a genuine positive control
    // for the inline path, and it is the same trap §C81 and §C82 both recorded: a
    // reduced fixture does not reproduce the corpus shape that triggers the failure.
    // ▶ The real discrimination for that shape lives in the corpus pin below.
    const source = doc(
      '<example id="e2"><list id="l1"><item>Sjá ' +
        '<media id="md5" alt="a bare container picture">' +
        '<image src="e.png" mime-type="image/png"/></media></item></list></example>'
    );
    const { cnxml, altSegments } = injectWithAltSentinel(source, SENTINEL);

    expect(altSegments).toBe(1);
    expect(cnxml).toContain(SENTINEL);
  });

  it('a bare media in a para carries it too — the positive control', () => {
    // This position ALREADY worked before §C89. It is asserted here so a future
    // change that breaks everything equally cannot look like a pass: if this one
    // ever goes red, the failure is in the harness, not in the figure path.
    const source = doc(
      '<para id="p1">Sjá <media id="md2" alt="an inline picture">' +
        '<image src="b.png" mime-type="image/png"/></media> hér.</para>'
    );
    const { cnxml, altSegments } = injectWithAltSentinel(source, SENTINEL);

    expect(altSegments).toBe(1);
    expect(cnxml).toContain(SENTINEL);
  });
});
