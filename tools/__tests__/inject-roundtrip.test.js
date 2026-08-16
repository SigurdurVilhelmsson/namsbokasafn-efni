import { describe, it, expect } from 'vitest';
import { roundTripAltCount } from '../lib/inject-roundtrip.js';

const doc = (inner) =>
  `<document xmlns="http://cnx.rice.edu/cnxml" id="m1"><title>T</title><content>${inner}</content></document>`;

describe('roundTripAltCount — alt survives extract -> inject', () => {
  it('a figure-wrapped media keeps its alt through the round trip', () => {
    const r = roundTripAltCount(
      doc(
        '<figure id="f1"><media alt="mynd af frumeind"><image src="a.png" mime-type="image/png"/></media></figure>'
      )
    );
    expect(r.rawAlt).toBe(1);
    expect(r.outAlt).toBe(1);
    expect(r.ok).toBe(true);
  });

  it('counts several alts across several figures', () => {
    const r = roundTripAltCount(
      doc(
        '<figure id="f1"><media alt="ein"><image src="a.png" mime-type="image/png"/></media></figure>' +
          '<figure id="f2"><media alt="tvö"><image src="b.png" mime-type="image/png"/></media></figure>'
      )
    );
    expect(r.rawAlt).toBe(2);
    expect(r.outAlt).toBe(2);
  });

  it('a module with no alt round-trips as 0 == 0, and says so', () => {
    const r = roundTripAltCount(doc('<para id="p1">engar myndir</para>'));
    expect(r).toEqual({ rawAlt: 0, outAlt: 0, ok: true });
  });

  it('the m66449 shape — two subfigures — keeps BOTH alts', () => {
    // The §C81 review-round-2 finding: processFigure's media regex is non-global
    // and only reaches the first <media>. Both must survive.
    const r = roundTripAltCount(
      doc(
        '<note id="n1"><para id="p1"><figure id="f1">' +
          '<subfigure id="sf1"><media alt="fyrri"><image src="a.png" mime-type="image/png"/></media></subfigure>' +
          '<subfigure id="sf2"><media alt="seinni"><image src="b.png" mime-type="image/png"/></media></subfigure>' +
          '</figure></para></note>'
      )
    );
    expect(r.rawAlt).toBe(2);
    expect(r.outAlt).toBe(2);
    expect(r.ok).toBe(true);
  });

  it('the m42296 shape — figure in a list item in an exercise problem — pins current behaviour', () => {
    // ⚠️⚠️ THIS SYNTHETIC DOES **NOT** DISCRIMINATE. Measured 2026-08-16 against the
    // broken vintage 07167ac7: it yields rawAlt 1 / outAlt 1 and PASSES. At HEAD it
    // yields rawAlt 1 / outAlt 2. So neither `=== 1` (which an earlier draft of this
    // plan asserted, and which would have failed against CORRECT code) nor `>= rawAlt`
    // separates fixed from broken.
    //
    // This is the identical trap §C81 round 3 caught in its own fixture — "confirmed to
    // discriminate by reasoning" was wrong there too. A reduced fixture does not
    // reproduce the corpus shape that triggers the suppression.
    //
    // Kept only as a behaviour pin: outAlt 2 records that this shape DUPLICATES today
    // (the same class as organic's m00023/m00046/m00069, logged to the register).
    // ▶ The real discrimination lives in the `regression fixtures` block below, on real
    // corpus modules. Do not treat this case as evidence of anything else.
    const r = roundTripAltCount(
      doc(
        '<exercise id="e1"><problem id="pr1"><list id="l1"><item id="i1">' +
          '<figure id="f1"><media alt="mynd"><image src="a.png" mime-type="image/png"/></media></figure>' +
          '</item></list></problem></exercise>'
      )
    );
    expect(r.rawAlt).toBe(1);
    expect(r.outAlt).toBe(2);
    // ⚠️ The ONLY `ok === false` in this file, added 2026-08-16. Every other case here
    // asserts `ok: true` or omits it, so before this line a hardcoded `ok: true` passed
    // the whole suite. `ok` is what the §C82 loop gates on — pin it in both directions.
    expect(r.ok).toBe(false);
  });
});
