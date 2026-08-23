import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * §C90 — `processFigure` must not read markup out of an XML COMMENT.
 *
 * THE DEFECT. `figure.content` is raw source text, comments included.
 * `processFigure` matched `<media…>…</media>` and then ran
 * `/<image[^>]*>/` over the media's INNER text. In `lifraen-efnafraedi`
 * `ch28/m00309` the media opens with a commented-out `<image>`:
 *
 *     <media alt="Alt Text Placeholder">
 *     <!--<image … src="../../media/OChem_28_00_Retrievers.jpg"/>-->
 *     <image … src="../../media/OSX_OrgChem_28_00_Afghans.jpg"/>
 *     </media>
 *
 * so the first `<image>` the regex saw was the DEAD one, and the published page
 * showed a different photograph than the book specifies.
 *
 * 🔴 WHY THIS TEST ASSERTS A VALUE AND NOT A COUNT. The module is 1 media in /
 * 1 media out, 1 image in / 1 image out, 1 alt in / 1 alt out. Every count-based
 * check — the committed round-trip pin included — reports `ok: true` and lists
 * the module in neither `loss` nor `gain`. **A count cannot see a substitution,
 * only a change in quantity** (§C89's rule, and §C87 ④'s intra-module
 * cancellation boundary firing on real content). The `expect` below therefore
 * compares the emitted `src` STRING. The count assertions are kept alongside
 * deliberately — they document that the cheap check passes in both directions
 * and is worthless here.
 *
 * THE CONTROL IS THE MIRROR CASE, NOT A CLEAN MODULE. `ch16/m00198` has the same
 * ingredients — one live image, one commented-out image, same `<media>` — in the
 * OPPOSITE order (live first, comment second), so it round-tripped correctly
 * only by luck of ordering. It must be unchanged by the fix. A control that
 * merely lacked comments would not discriminate: it would pass whether the fix
 * masked comments or deleted the image handling outright.
 */

const LIVE_309 = '../../media/OSX_OrgChem_28_00_Afghans.jpg';
const DEAD_309 = '../../media/OChem_28_00_Retrievers.jpg';
const LIVE_198 = '../../media/OSX_OrgChem_16_98_Robot.jpeg';
const DEAD_198 = '../../media/OChem_16_98_Robot.jpg';

function moduleSource(slug, module) {
  const base = path.join(REPO_ROOT, 'books', slug, '01-source');
  for (const dir of fs.readdirSync(base)) {
    const p = path.join(base, dir, `${module}.cnxml`);
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  }
  throw new Error(`fixture missing: ${slug}/${module}`);
}

/** Extract a module and inject its own ENGLISH back — no translation involved. */
function roundTrip(cnxml) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(cnxml);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  return buildCnxml(structure, parsed, equations, cnxml, {}, inlineAttrs).cnxml;
}

const imageSrcs = (xml) =>
  [...String(xml).matchAll(/<image[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);

/** `<image>` occurrences that are NOT inside an XML comment. */
function liveImageSrcs(xml) {
  const masked = String(xml).replace(/<!--[\s\S]*?-->/g, '');
  return imageSrcs(masked);
}

describe('§C90 — a figure must emit the LIVE image, never a commented-out one', () => {
  it('m00309 emits the live src and not the commented-out one', () => {
    const src = moduleSource('lifraen-efnafraedi', 'm00309');

    // The fixture is what the defect needs — assert it, so a source edit that
    // removed the comment would fail loudly here rather than turn this test
    // vacuously green.
    expect(src).toContain(DEAD_309);
    expect(src).toContain(LIVE_309);
    expect(liveImageSrcs(src)).toEqual([LIVE_309]);

    const out = roundTrip(src);
    expect(imageSrcs(out)).toEqual([LIVE_309]);
    expect(out).not.toContain(DEAD_309);
  });

  it('the count-based view of m00309 is clean in BOTH directions (why counts are useless here)', () => {
    const src = moduleSource('lifraen-efnafraedi', 'm00309');
    const out = roundTrip(src);
    const count = (x, re) => (String(x).match(re) || []).length;
    // ⚠️ The source must be COMMENT-MASKED to make this comparison meaningful.
    // A raw count over the source sees the dead <image> too (2 vs 1) and would
    // read as a real loss — the opposite of the point being made. Masked, the
    // LIVE population is 1 in / 1 out, which is exactly what let the wrong photo
    // ship past every count-based gate.
    const srcLive = String(src).replace(/<!--[\s\S]*?-->/g, '');
    expect(count(out, /<media\b/g)).toBe(count(srcLive, /<media\b/g));
    expect(count(out, /<image\b/g)).toBe(count(srcLive, /<image\b/g));
  });

  it('CONTROL m00198 — same ingredients, opposite order — is unaffected', () => {
    const src = moduleSource('lifraen-efnafraedi', 'm00198');
    expect(src).toContain(DEAD_198); // the mirror shape really is present
    expect(src).toContain(LIVE_198);

    // ⚠️ Scoped to the ONE src pair, not to the whole module: m00198 carries 29
    // images, so a whole-module equality assertion says nothing about this
    // figure and fails for reasons unrelated to §C90.
    const out = roundTrip(src);
    expect(imageSrcs(out)).toContain(LIVE_198);
    expect(out).not.toContain(DEAD_198);
    // And the module's live image population is carried through intact — the
    // positive control that proves the assertion above is not passing simply
    // because the round-trip dropped everything.
    expect(imageSrcs(out).length).toBe(liveImageSrcs(src).length);
  });

  it('CONTROL efnafraedi-2e has none of this shape (scope, with a positive control)', () => {
    const base = path.join(REPO_ROOT, 'books', 'efnafraedi-2e', '01-source');
    let withCommentedImageFirst = 0;
    let mediaBlocksSeen = 0; // positive control: a broken sweep reports 0 for both
    for (const dir of fs.readdirSync(base)) {
      const d = path.join(base, dir);
      if (!fs.statSync(d).isDirectory()) continue;
      for (const f of fs.readdirSync(d)) {
        if (!f.endsWith('.cnxml')) continue;
        const text = fs.readFileSync(path.join(d, f), 'utf8');
        for (const m of text.matchAll(/<media[^>]*>([\s\S]*?)<\/media>/g)) {
          mediaBlocksSeen += 1;
          const inner = m[1];
          const firstImage = inner.search(/<image[^>]*>/);
          const firstComment = inner.indexOf('<!--');
          const commentEnd = inner.indexOf('-->');
          if (firstComment !== -1 && firstImage > firstComment && firstImage < commentEnd) {
            withCommentedImageFirst += 1;
          }
        }
      }
    }
    expect(mediaBlocksSeen).toBeGreaterThan(100); // the sweep really ran
    expect(withCommentedImageFirst).toBe(0);
  });
});
