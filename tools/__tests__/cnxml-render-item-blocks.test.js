import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml, _loadBookConfigForTest } from '../cnxml-render.js';

_loadBookConfigForTest('efnafraedi-2e');

const MATH = '<m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:mi>x</m:mi></m:math>';

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

// li body helper: grab everything between the first <li...> and its matching </li>
function liBody(html) {
  const m = html.match(/<li[^>]*>([\s\S]*?)<\/li>/);
  return m ? m[1] : '';
}

describe('renderItemBody — blocks render in place inside <li>', () => {
  it('media in a no-para item renders INSIDE the li with .media-inline wrapper', () => {
    // The dominant real shape (m68739 stepwise): text + <newline/> + <media>.
    // Pre-fix: processInlineContent emits a bare <img> (no wrapper) — CSS regression class.
    const html = render(
      '<example id="ex1"><list class="stepwise"><item>Teikna Lewis-mynd.<newline/>' +
        '<media id="mA" class="scaled-down" alt="skref"><image src="step1.svg" mime-type="image/svg+xml"/></media>' +
        '</item></list></example>'
    ).html;
    const body = liBody(html);
    expect(body).toContain('class="media-inline scaled-down"');
    expect(body).toContain('step1.svg');
  });

  // SKIPPED — this bare (no <example>/<section> container) <list> is a
  // document-level list. It is routed through renderChildrenInDocumentOrder
  // (cnxml-render.js ~858-913), which string-strips <figure>/<table>/<media>
  // out of the WHOLE content blob (any depth, including inside list items)
  // before <list> is ever extracted — so the figure never reaches
  // renderItemBody's swap pass at all; renderItemBody renders it correctly
  // once it gets a chance to see it (verified separately). That upstream
  // section-level walk is explicitly out of scope for Task 1 ("do not touch
  // ... the section-level walk (later tasks)") and is exactly what Task 2
  // ("routes section-level lists here too") fixes. Un-skip in Task 2.
  it.skip('figure in a no-para item renders INSIDE the li via renderFigure (no raw leak)', () => {
    // Organic shape (191 sites): figure-wrapped media as item child.
    const html = render(
      '<list id="L1"><item>Sameind:' +
        '<figure id="figX"><media id="mX" alt="x"><image src="molecule.jpg" mime-type="image/jpeg"/></media>' +
        '<caption>Skýring</caption></figure></item></list>'
    ).html;
    const body = liBody(html);
    expect(body).toContain('<figure');
    expect(body).toContain('molecule.jpg');
    expect(html).not.toContain('<media'); // no raw CNXML leak
    expect(html.split('molecule.jpg').length - 1).toBe(1); // exactly once
  });

  it('equation nested INSIDE an item para dispatches to renderEquation (m68710 shape)', () => {
    // Pre-fix: pure-para branch leaks the raw <equation> wrapper into the <br>-joined text.
    const html = render(
      '<example id="ex2"><list class="stepwise"><item>' +
        `<para id="ip1">Skrifaðu hálfhvörfin.<equation id="eqN" class="unnumbered">${MATH}</equation></para>` +
        '</item></list></example>'
    ).html;
    expect(html).toContain('class="equation unnumbered"');
    expect(html).not.toMatch(/<equation[^>]*id="eqN"/); // raw wrapper gone
  });

  // SKIPPED — same root cause as the figure test above: this bare <list> is
  // document-level content, so renderChildrenInDocumentOrder strips the
  // <table> out of the content blob before <list> extraction ever runs;
  // renderItemBody never gets a chance to see it. Out of scope for Task 1;
  // fixed by Task 2's section-level routing. Un-skip in Task 2.
  it.skip('table in an item renders via renderTable inside the li', () => {
    const html = render(
      '<list id="L2"><item>Sjá:' +
        '<table id="tbl1" summary="s"><tgroup cols="1"><tbody><row><entry>klefi</entry></row></tbody></tgroup></table>' +
        '</item></list>'
    ).html;
    const body = liBody(html);
    expect(body).toContain('<table');
    expect(body).toContain('klefi');
  });

  it('BYTE-PARITY: pure multi-para item keeps the <br> join with no ids', () => {
    const html = render(
      '<list id="L3"><item><para id="pa">Fyrri.</para><para id="pb">Seinni.</para></item></list>'
    ).html;
    expect(html).toContain('<li>Fyrri.<br>Seinni.</li>');
  });

  it('BYTE-PARITY: text + newline + equation item keeps equation at its position in the flow', () => {
    const html = render(
      `<list id="L4"><item>Fyrir: <newline/><equation id="eqB" class="unnumbered">${MATH}</equation> eftir.</item></list>`
    ).html;
    const body = liBody(html);
    expect(body.indexOf('Fyrir:')).toBeLessThan(body.indexOf('class="equation'));
    expect(body.indexOf('class="equation')).toBeLessThan(body.indexOf('eftir.'));
  });

  it('nested list still renders inside the li, after the item text', () => {
    const html = render(
      '<list id="L5"><item>Yfirlið:<list id="L5inner"><item>Undirliður</item></list></item></list>'
    ).html;
    const body = html.slice(html.indexOf('<li>Yfirlið:'));
    expect(body).toContain('id="L5inner"');
    expect(body.indexOf('Yfirlið:')).toBeLessThan(body.indexOf('Undirliður'));
  });

  it('unknown block type in an item hits the loud seam, not silence', () => {
    const res = render('<list id="L6"><item>Texti<quote id="q1">tilvitnun</quote></item></list>');
    expect(res.undispatchedBlocks.some((b) => b.tag === 'quote')).toBe(true);
  });
});
