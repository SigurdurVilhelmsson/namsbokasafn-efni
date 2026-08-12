import { describe, it, expect } from 'vitest';
import { extractInlineText } from '../cnxml-extract.js';

/**
 * §C58 — a self-closing `<emphasis effect="..."/>` must not be read as an OPENING tag.
 *
 * The emphasis regexes matched `<emphasis\s+effect="..."[^>]*>`, and `[^>]*` happily
 * matches the `/` of a self-closing tag. The capture then ran to the next `</emphasis>`
 * belonging to a DIFFERENT element, so:
 *   - bold was applied to a span it never covered,
 *   - the intervening emphasis element was destroyed (its marker never emitted),
 *   - sibling markers such as [[MATH:n]] were swallowed into the bold body.
 *
 * Measured 2026-08-12: 111 self-closing `<emphasis .../>` across 57 files in all five
 * books; `edlisfraedi-2e` ch04 m42075 is the worked example.
 *
 * The codebase already has the correct idiom for self-closing elements — `<newline\s*\/>`
 * and `<space([^>]*)\/>` — emphasis simply was not included.
 */
const extract = (cnxml) => extractInlineText(cnxml, new Map(), { math: 0, media: 0, table: 0 });

describe('§C58 self-closing <emphasis/> handling', () => {
  it('does not let a self-closing bold swallow the text that follows it', () => {
    // Fails if `[^>]*` matches the `/`, making `<emphasis effect="bold"/>` an opening tag.
    const out = extract(
      '<para>alpha <emphasis effect="bold"/> bravo <emphasis effect="italics">ital</emphasis> charlie</para>'
    );
    expect(out).not.toContain('[[b: bravo');
  });

  it('still emits the marker for a sibling emphasis element after a self-closing one', () => {
    // The intervening <emphasis effect="italics"> was previously consumed whole,
    // so its [[i:]] marker never reached the segment at all.
    const out = extract(
      '<para>alpha <emphasis effect="bold"/> bravo <emphasis effect="italics">ital</emphasis> charlie</para>'
    );
    expect(out).toContain('[[i:ital]]');
  });

  it('does not swallow a sibling marker into a bold body', () => {
    // The m42075 shape: a [[MATH:n]] placeholder ended up nested inside [[b:...]].
    const out = extract(
      '<para>x <emphasis effect="bold"/> symbol [[MATH:4]] y <emphasis effect="italics">z</emphasis></para>'
    );
    expect(out).not.toMatch(/\[\[b:[^\]]*\[\[MATH:4\]\]/);
  });

  it('emits no marker whose body begins with a space', () => {
    // The reader-facing symptom, and the shape a marker-integrity check would flag.
    const out = extract(
      '<para>alpha <emphasis effect="bold"/> bravo <emphasis effect="italics">ital</emphasis> charlie</para>'
    );
    expect(out).not.toMatch(/\[\[[A-Za-z]+: /);
  });

  // CONTROL — passes BEFORE the fix too, and is kept as one. The <sub>/<sup>
  // paths carry their own copies of the same regex and run FIRST
  // (cnxml-extract.js:277-296), but stripTags() cleans their inner content, so the
  // flaw is LATENT there rather than reachable. This guards against the fix
  // regressing sub/sup, not against the original bug.
  it('CONTROL: <sub> containing a self-closing emphasis stays clean', () => {
    const out = extract('<para><sub>a<emphasis effect="bold"/>b</sub> tail</para>');
    expect(out).not.toMatch(/\[\[[A-Za-z]+: /);
  });

  // CONTROL — must pass BEFORE and AFTER the fix. Guards against over-correcting
  // the regex into one that no longer matches ordinary paired emphasis.
  it('CONTROL: ordinary paired bold still becomes [[b:text]]', () => {
    expect(extract('<para>a <emphasis effect="bold">x</emphasis> b</para>')).toContain('[[b:x]]');
  });

  it('CONTROL: ordinary paired italics still becomes [[i:text]]', () => {
    expect(extract('<para>a <emphasis effect="italics">x</emphasis> b</para>')).toContain(
      '[[i:x]]'
    );
  });
});
