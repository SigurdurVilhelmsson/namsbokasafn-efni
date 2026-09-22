/**
 * exercise-html.test.js — item 9 (D3): reversible HTML⇄segments converter for
 * os-embed exercise fields. The round-trip law (fieldToHtml(htmlToField(h)) === h,
 * byte-identical) is the load-bearing property: it is what makes the skeleton
 * sidecar a safe place to park untranslatable structure while text rides the
 * MT pipeline as bracket-marker segments.
 */

import { describe, it, expect } from 'vitest';
import {
  htmlToField,
  fieldToHtml,
  fieldImgAlts,
  withImgAlt,
  UnknownTagError,
  MarkerError,
} from '../lib/exercise-html.js';

const roundTrip = (h) => fieldToHtml(htmlToField(h));

describe('htmlToField — text runs and markers', () => {
  it('bare text is a single run with an empty skeleton slot', () => {
    const f = htmlToField('What is the hybridization of carbon?');
    expect(f.runs).toEqual(['What is the hybridization of carbon?']);
    expect(f.skeleton).toBe('\x00SLOT_0\x00');
  });

  it('naked inline tags map to bracket markers, nested included', () => {
    // Real corpus shape: <b>p<i>K</i><sub>1</sub></b> (table header)
    const f = htmlToField('<b>p<i>K</i><sub>1</sub></b>');
    expect(f.runs).toEqual(['[[b:p[[i:K]][[sub:1]]]]']);
  });

  it('sub/sup map to [[sub:]]/[[sup:]]', () => {
    const f = htmlToField('H<sub>2</sub>O and Ca<sup>2+</sup>');
    expect(f.runs).toEqual(['H[[sub:2]]O and Ca[[sup:2+]]']);
  });

  it('img becomes an opaque [[MEDIA:n]] with the literal tag preserved', () => {
    const img =
      '<img class="scaled-down" src="https://exercises.openstax.org/x/y.jpg" alt="A structure">';
    const f = htmlToField(`Before ${img} after`);
    expect(f.runs).toEqual(['Before [[MEDIA:0]] after']);
    expect(f.opaques[0]).toBe(img);
  });

  it('empty span (data-math) becomes an opaque [[MEDIA:n]], byte-exact', () => {
    // Real corpus shape: H<sub>2</sub>C<span data-math="\\text{═}"></span>CHCO<sub>2</sub>Et
    const h = 'H<sub>2</sub>C<span data-math="\\text{═}"></span>CHCO<sub>2</sub>Et';
    const f = htmlToField(h);
    expect(f.runs[0]).toBe('H[[sub:2]]C[[MEDIA:0]]CHCO[[sub:2]]Et');
    expect(f.opaques[0]).toBe('<span data-math="\\text{═}"></span>');
  });

  it('text-bearing span/small become wrap-anchored [[em:text|n]]', () => {
    const f = htmlToField('<span class="magenta-text">1</span> and <small>note</small>');
    expect(f.runs).toEqual(['[[em:1|0]] and [[em:note|1]]']);
    expect(f.wraps[0]).toEqual({ open: '<span class="magenta-text">', close: '</span>' });
    expect(f.wraps[1]).toEqual({ open: '<small>', close: '</small>' });
  });

  it('attr-bearing i/b fall back to wrap-anchored (byte-exact inversion)', () => {
    const f = htmlToField('<i class="x">t</i>');
    expect(f.runs).toEqual(['[[em:t|0]]']);
    expect(f.wraps[0]).toEqual({ open: '<i class="x">', close: '</i>' });
  });

  it('block structure goes to the skeleton; runs hold only text', () => {
    const h = '<p>First</p>\n<p style="text-align: center">Second</p>';
    const f = htmlToField(h);
    expect(f.runs).toEqual(['First', 'Second']);
    expect(f.skeleton).toBe(
      '<p>\x00SLOT_0\x00</p>\n<p style="text-align: center">\x00SLOT_1\x00</p>'
    );
  });

  it('run leading/trailing whitespace is hoisted into the skeleton', () => {
    const f = htmlToField('<li>\n  item text\n</li>');
    expect(f.runs).toEqual(['item text']);
    expect(f.skeleton).toBe('<li>\n  \x00SLOT_0\x00\n</li>');
  });

  it('entities pass through verbatim (no decode)', () => {
    const f = htmlToField('<p>A &gt; B &nbsp; C&lt;D</p>');
    expect(f.runs).toEqual(['A &gt; B &nbsp; C&lt;D']);
  });

  it('throws UnknownTagError on tags outside the closed inventory', () => {
    expect(() => htmlToField('<p><blockquote>x</blockquote></p>')).toThrow(UnknownTagError);
    try {
      htmlToField('<blockquote>x</blockquote>');
    } catch (e) {
      expect(e.tag).toBe('blockquote');
    }
  });

  it('throws on an unclosed inline tag', () => {
    expect(() => htmlToField('<i>never closed')).toThrow(UnknownTagError);
  });
});

describe('fieldToHtml — inversion and the round-trip law', () => {
  const CASES = [
    'plain text',
    '<b>p<i>K</i><sub>1</sub></b>',
    'H<sub>2</sub>C<span data-math="\\text{═}"></span>CHCO<sub>2</sub>Et',
    '<p>Some p<i>K</i><sub>a</sub> data.</p>\n<table class="unnumbered">\n<tbody><tr>\n<th><b>Name</b></th>\n<th><b>p<i>K</i><sub>1</sub></b></th>\n</tr>\n<tr>\n<td>Oxalic</td>\n<td>1.2</td>\n</tr>\n</tbody></table>',
    '<p>Compound <b>D</b>:</p>\n<ul style="list-style-type:none">\n<li><sup>13</sup>C NMR: 9.7 <i>δ</i></li>\n</ul>',
    '<figure id="fig-00202"><img src="https://x.test/a.jpg" alt="A molecule"></figure>',
    'A &gt; B<br>C &nbsp; <span class="magenta-text">2</span>',
    // Corpus sweep find (item 9 T7): literal '[' immediately before an inline
    // tag collides with the [[i:...]] marker delimiter — "[<i>α</i>]" became
    // "[[[i:α]]]" and broke re-parsing. Real corpus shape (05-03-OC-P06).
    'Calculate [<i>α</i>]<sub>D</sub> for coniine.',
    // Two adjacent bracketed inline runs (real corpus shape, 30-07-OC-P07).
    'order [<i>x</i>,<i>y</i>], and tell whether',
    // Literal brackets with no adjacent markup at all must also survive.
    'An antarafacial [1,7] sigmatropic rearrangement',
    // Final review m3 (promoted from an ad-hoc probe to a committed test):
    // same-tag nesting — matchClose's depth counter must not mistake the
    // inner </i> for the outer's close.
    '<i>a<i>b</i>c</i>',
    // Final review m3: a literal '|' inside a wrap-anchored span's text must
    // not be mistaken for the `|n` wrap-id anchor — invertRun's
    // `/^([\s\S]*)\|(\d+)$/` only anchors on the LAST pipe-digits-at-end.
    '<span class="x">a|b|3</span>',
  ];
  for (const h of CASES) {
    it(`round-trips: ${h.slice(0, 40)}…`, () => {
      expect(roundTrip(h)).toBe(h);
    });
  }

  it('re-slots translated runs (structure kept, text replaced)', () => {
    const f = htmlToField('<p>Oxygen</p><p>Nitrogen</p>');
    expect(fieldToHtml(f, ['Súrefni', 'Nitur'])).toBe('<p>Súrefni</p><p>Nitur</p>');
  });

  it('inverts translated markers inside a translated run', () => {
    const f = htmlToField('H<sub>2</sub>O is <i>water</i>');
    expect(fieldToHtml(f, ['H[[sub:2]]O er [[i:vatn]]'])).toBe('H<sub>2</sub>O er <i>vatn</i>');
  });

  it('throws MarkerError on run-count mismatch', () => {
    const f = htmlToField('<p>a</p><p>b</p>');
    expect(() => fieldToHtml(f, ['only one'])).toThrow(MarkerError);
  });

  it('throws MarkerError on an unknown MEDIA id (translation corrupted the digits)', () => {
    const f = htmlToField('x <img src="https://x.test/a.jpg"> y');
    expect(() => fieldToHtml(f, ['x [[MEDIA:7]] y'])).toThrow(MarkerError);
  });

  it('throws MarkerError on a stray [[ left in a translated run', () => {
    const f = htmlToField('plain');
    expect(() => fieldToHtml(f, ['broken [[i:unterminated'])).toThrow(MarkerError);
  });
});

// §C126 #3 / §C123 — an <img> is an opaque literal, so its alt never reached a
// segment and shipped in English. These two helpers are the ONE predicate both
// exercise-extract (emit) and exercise-assemble (write back) use, so the two
// sides cannot disagree about which images carry an alt segment.
describe('fieldImgAlts — which opaque images carry a translatable alt', () => {
  const img = (alt) => `<img src="https://exercises.openstax.org/x/y.jpg" alt="${alt}">`;

  it('yields the alt of an <img> opaque, keyed by its opaque index', () => {
    const f = htmlToField(`Before ${img('A structure')} after`);
    expect(fieldImgAlts(f)).toEqual([{ n: '0', lead: '', core: 'A structure', trail: '' }]);
  });

  it('keys on the SAME index as the [[MEDIA:n]] it belongs to, skipping non-img opaques', () => {
    // data-math span takes opaque 0, so the image is opaque 1.
    const f = htmlToField(`<span data-math="x"></span> and ${img('The figure')}`);
    expect(f.runs).toEqual(['[[MEDIA:0]] and [[MEDIA:1]]']);
    expect(fieldImgAlts(f).map((a) => a.n)).toEqual(['1']);
  });

  it('orders by numeric index, not string order (10 after 9)', () => {
    const imgs = Array.from({ length: 11 }, (_, i) => img(`alt ${i}`)).join(' ');
    const f = htmlToField(imgs);
    expect(fieldImgAlts(f).map((a) => a.n)).toEqual(
      Array.from({ length: 11 }, (_, i) => String(i))
    );
  });

  it('emits nothing for a blank or whitespace-only alt', () => {
    const f = htmlToField(`${img('')} ${img('   ')}`);
    expect(fieldImgAlts(f)).toEqual([]);
  });

  it('emits nothing for an <img> with no alt attribute', () => {
    const f = htmlToField('<img src="https://exercises.openstax.org/x/y.jpg">');
    expect(fieldImgAlts(f)).toEqual([]);
  });

  it('hoists edge whitespace out of the core (26 corpus alts carry it)', () => {
    const f = htmlToField(img('  Structure of X. '));
    expect(fieldImgAlts(f)).toEqual([{ n: '0', lead: '  ', core: 'Structure of X.', trail: ' ' }]);
  });

  it('does not mistake data-alt for alt', () => {
    const f = htmlToField('<img data-alt="decoy" src="https://exercises.openstax.org/x/y.jpg">');
    expect(fieldImgAlts(f)).toEqual([]);
  });

  it('does not read an alt= that sits INSIDE another attribute value', () => {
    const f = htmlToField('<img title="see alt=" src="https://exercises.openstax.org/x/y.jpg">');
    expect(fieldImgAlts(f)).toEqual([]);
  });

  it('throws on an alt form outside the verified inventory (single-quoted)', () => {
    // All 2,380 corpus alts are double-quoted; a refresh that changes that must
    // surface, never silently skip (the module's closed-inventory contract).
    const f = htmlToField('<img src="https://exercises.openstax.org/x/y.jpg" alt=\'x\'>');
    expect(() => fieldImgAlts(f)).toThrow(MarkerError);
  });
});

describe('withImgAlt — writing a translated alt back into its literal', () => {
  const lit = '<img class="c" src="https://exercises.openstax.org/x/y.jpg" alt="A structure">';

  it('replaces the alt value and leaves every other byte of the tag alone', () => {
    expect(withImgAlt(lit, 'Bygging')).toBe(
      '<img class="c" src="https://exercises.openstax.org/x/y.jpg" alt="Bygging">'
    );
  });

  it('is the identity when handed the source core (round-trip law for alts)', () => {
    const [a] = fieldImgAlts(htmlToField(lit));
    expect(withImgAlt(lit, a.core)).toBe(lit);
  });

  it('keeps the source edge whitespace around the translated core', () => {
    const padded = '<img src="s.jpg" alt="  Structure of X. ">';
    expect(withImgAlt(padded, 'Bygging X.')).toBe('<img src="s.jpg" alt="  Bygging X. ">');
  });

  it('escapes & < > " in the translated value (& first — no &amp;quot;)', () => {
    // `x < y > z` is prose (no tag name after `<`), so it survives the markup
    // strip and must be escaped; `<C>` would be tag-shaped and stripped instead.
    expect(withImgAlt(lit, 'A & "B" x < y > z')).toContain(
      'alt="A &amp; &quot;B&quot; x &lt; y &gt; z"'
    );
  });

  it('strips any bracket marker or inline tag the MT invented (an alt cannot hold markup)', () => {
    expect(withImgAlt(lit, 'C [[sub:4]]H<sub>6</sub>')).toContain('alt="C 4H6"');
  });

  it('keeps literal IUPAC brackets, which are text, not markers', () => {
    expect(withImgAlt(lit, 'bísýkló[2.2.2]oktan')).toContain('alt="bísýkló[2.2.2]oktan"');
  });

  it('returns the literal unchanged when the translation is blank after stripping', () => {
    expect(withImgAlt(lit, '  [[i:]] ')).toBe(lit);
  });

  it('never invents an alt on an <img> that has none', () => {
    const bare = '<img src="s.jpg">';
    expect(withImgAlt(bare, 'Bygging')).toBe(bare);
  });
});
