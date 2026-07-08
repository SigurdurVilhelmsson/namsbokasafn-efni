/**
 * cnxml-render-example-dom.test.js — renderExample DOM-seam behavior (Track C C2).
 *
 * renderExample moved from global string-position sorting to the document-order
 * DOM seam (renderBlockChildrenInOrder). These pin the two behavior changes the
 * migration makes by construction; golden covers the byte-identical bulk.
 */

import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml, _loadBookConfigForTest } from '../cnxml-render.js';

_loadBookConfigForTest('efnafraedi-2e');

function renderExampleContent(inner) {
  const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML"><title>T</title><metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m00001</md:content-id><md:title>T</md:title></metadata><content>${inner}</content></document>`;
  return renderCnxmlToHtml(cnxml, { moduleId: 'm00001', chapter: 3, lang: 'is' }).html;
}

describe('renderExample — equation inside a para (de-duplication)', () => {
  it('renders an in-para equation once, as a centered display block (not the inline copy)', () => {
    // The old position-sort rendered an in-para <equation> TWICE: inline at its
    // natural position via renderPara (cramped <span class="math-inline">) AND
    // as a separate centered <div class="equation"> block. Both were visible on
    // namsbokasafn.is (verified live, ch14 Dæmi 14.4/14.5). The DOM seam hoists
    // the <equation> out of the para so it renders once — as the centered
    // display block (CNXML <equation> is block-level; OpenStax renders worked
    // calculations centered, each on its own line). The cramped inline copy is
    // the artifact and must NOT survive.
    const html = renderExampleContent(
      '<example id="E"><para id="p">Hlutfallið er:<newline/>' +
        '<equation id="Q" class="unnumbered"><m:math><m:mi>EQDEDUP</m:mi></m:math></equation>' +
        'Eftirmáli.</para></example>'
    );
    // exactly one MathJax render of the equation (de-duplicated)
    expect(html.split('<mjx-container').length - 1).toBe(1);
    // it is the centered display block, not the inline copy
    expect(html).toContain('class="equation unnumbered"');
    expect(html).toContain('class="mathjax-display"');
    expect(html).not.toContain('class="math-inline"');
    // and it is hoisted to AFTER the para's setup prose (in place, not bunched
    // up at the start of the line)
    expect(html.indexOf('Hlutfallið er')).toBeLessThan(html.indexOf('class="equation unnumbered"'));
    expect(html.indexOf('Eftirmáli')).toBeLessThan(html.indexOf('class="equation unnumbered"'));
  });
});

describe('renderExample — direct-child figure (isInsidePara guard retired)', () => {
  it('keeps a direct-child figure inside the example even when a sibling para xrefs it', () => {
    // The old code used a substring guard to avoid id="X" colliding with
    // target-id="X"; the top-level DOM walk distinguishes structurally, so the
    // figure renders inside the example aside (m68700 copper pattern).
    const html = renderExampleContent(
      '<example id="E"><para id="q"><title>Útreikningur</title>Sjá (<link target-id="F"/>).</para>' +
        '<figure id="F"><media id="m" alt="a"><image mime-type="image/jpeg" src="../../media/EX_FIG.jpg"/></media><caption>Cap</caption></figure>' +
        '<para id="s"><title>Lausn</title>Svar.</para></example>'
    );
    const figIdx = html.indexOf('EX_FIG.jpg');
    const asideClose = html.indexOf('</aside>');
    expect(figIdx).toBeGreaterThan(-1);
    expect(figIdx).toBeLessThan(asideClose); // inside the example
    expect(html.split('EX_FIG.jpg').length - 1).toBe(1); // exactly once
  });
});

describe('renderExample — title containing inline markup (WS5 residual fix b)', () => {
  it('does not leak a markup <title> as literal text; renders it as the example h4', () => {
    // Real m68793 shape: the example title lives in the FIRST para's <title> and
    // contains <emphasis>/<sub> markup. The old /<title>([^<]+)<\/title>/ regex
    // could not match it → title leaked as literal <title> AND the next para's
    // plain-text title ("Lausn") wrongly became the example <h4>.
    const html = renderExampleContent(
      '<example id="E">' +
        '<para id="p1"><title>Ákvörðun á <emphasis effect="italics">E</emphasis><sub>a</sub></title>Vandamálstexti.</para>' +
        '<para id="p2"><title>Lausn</title>Lausnartexti.</para>' +
        '</example>'
    );
    // 1. no literal <title> leaked into the body — only the single <head> title
    // remains (the exact "body-leaked <title> past the head" QA signature).
    expect(html.split('<title>').length - 1).toBe(1);
    // 2. the real title is the example heading, with its markup rendered
    expect(html).toMatch(/<h4>Ákvörðun á <em>E<\/em><sub>a<\/sub><\/h4>/);
    // 3. "Lausn" is a para-title in its own position, NOT the example h4
    expect(html).not.toContain('<h4>Lausn</h4>');
    expect(html).toContain('class="para-title"');
    expect(html.indexOf('Vandamálstexti')).toBeLessThan(html.indexOf('Lausn'));
  });
});

describe('renderExample — direct-child table (WS5 residual fix b2)', () => {
  it('renders an example-child table INSIDE the aside, exactly once', () => {
    // renderExample had no `table` handler → the table escaped the aside and was
    // re-rendered by the section-level pass AFTER </aside> (m68793 tables 12.31/12.32).
    const html = renderExampleContent(
      '<example id="E"><para id="p"><title>Lausn</title>Sjá töflu:</para>' +
        '<table id="TBL" class="unnumbered"><tgroup cols="1">' +
        '<tbody><row><entry>GILDI</entry></row></tbody></tgroup></table>' +
        '</example>'
    );
    // exactly one render of the table
    expect(html.split('GILDI').length - 1).toBe(1);
    // it is inside the example aside
    const tblIdx = html.indexOf('GILDI');
    const asideClose = html.lastIndexOf('</aside>');
    expect(tblIdx).toBeGreaterThan(-1);
    expect(tblIdx).toBeLessThan(asideClose);
  });
});

describe('renderExample — table inside a para (F1b leak fix)', () => {
  it('renders a para-nested <table> as a real table, not raw <entry>/<row> text', () => {
    const html = renderExampleContent(
      '<example id="E"><para id="p"><title>Lausn</title>Gögnin:<newline/>' +
        '<table id="T" summary="s" class="unnumbered"><tgroup cols="2">' +
        '<colspec colnum="1" colname="c1"/><colspec colnum="2" colname="c2"/>' +
        '<tbody><row><entry>Tími</entry><entry>[<emphasis effect="italics">A</emphasis>]</entry></row>' +
        '<row><entry>4,0</entry><entry>0,220</entry></row></tbody>' +
        '</tgroup></table></para></example>'
    );
    expect(html).toContain('<table id="T"');
    expect(html).toContain('<td');
    expect(html).toContain('0,220');
    expect(html).toContain('<em>A</em>'); // inline cell markup preserved
    expect(html).not.toMatch(/<entry\b/); // no raw entry leak
    expect(html).not.toMatch(/<row\b/);
    expect(html).not.toMatch(/<colspec\b/);
  });
});
