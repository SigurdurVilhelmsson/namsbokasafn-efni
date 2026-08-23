/**
 * §C115 — a raw `>` inside a quoted XML attribute value must not truncate an
 * open-tag match.
 *
 * 🔴 WHY THIS ASSERTS VALUES AND NEVER COUNTS. The truncating pattern `<media[^>]*>`
 * still MATCHES; it just matches a shorter span. So the number of `<media>` open tags
 * found is IDENTICAL before and after the fix (measured: 3,312 over the two kept
 * books, both patterns), and every count-shaped check stays green while the alt is
 * silently lost. `parseAttributes` requires a closing quote, so a truncated span
 * yields NO `alt` key at all — not an empty capture, and not `''`. What reaches the
 * output is then the caller's business: here `alt || '' ` makes it `''`, `addSegment`
 * declines an empty string, and the result is a MISSING segment (5 emitted of 6
 * reachable) — which reads downstream as "the source had nothing there".
 *
 * ⚠️ WHAT THAT COSTS THE READER, MEASURED RATHER THAN ASSUMED. With no segment to
 * translate, the figure's alt stays permanently ENGLISH on the published page — the
 * image is described, just not in Icelandic, and no gate can see it because the
 * attribute is present and non-empty. §C115 is also recorded as publishing `alt=""`;
 * that is TRUE OF THE COMMITTED 05-publication HTML (one empty alt among 1,381
 * `<img>`, on this very image's localized variant) but is NOT reproducible from
 * today's code — see the reader-visible case at the bottom of this file, which
 * measures both. An empty alt would be worse still: it tells a screen reader
 * "decorative, skip".
 *
 * The positive control is built in: the clean modules asserted alongside mean a
 * harness that broke everything equally cannot read as a pass.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TAG_ATTR_SPAN, openTagPattern, parseAttributes } from '../lib/cnxml-parser.js';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';
import { renderCnxmlToHtml } from '../cnxml-render.js';

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

  it('READER-VISIBLE: the recovered alt reaches the published <img alt>', () => {
    // 🔴 THE ONLY ASSERTION THAT SPEAKS FOR THE READER. Everything above stops at
    // the segment; this runs source → extract → inject → render and looks at the
    // `<img alt>` a screen reader would actually announce.
    //
    // The sentinel is what makes it meaningful: every alt is overwritten with a
    // token that cannot have come from the source, so "the attribute is non-empty"
    // cannot pass for "the translation arrived" — which is the §C89 failure this
    // whole thread exists to prevent, and is exactly how the defect read before.
    //
    // 📌 THE `imageMapping` IS LOAD-BEARING, NOT DECORATION. m68727's figure is a
    // LOCALIZED image (CNX_Chem_05_03_Systemqw → …_IS.svg), and that is the path
    // the published page takes. Rendering without it exercises a different branch.
    //
    // ⚠️ MEASURED CORRECTION TO THE REGISTER, recorded here because the artifact is
    // what a future reader will check: §C115's second symptom is documented as
    // "publishes alt=\"\"". Today's code does NOT produce an empty alt for this
    // image — before the fix it published the untranslated ENGLISH alt. The one
    // empty alt in the committed 05-publication HTML is from an OLDER pipeline
    // vintage. Both are defects; they are not the same defect.
    const src = fs.readFileSync(M68727, 'utf8');
    const mapping = new Map();
    for (const e of JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'books/efnafraedi-2e/media/image-mapping.json'), 'utf8')
    )) {
      mapping.set(e.originalImage, e);
    }

    const { segments, structure, equations, inlineAttrs } = extractSegments(src);
    const parsed = parseSegments(formatSegmentsMarkdown(segments));
    const sentinels = [];
    for (const [k] of parsed) {
      if (String(k).split(':')[1] !== 'alt') continue;
      const token = `ZQXALT${sentinels.length}ZQX`;
      parsed.set(k, token);
      sentinels.push(token);
    }
    const injected = buildCnxml(
      structure,
      parsed,
      equations,
      src,
      { imageMapping: mapping },
      inlineAttrs
    ).cnxml;
    const { html } = renderCnxmlToHtml(injected, {
      bookSlug: 'efnafraedi-2e',
      imageMapping: mapping,
    });

    // 6, not 5 — the sixth is the raw-`>` alt §C115 recovered.
    expect(sentinels).toHaveLength(6);
    // Control: the page really rendered, and every image is present.
    const imgs = [...html.matchAll(/<img[^>]*>/g)].map((m) => m[0]);
    expect(imgs).toHaveLength(6);
    // Every alt translation reaches the page — VALUES, not a count of attributes.
    expect(sentinels.filter((t) => html.includes(t))).toHaveLength(6);
    // And specifically the formerly-lost one, on the localized image.
    const systemqw = imgs.find((t) => t.includes('Systemqw'));
    expect(systemqw).toMatch(/_IS\.svg/);
    expect(systemqw).toMatch(/alt="ZQXALT\d+ZQX"/);
  }, 60_000);
});
