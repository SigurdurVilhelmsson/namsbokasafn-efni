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
