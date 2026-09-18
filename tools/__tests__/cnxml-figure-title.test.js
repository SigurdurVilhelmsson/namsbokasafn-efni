import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';
import { renderCnxmlToHtml, _loadBookConfigForTest } from '../cnxml-render.js';

/**
 * §C155 — a `<figure>`'s `<title>` was extracted by NOTHING and rendered by
 * NOTHING, so it reached readers in no language at all.
 *
 * `processFigure` read a direct-child `<caption>` and stopped there; `renderFigure`
 * emitted the media and the `<figcaption>` and stopped there. The title survived
 * untouched into the injected CNXML (`buildFigure` returns the source block with
 * only caption/alt/src swapped) and was then dropped at render.
 *
 * **This is a LOSS, not an English leak** — verified before writing any code, on
 * organic ch06/m00081: the word `MECHANISM` does not appear anywhere in that
 * module's rendered HTML. Same symptom as §C150 (a `<table>`'s caption).
 *
 * 🔴 CENSUS, measured 2026-09-18 across all six books: **75 figures carry a
 * direct-child `<title>` — organic 69 across 56 modules, biology 6, chemistry 0,
 * physics 0, microbiology 0.** 61 of organic's 69 are the single word
 * `MECHANISM` (OpenStax's mechanism-box heading, `class="mechanism-figure"`),
 * 3 are EMPTY, and 5 are real prose, all in ch02.
 *
 * 🔴 WHY IT WAS BUILT WITH 0 READERS AFFECTED, WHICH IS NOT THE USUAL REASON.
 * Organic ch03 is the only published organic chapter and holds NONE of the 69, so
 * nobody sees this today. What makes now the right moment is the opposite of
 * urgency: **0 of the 56 affected modules hold committed MT**, so minting a new
 * segment renumbers no `auto-N` id that anything depends on. After those chapters
 * are bought, this identical change would invalidate 56 modules' translations.
 * ▶ **The cheapest moment to add a segment is before its module's MT exists.**
 *
 * 🔴 THE LABEL IS TRANSLATED THROUGH THE SEGMENT, NOT SYNTHESISED FROM THE CLASS.
 * 61 identical `MECHANISM` titles invite a class-keyed label like
 * `noteTypeLabels`. **That was considered and rejected**: `noteTypeLabels` exists
 * because a CNXML `<note type="…">` carries no text of its own, whereas here the
 * text is right there in the source. CLAUDE.md § *clean CNXML* — *"if it is in the
 * source for a book, it stays in ours"* — and a class-keyed label would render
 * words absent from the CNXML and diverge silently if OpenStax edited a title
 * without touching the class. The 5 prose titles need the segment path anyway, so
 * the clever route builds a second mechanism to save nothing.
 *
 * ⚠️ RENDERED AS A BARE `<h4>`, MATCHING `renderNote`'s TITLE PRECEDENT, BECAUSE
 * THE CLASS NAMES ARE A CROSS-REPO CONTRACT. vefur's `content.css` styles
 * `figcaption`, `.figure-label` and `.note-type`; it has **no** `.figure-title`.
 * A bare `<h4>` needs no coordinated vefur change (CLAUDE.md § Cross-repo). If
 * styling is wanted later, that is a vefur-side follow-up plus a class here.
 *
 * ⚠️ DEPTH MATTERS — use `firstDirectChildTitle`, never a bare
 * `/<title>([\s\S]*?)<\/title>/` on the figure's content. A `<subfigure>` can carry
 * its own title, and §C82 L144 records `getElementsByTagName('title')[0]` returning
 * a nested paragraph's sub-heading for 301 of 301 chemistry examples.
 */

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const readSource = (rel) => readFileSync(join(REPO_ROOT, 'books', rel), 'utf8');

const doc = (
  body
) => `<document xmlns="http://cnx.org/ns/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML" id="mFIX" module-id="mFIX">
<title>Figure title fixture</title>
<metadata xmlns:md="http://cnx.org/ns/mdml">
<md:content-id>mFIX</md:content-id>
<md:title>Figure title fixture</md:title>
</metadata>
<content>
<section id="sec-1">
<title>A section</title>
${body}
</section>
</content>
</document>`;

const TITLED = doc(`<figure id="fig-1" class="mechanism-figure">
<title>MECHANISM</title>
<media id="media-1" alt="An alt description.">
<image mime-type="image/jpeg" src="../../media/fixture.jpg"/>
</media>
<caption>A caption that is not the title.</caption>
</figure>`);

const CAPTION_ONLY = doc(`<figure id="fig-1">
<media id="media-1" alt="An alt description.">
<image mime-type="image/jpeg" src="../../media/fixture.jpg"/>
</media>
<caption>A caption that is not the title.</caption>
</figure>`);

/** A title that is NOT the figure's own — it belongs to a nested subfigure. */
const NESTED_TITLE_ONLY = doc(`<figure id="fig-1">
<subfigure id="sub-1">
<title>A subfigure title that is not the figure's</title>
<media id="media-1" alt="An alt description.">
<image mime-type="image/jpeg" src="../../media/fixture.jpg"/>
</media>
</subfigure>
<caption>A caption that is not the title.</caption>
</figure>`);

/** The §C149 ② shape, but with a title: a captioned+titled figure inside a para. */
const TITLED_IN_PARA = doc(`<exercise id="ex-1">
<problem id="prob-1">
<para id="para-1">Prose that belongs to the paragraph.<newline/>
<figure id="fig-1">
<title>MECHANISM</title>
<media id="media-1" alt="An alt description.">
<image mime-type="image/jpeg" src="../../media/fixture.jpg"/>
</media>
<caption>A caption that is not the title.</caption>
</figure>
</para>
</problem>
</exercise>`);

const segs = (cnxml) => extractSegments(cnxml).segments;

describe('§C155 extract — a figure owns its direct-child <title>', () => {
  it('emits a figure-title segment carrying the title text', () => {
    const t = segs(TITLED).find((s) => s.type === 'figure-title');
    expect(t, 'a figure-title segment must exist').toBeTruthy();
    expect(t.text).toBe('MECHANISM');
  });

  it('anchors the segment id on the figure id', () => {
    const t = segs(TITLED).find((s) => s.type === 'figure-title');
    expect(t.id).toBe('mFIX:figure-title:fig-1-title');
  });

  it("keeps the figure's caption as its own separate segment", () => {
    // Control: the title must not displace or absorb the caption. They are two
    // distinct strings in the source and must stay two distinct segments.
    const caption = segs(TITLED).find((s) => s.type === 'caption');
    expect(caption, 'the caption segment must survive').toBeTruthy();
    expect(caption.text).toBe('A caption that is not the title.');
  });

  it('emits NO figure-title when the figure has none (negative control)', () => {
    expect(segs(CAPTION_ONLY).some((s) => s.type === 'figure-title')).toBe(false);
  });

  it("does NOT claim a nested <subfigure>'s title as the figure's own", () => {
    // Depth control. A bare /<title>…<\/title>/ on figure.content would take it,
    // which is §C82 L144's exact failure: a populated slot holding the WRONG text
    // is worse than an empty one, and no coverage count can see it.
    expect(segs(NESTED_TITLE_ONLY).some((s) => s.type === 'figure-title')).toBe(false);
  });
});

describe('§C155 — the title must not ALSO leak into an enclosing paragraph', () => {
  it('a titled figure inside a para leaves no title text in the para segment', () => {
    // §C149 ② widened. Once processFigure OWNS the title, extractInlineText must
    // drop it from the paragraph too, or this fix recreates §C149 ②'s duplicate for
    // titles — the same prose in two segments, reaching readers twice.
    const all = segs(TITLED_IN_PARA);
    const problem = all.find((s) => s.type === 'problem');
    expect(problem, 'the fixture must still produce a problem segment').toBeTruthy();
    expect(problem.text).not.toContain('MECHANISM');
    // Coverage control, paired: the text MOVED, it did not vanish.
    const t = all.find((s) => s.type === 'figure-title');
    expect(t, 'the figure must own the title instead').toBeTruthy();
    expect(t.text).toBe('MECHANISM');
  });
});

describe('§C155 inject — the translated title is written back', () => {
  it('replaces the figure title with its translation, not just the caption', () => {
    // A VALUE comparison, never a count: §C89's rule. The English title is present
    // either way, so a tag tally cannot see a dropped translation.
    const { segments, structure, equations, inlineAttrs } = extractSegments(TITLED);
    const parsed = parseSegments(formatSegmentsMarkdown(segments));
    // Overwrite each segment with a token that cannot have come from the source.
    const sentinel = new Map();
    for (const id of parsed.keys()) sentinel.set(id, `ZZ_${id.replace(/[^\w]/g, '_')}_ZZ`);
    const out = buildCnxml(structure, sentinel, equations, TITLED, {}, inlineAttrs).cnxml;
    expect(out).toContain('ZZ_mFIX_figure_title_fig_1_title_ZZ');
    expect(out).not.toContain('<title>MECHANISM</title>');
    // Positive control: the caption writeback still works, so a failure above is
    // about the title and not about the harness.
    expect(out).toContain('ZZ_mFIX_caption_fig_1_caption_ZZ');
  });
});

describe('§C155 render — the title reaches the reader', () => {
  it('emits the figure title inside the <figure>', () => {
    _loadBookConfigForTest('lifraen-efnafraedi');
    const { html } = renderCnxmlToHtml(TITLED, {
      bookSlug: 'lifraen-efnafraedi',
      chapter: 6,
      moduleId: 'mFIX',
    });
    expect(html).toContain('MECHANISM');
    // It belongs INSIDE the figure, above the image — not loose in the document.
    const fig = html.slice(html.indexOf('<figure'), html.indexOf('</figure>'));
    expect(fig).toContain('MECHANISM');
    // Positive control: the caption still renders, so this is not a page that
    // simply dumped the raw source.
    expect(fig).toContain('A caption that is not the title.');
  });
});

describe('§C155 — the real corpus, all three columns', () => {
  // emitted -> injected -> RENDERED. Two populations, because they are different
  // shapes: the repeated structural label and a real prose title.
  it.each([
    ['ch06/m00081.cnxml', 'fig-00003', 'MECHANISM'],
    ['ch02/m00018.cnxml', 'fig-00002', 'Electronegativity values and trends.'],
  ])('organic %s figure %s: emitted, injected AND rendered', (rel, figId, titleText) => {
    _loadBookConfigForTest('lifraen-efnafraedi');
    const src = readSource(join('lifraen-efnafraedi/01-source', rel));

    // Column 1 — emitted.
    const { segments, structure, equations, inlineAttrs } = extractSegments(src);
    const t = segments.find(
      (s) => s.id === `${rel.split('/')[1].replace('.cnxml', '')}:figure-title:${figId}-title`
    );
    expect(t, 'the figure-title segment must be emitted').toBeTruthy();
    expect(t.text).toBe(titleText);

    // Column 2 — injected (the module's own English back in, source-roundtrip style).
    const parsed = parseSegments(formatSegmentsMarkdown(segments));
    const injected = buildCnxml(structure, parsed, equations, src, {}, inlineAttrs).cnxml;
    expect(injected).toContain(titleText);

    // Column 3 — RENDERED. The column §C82 L149 records as the one that silently
    // reads 0 while the first two read 100%.
    const { html } = renderCnxmlToHtml(injected, {
      bookSlug: 'lifraen-efnafraedi',
      chapter: Number(rel.slice(2, 4)),
      moduleId: rel.split('/')[1].replace('.cnxml', ''),
    });
    expect(html).toContain(titleText);
  });

  it('organic ch03 is unaffected — it carries none of the 69 (negative control)', () => {
    // ch03 is the only PUBLISHED organic chapter. If this change altered it, the
    // "0 reader exposure" claim behind building this now would be false.
    for (const rel of ['ch03/m00033.cnxml', 'ch03/m00035.cnxml', 'ch03/m00038.cnxml']) {
      const src = readSource(join('lifraen-efnafraedi/01-source', rel));
      const s = segs(src);
      expect(
        s.some((x) => x.type === 'figure-title'),
        `${rel} must emit no figure-title`
      ).toBe(false);
      // Positive control: these modules really were extracted.
      expect(s.length).toBeGreaterThan(0);
    }
  });
});
