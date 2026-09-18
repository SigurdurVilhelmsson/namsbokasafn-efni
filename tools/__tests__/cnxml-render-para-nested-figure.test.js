import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCnxmlToHtml, renderExercise, _loadBookConfigForTest } from '../cnxml-render.js';
import { extractElements } from '../lib/cnxml-parser.js';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

/**
 * §C149 — a <figure> nested in a <para> inside an <example> or <exercise> was
 * emitted INSIDE the <p>, raw, with its CNXML <caption> untransformed.
 *
 * `figure` was in both containers' dispatch maps but in NEITHER's `hoistTags`, so
 * `renderBlockChildrenInOrder` never detached it and `renderPara` rendered it inline.
 * `<figure>` is not permitted in a `<p>`: a browser closes the paragraph early and
 * treats the `</p>` as stray.
 *
 * 🔴 WHAT READERS ACTUALLY GOT, on chemistry `10-exercises.html` exercise 23 (m68764):
 * the paragraph printed `(heimild: Cory Zanker)` as body text AND the figure carried
 * `<caption>(credit: Cory Zanker)</caption>`. An HTML parser drops a stray `<caption>`
 * tag but KEEPS ITS TEXT — so the same credit appeared twice, in two languages.
 * (The duplicated prose is the separate extract-side half, C13 follow-up 2; this fix
 * owns the raw markup and the caption, not the duplicate.)
 *
 * 🔴 BOTH CALL SITES HAD THE OMISSION AND THE REGISTER ONLY GUESSED THE SECOND MIGHT.
 * Census of `01-source`: organic has 10 para-nested figures in EXAMPLES — 4 of them on
 * the PUBLISHED ch03 — and chemistry 1 in an exercise. The register recorded
 * "chemistry 1, organic 0", which is true only of CAPTIONED figures; a BARE figure in
 * a `<p>` is equally invalid markup. Live exposure was **5 pages, not 1**.
 *
 * 🔴 'media' IS DELIBERATELY NOT HOISTED. `<img>` IS permitted inside a `<p>`, and
 * chemistry alone has 204 para-nested media in exercises plus 6 in examples. Hoisting
 * media would move every one of those out of its paragraph — a large, reader-visible
 * layout change with no measured defect behind it. The census decided this, not
 * symmetry with `figure`.
 *
 * ⚠️ THE MODULE-PAGE RENDER CANNOT SEE THE CHEMISTRY CASE. A `class="exercises"`
 * section is excluded from its module page and appears only on the chapter rollup, so
 * a per-module corpus sweep reports 10 (all organic) and misses m68764 entirely. That
 * is why the exercise leg below drives `renderExercise` directly.
 */

_loadBookConfigForTest('efnafraedi-2e');

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

/** A <figure> reached by scanning from a <p> WITHOUT crossing its </p>. */
const FIGURE_INSIDE_P = /<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?<figure/;

/**
 * ⚠️ The first draft of the predicate above was `/<p[^>]*>[\s\S]*<figure/` — GREEDY,
 * so it matched a <figure> emitted AFTER `</p>` and reported the defect as still
 * present on correctly-fixed output. A false red here; the same bug in the other
 * direction reads broken output as clean. The scan must not cross a `</p>`.
 */

function doc(inner) {
  return (
    '<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">' +
    '<title>T</title><content>' +
    inner +
    '</content></document>'
  );
}

const render = (inner, extra = {}) =>
  renderCnxmlToHtml(doc(inner), {
    lang: 'is',
    chapter: 3,
    moduleId: 'mTEST',
    moduleSections: {},
    ...extra,
  });

const FIG = (id) =>
  `<figure id="${id}" class="scaled-down">` +
  `<media alt="a"><image src="x.jpg" mime-type="image/jpeg"/></media>` +
  `<caption>Credit line</caption></figure>`;

describe('§C149 — a para-nested <figure> inside an <exercise>', () => {
  const EX = (body) =>
    `<exercise id="exA"><problem id="probA"><para id="pA">${body}</para></problem></exercise>`;

  it('renders the figure OUTSIDE the paragraph', () => {
    const html = render(EX(`Question text.${FIG('figA')}`)).html;
    expect(FIGURE_INSIDE_P.test(html)).toBe(false);
  });

  it('renders the figure AFTER the paragraph, not dropped', () => {
    // 🔴 The control that makes the assertion above mean something: "no figure inside
    // a <p>" is equally true of a renderer that dropped the figure entirely.
    const html = render(EX(`Question text.${FIG('figA')}`)).html;
    expect(/<\/p>[\s\S]*?<figure[^>]*id="figA"/.test(html)).toBe(true);
  });

  it('converts the CNXML <caption> to a <figcaption>', () => {
    // ⚠️ Deliberately NOT `toContain('<figcaption>Credit line</figcaption>')`. A
    // numbered figure's caption legitimately opens with
    // `<span class="figure-label">Mynd N.N</span>`, so an exact-string expectation
    // fails on correct output — it did here, and the renderer was right. Assert the
    // property (caption text is inside a figcaption, and no raw <caption> survives),
    // not one rendering of it.
    const html = render(EX(`Question text.${FIG('figA')}`)).html;
    expect(
      /<figcaption>(?:(?!<\/figcaption>)[\s\S])*Credit line[\s\S]*?<\/figcaption>/.test(html)
    ).toBe(true);
    expect(html).not.toContain('<caption>Credit line');
  });

  it("keeps the paragraph's own prose", () => {
    // Hoisting must move the figure and nothing else.
    const html = render(EX(`Question text.${FIG('figA')}`)).html;
    expect(html).toContain('Question text.');
  });

  it('does NOT hoist a para-nested <media> (204 in chemistry exercises alone)', () => {
    // <img> is valid inside <p>; hoisting media would relayout every one of them.
    const html = render(
      EX('Question text.<media alt="a"><image src="y.jpg" mime-type="image/jpeg"/></media>')
    ).html;
    const p = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)[1];
    expect(p).toContain('y.jpg');
  });
});

describe('§C149 — a para-nested <figure> inside an <example>', () => {
  const EG = (body) => `<example id="egA"><para id="pB">${body}</para></example>`;

  it('renders the figure outside the paragraph (the site the register only guessed at)', () => {
    const html = render(EG(`Worked step.${FIG('figB')}`)).html;
    expect(FIGURE_INSIDE_P.test(html)).toBe(false);
    expect(/<figure[^>]*id="figB"/.test(html)).toBe(true);
  });

  it('emits no empty <p> when the para held nothing but the figure', () => {
    // renderExample's paraHandler already guards this (`if (contentWithoutTitle.trim())`),
    // which is why the 7 organic figure-only paras gain no empty paragraph. Pinned so a
    // refactor of that handler cannot silently start emitting them.
    const html = render(EG(FIG('figC'))).html;
    expect(/<p\b[^>]*>\s*<\/p>/.test(html)).toBe(false);
    expect(/<figure[^>]*id="figC"/.test(html)).toBe(true);
  });
});

describe('§C149 — the real corpus', () => {
  it('m68764 exercise 23: figure out of the <p>, caption become <figcaption>', () => {
    // 🔴 DRIVEN THROUGH renderExercise DIRECTLY, because a `class="exercises"` section
    // is excluded from its module page and reaches readers only via the chapter
    // rollup — which renderCnxmlToHtml never builds. A per-module sweep cannot see it.
    const src = readFileSync(
      join(REPO_ROOT, 'books/efnafraedi-2e/01-source/ch10/m68764.cnxml'),
      'utf8'
    );
    const ex = extractElements(src, 'exercise').find((e) => e.id === 'fs-idm82765632');
    expect(ex, 'the m68764 exercise must still exist in 01-source').toBeTruthy();
    const html = renderExercise(ex, {
      lang: 'is',
      chapter: 10,
      moduleId: 'm68764',
      moduleSections: {},
      equations: {},
    });
    expect(FIGURE_INSIDE_P.test(html)).toBe(false);
    expect(html).toContain('<figcaption>(credit: Cory Zanker)</figcaption>');
    expect(html).not.toContain('<caption>(credit: Cory Zanker)');
    // Positive control: the question's prose is still there.
    expect(html).toContain('a steel needle or paper clip');
  });

  it.each([
    'ch02/m00028.cnxml',
    'ch03/m00033.cnxml',
    'ch03/m00035.cnxml',
    'ch03/m00038.cnxml',
    'ch04/m00045.cnxml',
    'ch05/m00051.cnxml',
    'ch05/m00054.cnxml',
    'ch07/m00070.cnxml',
  ])('organic %s renders no <figure> inside a <p>', (rel) => {
    // The 8 organic modules carrying the 10 example figures. ch03's four were LIVE.
    const src = readFileSync(join(REPO_ROOT, 'books/lifraen-efnafraedi/01-source', rel), 'utf8');
    const { segments, structure, equations, inlineAttrs } = extractSegments(src);
    const parsed = parseSegments(formatSegmentsMarkdown(segments));
    const en = buildCnxml(structure, parsed, equations, src, {}, inlineAttrs).cnxml;
    const { html } = renderCnxmlToHtml(en, { bookSlug: 'lifraen-efnafraedi' });
    expect(FIGURE_INSIDE_P.test(html)).toBe(false);
    // Positive control: the figures are still rendered, just not inside a paragraph.
    expect(html).toContain('<figure');
  });
});
