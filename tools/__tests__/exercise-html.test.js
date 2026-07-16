/**
 * exercise-html.test.js — item 9 (D3): reversible HTML⇄segments converter for
 * os-embed exercise fields. The round-trip law (fieldToHtml(htmlToField(h)) === h,
 * byte-identical) is the load-bearing property: it is what makes the skeleton
 * sidecar a safe place to park untranslatable structure while text rides the
 * MT pipeline as bracket-marker segments.
 */

import { describe, it, expect } from 'vitest';
import { htmlToField, fieldToHtml, UnknownTagError, MarkerError } from '../lib/exercise-html.js';

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
