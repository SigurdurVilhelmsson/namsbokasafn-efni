import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCnxmlToHtml, _loadBookConfigForTest } from '../cnxml-render.js';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

/**
 * §C146 + §C154 — block content inside a CALS table reaching (or not reaching) readers.
 *
 * TWO DEFECTS, ONE FUNCTION FAMILY, AND THEY FAIL IN OPPOSITE DIRECTIONS:
 *
 * §C146 — a <para> that is a direct child of an <entry> leaked into published HTML
 * VERBATIM. `renderTableCells` called processInlineContent, which has no <para> case,
 * so the tag survived while its inner content rendered correctly. That asymmetry is
 * what made it read as a vefur styling bug rather than a renderer gap: the text was
 * all there, just wrapped in an element no stylesheet knows. Chemistry's solubility
 * table (m68710) put seven ions in one cell as seven <para>s, which therefore ran
 * together on one line instead of stacking.
 *
 * §C154 — a <tfoot> row was dropped ENTIRELY. `renderTable` matched <thead> and
 * <tbody> only. Organic m00016's footer holds a footnote whose superscript marker is
 * referenced from the table title, so the page carried a dangling reference.
 *
 * 🔴 NEITHER IS VISIBLE TO A COUNT, AND THEY DEFEAT DIFFERENT INSTRUMENTS.
 * §C146's text is PRESENT, so every character-level or segment-coverage tally
 * reconciles. §C154's row is ABSENT, so there is nothing to tally at all — and the
 * id-matched render oracle reports a missing id as an ANCHOR gap rather than a loss.
 * Worse, the oracle read §C146 as a clean PASS: the leaked `<para id="nh4">` still
 * carries its id, so the id was found present. ▶ Never cite a clean oracle run as
 * evidence against either class.
 *
 * ⚠️ §C154 WAS FOUND BY A PREDICTION DISAGREEING WITH A MEASUREMENT BY ONE.
 * A parser census of `01-source` predicted 50 paras-in-entries; the corpus render
 * measured 49 raw `<para` before the fix. The missing one was m00016's — because its
 * whole <tfoot> never rendered. Accepting "49 ≈ 50" would have shipped §C146 and left
 * §C154 undiscovered. That is CLAUDE.md's predicted-number rule paying for itself.
 *
 * The corpus leg below is the real check; the unit legs pin the mechanism so a
 * refactor that breaks it fails on a fixture rather than only on the corpus.
 */

_loadBookConfigForTest('efnafraedi-2e');

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

function doc(inner) {
  return (
    '<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">' +
    '<title>T</title><content>' +
    inner +
    '</content></document>'
  );
}

function render(inner, extra = {}) {
  return renderCnxmlToHtml(doc(inner), {
    lang: 'is',
    chapter: 3,
    moduleId: 'mTEST',
    moduleSections: {},
    ...extra,
  });
}

/** A one-column CALS table whose single body cell holds `cell`. */
function tableWithCell(cell, { tfoot = '' } = {}) {
  return (
    '<table id="tTEST" summary="s"><title>Tafla</title><tgroup cols="1">' +
    `<tbody><row><entry align="left">${cell}</entry></row></tbody>` +
    tfoot +
    '</tgroup></table>'
  );
}

/** Extract -> inject the module's own English -> render. The free, source-anchored path. */
function renderEnglishRoundTrip(src, bookSlug) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(src);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  const en = buildCnxml(structure, parsed, equations, src, {}, inlineAttrs).cnxml;
  return renderCnxmlToHtml(en, { bookSlug });
}

describe('§C146 — a <para> child of a table <entry> renders as a block', () => {
  it('emits one <p> per para, keeping each para id', () => {
    const html = render(
      tableWithCell('<para id="nh4">NH<sub>4</sub></para><para id="li">Li<sup>+</sup></para>')
    ).html;
    expect(html).toContain('<p id="nh4">NH<sub>4</sub></p>');
    expect(html).toContain('<p id="li">Li<sup>+</sup></p>');
  });

  it('leaves no raw <para> tag in the output', () => {
    const html = render(tableWithCell('<para id="a">x</para><para id="b">y</para>')).html;
    expect(html).not.toContain('<para');
  });

  it('keeps inline text that sits between and around the paras, in order', () => {
    const html = render(tableWithCell('lead <para id="p">mid</para> tail')).html;
    const cell = html.match(/<td[^>]*>([\s\S]*?)<\/td>/)[1];
    expect(cell).toBe('lead <p id="p">mid</p> tail');
  });

  it('still renders a <media> image in the same cell (the path that already worked)', () => {
    // Guards against a fix that dispatches paras by taking the cell off
    // processInlineContent entirely: 274 entries corpus-wide carry a <media>
    // and 0 of them leaked, so that behaviour must survive untouched.
    const html = render(
      tableWithCell(
        '<media alt="a"><image src="x.jpg" mime-type="image/jpeg"/></media>' +
          '<para id="cap">(X=F)</para>'
      )
    ).html;
    expect(html).toContain('x.jpg');
    expect(html).toContain('<p id="cap">(X=F)</p>');
    expect(html).not.toContain('<para');
  });

  it('is output-neutral for a cell with no para (the 99% case)', () => {
    // The corpus diff proves this at scale (487 of 491 modules byte-identical);
    // this pins the intent so the property is stated, not merely observed.
    const html = render(tableWithCell('plain <emphasis effect="bold">cell</emphasis>')).html;
    const cell = html.match(/<td[^>]*>([\s\S]*?)<\/td>/)[1];
    expect(cell).toBe('plain <strong>cell</strong>');
  });

  it('records an undispatched block left in a cell on the loud seam', () => {
    // Diagnostic only — renderCnxmlToHtml returns it and nothing fails on it — so a
    // future block type in a cell becomes visible without becoming a refusal.
    const res = render(tableWithCell('<para id="p">x</para><quote id="q">y</quote>'));
    expect(
      res.undispatchedBlocks.some((b) => b.tag === 'quote' && b.location === 'renderTableCells')
    ).toBe(true);
  });

  it('records an undispatched block that sits BEFORE the first para', () => {
    // 🔴 THE FIRST DRAFT SCANNED ONLY THE TEXT AFTER THE LAST PARA, so a block
    // before or between paras was invisible. The trailing case above passed
    // throughout — which is how a seam can look tested and be half-blind.
    const res = render(tableWithCell('<quote id="q">y</quote><para id="p">x</para>'));
    expect(
      res.undispatchedBlocks.some((b) => b.tag === 'quote' && b.location === 'renderTableCells')
    ).toBe(true);
  });

  it('records an undispatched block in a cell with NO para at all', () => {
    // 🔴 THE CASE THE DETECTOR EXISTS FOR, AND THE ONE THE FIRST DRAFT COULD NOT
    // SEE: the scan sat inside a `paras.length > 0` branch, so a para-less cell
    // returned early and was never examined. The only real candidate in the corpus
    // — organic m00046's <figure> entry — has no para, so the seam reported a clean
    // zero on the very shape it was written to catch.
    const res = render(tableWithCell('<quote id="q">y</quote>'));
    expect(
      res.undispatchedBlocks.some((b) => b.tag === 'quote' && b.location === 'renderTableCells')
    ).toBe(true);
  });

  it('records nothing on the loud seam for an ordinary para-only cell', () => {
    // The control for the assertions above: without it, a seam that fired on
    // everything would satisfy all three.
    const res = render(tableWithCell('<para id="p">x</para>'));
    expect(res.undispatchedBlocks.filter((b) => b.location === 'renderTableCells')).toEqual([]);
  });

  it('does not report a <media> in a cell as an undispatched block', () => {
    // 274 entries corpus-wide carry a <media> and processInlineContent renders it
    // IN PLACE (unlike renderItemBody, which swaps it out before its own seam). A
    // set copied from ITEM_INLINE_OK without 'media' reports all 274 as undispatched
    // — noise that would bury the one real hit.
    const res = render(
      tableWithCell(
        '<para id="p">x</para><media alt="a"><image src="y.jpg" mime-type="image/jpeg"/></media>'
      )
    );
    expect(res.undispatchedBlocks.filter((b) => b.location === 'renderTableCells')).toEqual([]);
  });
});

describe('§C154 — a <tfoot> row reaches the output', () => {
  const TFOOT =
    '<tfoot><row><entry align="left"><para id="fn"><sup>a</sup>Note.</para></entry></row></tfoot>';

  it('renders the footer row instead of dropping it', () => {
    const html = render(tableWithCell('body', { tfoot: TFOOT })).html;
    expect(html).toContain('<tfoot>');
    expect(html).toContain('<p id="fn"><sup>a</sup>Note.</p>');
  });

  it('places <tfoot> after </tbody> (HTML5 requires it last)', () => {
    const html = render(tableWithCell('body', { tfoot: TFOOT })).html;
    expect(html.indexOf('<tfoot>')).toBeGreaterThan(html.indexOf('</tbody>'));
  });

  it('emits no <tfoot> when the source has none', () => {
    // Control: proves the assertion above is reading the source's tfoot and not a
    // wrapper the renderer emits unconditionally.
    const html = render(tableWithCell('body')).html;
    expect(html).not.toContain('<tfoot');
  });
});

describe('§C146 + §C154 — the real corpus', () => {
  // Every module of both kept books that carries a block child in a table entry,
  // measured by a parser census of 01-source on 2026-09-17. `paras` is the count in
  // the SOURCE; `published` records whether the defect was live for readers.
  const MODULES = [
    { book: 'efnafraedi-2e', path: 'ch04/m68710.cnxml', paras: 18, published: true },
    { book: 'efnafraedi-2e', path: 'ch17/m68824.cnxml', paras: 6, published: true },
    { book: 'lifraen-efnafraedi', path: 'ch03/m00032.cnxml', paras: 1, published: true },
    { book: 'lifraen-efnafraedi', path: 'ch26/m00327.cnxml', paras: 24, published: false },
    // m00016's single para is inside the <tfoot>, so it is §C154's module, not §C146's.
    { book: 'lifraen-efnafraedi', path: 'appendices/m00016.cnxml', paras: 1, published: false },
  ];

  const renderModule = (m) =>
    renderEnglishRoundTrip(
      readFileSync(join(REPO_ROOT, 'books', m.book, '01-source', m.path), 'utf8'),
      m.book
    ).html;

  it.each(MODULES)('$book/$path renders no raw <para>', (m) => {
    expect(renderModule(m)).not.toContain('<para');
  });

  it('m68710 emits its 18 solubility-table paras as <p> in cells (positive control)', () => {
    // 🔴 THE CONTROL THAT MAKES THE NULLS ABOVE MEAN SOMETHING. "No raw <para>" is
    // also what a renderer that DROPPED every para would print, and that failure is
    // exactly §C154's. Requiring the paras to be PRESENT as <p> separates the two.
    const html = renderModule(MODULES[0]);
    const cellParas = [...html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map((m2) => (m2[1].match(/<p id="/g) || []).length)
      .reduce((a, b) => a + b, 0);
    expect(cellParas).toBeGreaterThanOrEqual(18);
  });

  it("m00016's footer footnote reaches the page (§C154)", () => {
    // The table title carries an xref to this para's id, so its absence left a
    // dangling superscript marker.
    expect(renderModule(MODULES[4])).toContain('Principal groups are listed in order');
  });
});
