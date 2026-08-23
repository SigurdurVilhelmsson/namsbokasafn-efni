/**
 * §C115 — a raw `>` inside a quoted XML attribute value must not truncate an
 * open-tag match.
 *
 * 🔴 WHY THIS ASSERTS VALUES AND NEVER COUNTS. The truncating pattern `<media[^>]*>`
 * still MATCHES; it just matches a shorter span. So the number of `<media>` open tags
 * found is IDENTICAL before and after the fix (measured: 3,312 over the two kept
 * books, both patterns), and every count-shaped check stays green while the alt is
 * silently lost. `parseAttributes` then finds no complete `alt="…"` pair and the
 * caller reads `undefined`, so the pipeline emits an EMPTY alt rather than a missing
 * one — which reads downstream as "the source had nothing there", and publishes
 * `alt=""`. An empty alt is WORSE than an English one: it tells a screen reader
 * "decorative, skip".
 *
 * The positive control is built in: the clean modules asserted alongside mean a
 * harness that broke everything equally cannot read as a pass.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TAG_ATTR_SPAN, openTagPattern, parseAttributes } from '../lib/cnxml-parser.js';
import { extractSegments } from '../cnxml-extract.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const M68727 = path.join(REPO_ROOT, 'books/efnafraedi-2e/01-source/ch05/m68727.cnxml');

/**
 * The tail of the 485-character alt on `<media id="fs-idp1427264">`.
 * 🔴 THIS IS THE SENTINEL. The old pattern stops 483 characters in, so anything
 * that checks only "is there an alt attribute" or "is it long" passes on the
 * BROKEN code. Only the tail separates the two.
 */
const ALT_TAIL = '“Δ U > 0”, “System,” and “Δ U &lt; 0.”';

describe('§C115 — a bare `>` in an attribute value must not truncate the open tag', () => {
  it('the source really does carry a raw `>` and an escaped `<` in the same value', () => {
    const src = fs.readFileSync(M68727, 'utf8');
    const open = src.match(openTagPattern('media', { flags: '' }));
    const alt = parseAttributes(open[0]).alt;
    // Both halves matter: the raw `>` is what truncates, and the escaped `&lt;`
    // beside it is what proves the document is well-formed and the RelaxNG gate
    // is correct to pass it. This is a source fact, not a code fact.
    expect(alt).toContain('>');
    expect(alt).toContain('&lt;');
    expect(alt.length).toBe(485);
  });

  it('the OLD `[^>]*` idiom loses the value entirely — the defect, pinned', () => {
    const src = fs.readFileSync(M68727, 'utf8');
    const truncated = src.match(/<media[^>]*>/)[0];
    // Not "shorter" — GONE. parseAttributes finds no terminated alt pair at all.
    expect(parseAttributes(truncated).alt).toBeUndefined();
  });

  it('the quote-aware span recovers the whole value, tail included', () => {
    const src = fs.readFileSync(M68727, 'utf8');
    const open = src.match(openTagPattern('media', { flags: '' }))[0];
    expect(parseAttributes(open).alt).toContain(ALT_TAIL);
  });

  it('self-closing tags and attribute-less tags still work', () => {
    const re = (s) => s.match(new RegExp(`<image${TAG_ATTR_SPAN}\\/?>`))[0];
    expect(parseAttributes(re(`<image src="x.jpg" alt="p > q"/>`)).alt).toBe('p > q');
    expect(re(`<image>`)).toBe('<image>');
  });

  it('a single-quoted value containing `>` does not truncate the tag either', () => {
    // ⚠️ THE SPAN AND THE READER HAVE DIFFERENT QUOTE SUPPORT, deliberately.
    // TAG_ATTR_SPAN understands both quote styles, so the open tag is delimited
    // correctly; `parseAttributes` reads DOUBLE-quoted pairs only, so it returns
    // nothing for a single-quoted one. That asymmetry is pre-existing and is NOT
    // widened here — measured across all five books' 01-source: 52 single-quoted
    // attributes exist, ALL of them organic MathML presentation attributes
    // (m:mo@stretchy ×50, m:mtable@columnalign ×1, m:math@display ×1) and ZERO
    // of them `alt`, `id` or `src`. Census:
    // test-results/c115-single-quote-attr-census-2026-08-24.mjs
    // What matters for §C115 is that the tag is not TRUNCATED — a truncated tag
    // corrupts every attribute after the `>`, including double-quoted ones.
    const tag = `<image src="x.jpg" data-note='a > b' alt="kept"/>`;
    const matched = tag.match(new RegExp(`<image${TAG_ATTR_SPAN}\\/?>`))[0];
    expect(matched).toBe(tag);
    expect(parseAttributes(matched).alt).toBe('kept');
    expect(tag.match(/<image[^>]*\/?>/)[0]).not.toBe(tag); // the old idiom truncates
  });

  it('END-TO-END: the extractor emits the alt SEGMENT with its tail intact', () => {
    const src = fs.readFileSync(M68727, 'utf8');
    const alts = extractSegments(src).segments.filter((s) => s.type === 'alt');
    const hit = alts.filter((s) => s.text.includes('Δ U'));
    // Exactly one segment carries it, and it carries the TAIL — not merely a
    // non-empty alt, which the broken code could also produce for other media.
    expect(hit).toHaveLength(1);
    expect(hit[0].text).toContain(ALT_TAIL);
  });

  it('POSITIVE CONTROL — a clean module in the same chapter is unchanged', () => {
    // If the harness were broken in a way that "fixed" everything, or that
    // perturbed unrelated modules, this would move. m68724 has no raw `>`.
    const clean = path.join(REPO_ROOT, 'books/efnafraedi-2e/01-source/ch05/m68724.cnxml');
    const src = fs.readFileSync(clean, 'utf8');
    const alts = extractSegments(src).segments.filter((s) => s.type === 'alt');
    expect(alts.length).toBeGreaterThan(0);
    for (const a of alts) expect(a.text.trim()).not.toBe('');
  });
});
